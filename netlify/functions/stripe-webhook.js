const crypto = require('crypto');
const { updateLeadByEmail, getLeadSourceByEmail } = require('./lib/firebase-admin');
const { sendAlert } = require('./lib/alert');
const { sendMetaEvent } = require('./lib/meta-capi');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const KOIBOX_BASE = 'https://api.koibox.cloud/api';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

// GHL opportunity custom field IDs
const OPP_CF = {
  tratamiento_status: 'Hk81fRW2HaTqlry4I1L0',
  koibox_id:          'x1MAP0Om3rUW3a10ZiUe',
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_RK_KEY;
  const ghlKey = process.env.VITE_GHL_API_KEY;

  if (!stripeSecret || !stripeKey) {
    console.log('[Stripe Webhook] Missing environment variables');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  // Verify Stripe webhook signature
  const sig = event.headers['stripe-signature'];
  if (!sig) {
    return { statusCode: 400, body: 'Missing stripe-signature header' };
  }

  try {
    const stripeEvent = verifyWebhookSignature(event.body, sig, stripeSecret);

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      console.log('[Stripe Webhook] Payment completed:', session.id, 'email:', session.customer_email);

      let contactId = session.metadata?.contactId || session.payment_intent?.metadata?.contactId;

      // Fallback: if checkout was created without contactId (race in quiz, or Meta→paywall
      // direct flow where GHL contact is created async by GHL's Meta integration),
      // resolve by email so we don't drop the payment update.
      if (!contactId && ghlKey && session.customer_email) {
        contactId = await findGHLContactIdByEmail(session.customer_email, ghlKey);
        if (contactId) {
          console.log('[Stripe Webhook] Resolved contactId via email fallback:', contactId);
        } else {
          // Critical: payment succeeded but we cannot link it to any GHL contact.
          // This is the worst failure mode — alert immediately so the comercial
          // team can reach out to the patient before they think the payment was lost.
          console.log('[Stripe Webhook] No GHL contact for email:', session.customer_email);
          await sendAlert(
            'stripe-webhook',
            `Payment ${(session.amount_total / 100).toFixed(2)}€ succeeded but no GHL contact for email — manual outreach required`,
            {
              severity: 'critical',
              session_id: session.id,
              email: session.customer_email,
              cardholder: session.customer_details?.name,
              amount: session.amount_total / 100,
            }
          );
        }
      }

      // Update GHL opportunity payment_status + get koibox_id for Koibox sync
      let koiboxId = null;
      if (contactId && ghlKey) {
        koiboxId = await updateGHLOpportunity(contactId, ghlKey, session.amount_total);
      }

      // Add note to contact in GHL + manage tags
      if (contactId && ghlKey) {
        await addGHLNote(contactId, ghlKey, session);
        await updatePaymentTags(contactId, ghlKey);
      }

      // Sync payment to Koibox (only when we have an appointment — client lookup
      // by email is not reliable because Koibox /clientes/?email=X ignores the filter).
      await syncPaymentToKoibox(koiboxId, session);

      // Update Firestore lead: paymentStatus → paid
      await updateLeadByEmail(session.customer_email, {
        paymentStatus: 'paid',
        paymentAmount: session.amount_total / 100,
        stripeSessionId: session.id,
        paymentDate: new Date().toISOString(),
      });

      // Track in PostHog server-side (enrich with lead attribution)
      const leadSource = await getLeadSourceByEmail(session.customer_email);
      const amountEur = session.amount_total / 100;
      await trackServerEvent('payment_completed', {
        amount: amountEur,
        currency: session.currency,
        stripe_session_id: session.id,
        ecp: session.metadata?.ecp || '',
        ubicacion: session.metadata?.ubicacion || '',
        ghl_contact_id: contactId || '',
        ...leadSource,
      }, session.customer_email);

      // Send Purchase event to Meta CAPI (fire-and-forget, server-side)
      sendMetaEvent('Purchase', {
        email: session.customer_email,
        phone: session.customer_details?.phone,
        fbclid: leadSource.fbclid,
        eventSourceUrl: leadSource.landing_url,
        eventId: `purchase_${session.id}`,
        customData: {
          value: amountEur,
          currency: (session.currency || 'eur').toUpperCase(),
          content_name: 'bono_diagnostico',
          content_category: leadSource.nicho || 'general',
          content_ids: [session.id],
        },
      });
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
  } catch (err) {
    console.log('[Stripe Webhook] Error:', err.message);
    await sendAlert('stripe-webhook', `Payment webhook failed: ${err.message}`, {
      severity: 'critical',
      error: err.message,
      signature_present: !!sig,
    });
    return { statusCode: 400, body: `Webhook error: ${err.message}` };
  }
};

/**
 * Verify Stripe webhook signature (without stripe SDK)
 */
function verifyWebhookSignature(payload, sigHeader, secret) {
  const elements = sigHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key.trim()] = value;
    return acc;
  }, {});

  const timestamp = elements['t'];
  const signature = elements['v1'];

  if (!timestamp || !signature) {
    throw new Error('Invalid signature format');
  }

  // Reject timestamps older than 5 minutes
  const tolerance = 300;
  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(timestamp) > tolerance) {
    throw new Error('Timestamp outside tolerance');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new Error('Signature verification failed');
  }

  return JSON.parse(payload);
}

/**
 * Find and update the opportunity's tratamiento_status to 'paid'.
 * Returns the koibox_id from the opportunity (if a Koibox appointment already exists).
 */
async function updateGHLOpportunity(contactId, apiKey, amountCents) {
  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  const amount = amountCents / 100;

  try {
    // Search for open opportunities for this contact
    const searchRes = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${contactId}&status=open`,
      { headers: ghlHeaders }
    );
    const searchData = await searchRes.json();
    const opportunities = searchData?.opportunities || [];

    if (opportunities.length === 0) {
      console.log('[Stripe Webhook] No open opportunities found for contact:', contactId);
      return null;
    }

    const opp = opportunities[0];

    // GET opportunity details to read koibox_id custom field
    let koiboxId = null;
    try {
      const detailRes = await fetch(`${GHL_BASE}/opportunities/${opp.id}`, { headers: ghlHeaders });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const cfs = detail?.opportunity?.customFields || [];
        const koiboxField = cfs.find(f => f.id === OPP_CF.koibox_id);
        koiboxId = koiboxField?.value || null;
      }
    } catch (err) {
      console.log('[Stripe Webhook] Failed to read opportunity details:', err.message);
    }

    const updateRes = await fetch(`${GHL_BASE}/opportunities/${opp.id}`, {
      method: 'PUT',
      headers: ghlHeaders,
      body: JSON.stringify({
        monetaryValue: amount,
        customFields: [
          { id: OPP_CF.tratamiento_status, field_value: 'paid_125' },
        ],
      }),
    });
    console.log('[Stripe Webhook] Opportunity updated:', opp.id, 'status:', updateRes.status, 'amount:', amount, 'koiboxId:', koiboxId);

    return koiboxId;
  } catch (err) {
    console.log('[Stripe Webhook] GHL opportunity update failed:', err.message);
    return null;
  }
}

/**
 * Add a payment confirmation note to the GHL contact
 */
async function addGHLNote(contactId, apiKey, session) {
  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    const amount = (session.amount_total / 100).toFixed(2);
    const noteBody = `💳 PAGO CONFIRMADO — Test Capilar ${amount}€\nEmail: ${session.customer_email}\nStripe Session: ${session.id}\nFecha: ${new Date().toISOString()}`;

    await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ body: noteBody }),
    });
    console.log('[Stripe Webhook] Payment note added to contact:', contactId);
  } catch (err) {
    console.log('[Stripe Webhook] Note creation failed:', err.message);
  }
}

/**
 * Update GHL tags: remove bono_pendiente, add bono_pagado.
 */
async function updatePaymentTags(contactId, apiKey) {
  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    // Remove bono_pendiente tag
    await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'DELETE',
      headers: ghlHeaders,
      body: JSON.stringify({ tags: ['bono_pendiente'] }),
    });
    // Add bono_pagado tag
    await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ tags: ['bono_pagado'] }),
    });
    console.log('[Stripe Webhook] Tags updated: bono_pendiente → bono_pagado for contact:', contactId);
  } catch (err) {
    console.log('[Stripe Webhook] Tag update failed:', err.message);
  }
}

/**
 * Sync payment confirmation to Koibox.
 * Requires a koiboxId (appointment id). The appointment carries the cliente.id, so we can
 * update both appointment notes AND client notes with one reliable lookup.
 *
 * We deliberately do NOT search Koibox /clientes/?email=X — that endpoint silently ignores
 * the filter and returns clients ordered by recency, which previously caused payment notes
 * to be attached to the wrong client.
 */
async function syncPaymentToKoibox(koiboxId, session) {
  const koiboxKey = process.env.KOIBOX_API_KEY;
  if (!koiboxKey) {
    console.log('[Stripe→Koibox] No KOIBOX_API_KEY, skipping sync');
    return;
  }
  if (!koiboxId) {
    console.log('[Stripe→Koibox] No koiboxId on opportunity yet — skipping (will sync once appointment is created)');
    return;
  }

  const koiboxHeaders = {
    'X-Koibox-Key': koiboxKey,
    'Content-Type': 'application/json',
  };

  const amount = ((session.amount_total || 0) / 100).toFixed(2);
  const paymentNote = `✅ TEST CAPILAR PAGADO (${amount}€) — Stripe: ${session.id} — ${new Date().toISOString()}`;

  let appt;
  try {
    const getRes = await fetch(`${KOIBOX_BASE}/agenda/${koiboxId}/`, { headers: koiboxHeaders });
    if (!getRes.ok) {
      console.log('[Stripe→Koibox] Appointment GET failed:', getRes.status);
      return;
    }
    appt = await getRes.json();
  } catch (err) {
    console.log('[Stripe→Koibox] Appointment GET error:', err.message);
    return;
  }

  // Update appointment notes
  try {
    const existingNotes = appt.notas || '';
    await fetch(`${KOIBOX_BASE}/agenda/${koiboxId}/`, {
      method: 'PATCH',
      headers: koiboxHeaders,
      body: JSON.stringify({ notas: `${existingNotes}\n${paymentNote}`.trim() }),
    });
    console.log('[Stripe→Koibox] Appointment notes updated:', koiboxId);
  } catch (err) {
    console.log('[Stripe→Koibox] Appointment update failed:', err.message);
  }

  // Update client notes using the cliente reference on the appointment (reliable — no broken filter).
  // Koibox represents cliente as { value: <id>, text: <nombre>, email, movil, ... } on /agenda/ —
  // the id lives in `value`, NOT `id`.
  const clienteId = appt.cliente?.value;
  if (clienteId) {
    try {
      const clientRes = await fetch(`${KOIBOX_BASE}/clientes/${clienteId}/`, { headers: koiboxHeaders });
      if (clientRes.ok) {
        const client = await clientRes.json();
        const existingNotes = client.notas || '';
        await fetch(`${KOIBOX_BASE}/clientes/${clienteId}/`, {
          method: 'PATCH',
          headers: koiboxHeaders,
          body: JSON.stringify({ notas: `${existingNotes}\n${paymentNote}`.trim() }),
        });
        console.log('[Stripe→Koibox] Client notes updated:', clienteId);
      }
    } catch (err) {
      console.log('[Stripe→Koibox] Client update failed:', err.message);
    }
  }
}

/**
 * Resolve a GHL contactId from email when Stripe metadata didn't carry one.
 * Returns null if no match.
 */
async function findGHLContactIdByEmail(email, apiKey) {
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  try {
    const res = await fetch(`${GHL_BASE}/contacts/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
      body: JSON.stringify({
        locationId,
        pageLimit: 1,
        filters: [{ field: 'email', operator: 'eq', value: email }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.contacts?.[0]?.id || null;
  } catch (err) {
    console.log('[Stripe Webhook] findGHLContactIdByEmail failed:', err.message);
    return null;
  }
}

/**
 * Track an event server-side to PostHog.
 * Fire-and-forget: does not block the response.
 */
async function trackServerEvent(eventName, properties = {}, distinctId = null) {
  const posthogKey = process.env.VITE_POSTHOG_KEY;
  if (!posthogKey) return;

  const payload = {
    api_key: posthogKey,
    event: eventName,
    timestamp: new Date().toISOString(),
    properties: {
      ...properties,
      distinct_id: distinctId || 'server-anonymous',
      $lib: 'server-netlify',
    },
  };

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log('[PostHog] Server capture failed:', err.message);
  }
}

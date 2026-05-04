/**
 * Reconciliation cron — independent safety net for payment → booking flow.
 *
 * Two checks per run, each deduped via Firestore so we don't re-alert on the same session:
 *
 *   Check A (webhook health): paid sessions 5–60 min ago should have GHL contact
 *   tagged `bono_pagado` with opportunity tratamiento_status starting with `paid`.
 *   Catches any silent webhook failure (signature, GHL rate limit, code regression,
 *   transient network, etc.) regardless of cause.
 *
 *   Check B (booking SLA): paid sessions 24–48h ago should have a Koibox appointment.
 *   If still no booking at that point, comercial needs to reach out.
 *
 * Both alert via lib/alert.sendAlert (email + PostHog system_alert event).
 */

const { sendAlert } = require('./lib/alert');
const { getFirestore } = require('./lib/firebase-admin');

const STRIPE_API = 'https://api.stripe.com/v1';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const ALERTS_COLLECTION = 'reconcile_alerts';

const OPP_CF = {
  tratamiento_status: 'Hk81fRW2HaTqlry4I1L0',
  koibox_id: 'x1MAP0Om3rUW3a10ZiUe',
};

exports.handler = async () => {
  const stripeKey = process.env.STRIPE_RK_KEY;
  const ghlKey = process.env.VITE_GHL_API_KEY;
  if (!stripeKey || !ghlKey) {
    console.log('[Reconcile] Missing STRIPE_RK_KEY or VITE_GHL_API_KEY');
    return { statusCode: 200, body: JSON.stringify({ skipped: true }) };
  }

  const now = Math.floor(Date.now() / 1000);
  const checkA = await runCheckA(stripeKey, ghlKey, now);
  const checkB = await runCheckB(stripeKey, ghlKey, now);

  return {
    statusCode: 200,
    body: JSON.stringify({ checkA, checkB }),
  };
};

/**
 * Check A: 5–60 min after payment, GHL must reflect bono_pagado + paid_xxx opp status.
 */
async function runCheckA(stripeKey, ghlKey, now) {
  const result = { scanned: 0, alerts: 0, ok: 0, errors: 0 };
  const sessions = await listPaidSessions(stripeKey, now - 60 * 60, now - 5 * 60);
  result.scanned = sessions.length;

  for (const s of sessions) {
    const dedupKey = `webhook_${s.id}`;
    if (await alreadyAlerted(dedupKey)) { result.ok++; continue; }

    try {
      const status = await checkGHLPaymentSync(s, ghlKey);
      if (status.ok) { result.ok++; continue; }

      await sendAlert(
        'reconcile-payments',
        `Webhook drift: ${status.reason} — ${s.customer_email || s.customer_details?.email}`,
        {
          severity: 'critical',
          check: 'A_webhook_health',
          session_id: s.id,
          email: s.customer_email || s.customer_details?.email,
          amount: s.amount_total / 100,
          paid_at: new Date(s.created * 1000).toISOString(),
          reason: status.reason,
          ghl_contact_id: status.contactId || null,
          tags: status.tags || [],
          opp_status: status.oppStatus || null,
        }
      );
      await markAlerted(dedupKey, { check: 'A', sessionId: s.id, reason: status.reason });
      result.alerts++;
    } catch (err) {
      console.log('[Reconcile A] error on', s.id, err.message);
      result.errors++;
    }
  }
  console.log('[Reconcile A]', JSON.stringify(result));
  return result;
}

/**
 * Check B: 24–48h after payment, Koibox booking must exist.
 */
async function runCheckB(stripeKey, ghlKey, now) {
  const result = { scanned: 0, alerts: 0, booked: 0, errors: 0 };
  const sessions = await listPaidSessions(stripeKey, now - 48 * 3600, now - 24 * 3600);
  result.scanned = sessions.length;

  for (const s of sessions) {
    const dedupKey = `booking_${s.id}`;
    if (await alreadyAlerted(dedupKey)) { result.booked++; continue; }

    try {
      const status = await checkBookingExists(s, ghlKey);
      if (status.booked) { result.booked++; continue; }
      // If we couldn't even find the contact (Check A would have alerted earlier),
      // skip — that's a different alert.
      if (!status.contactId) { result.errors++; continue; }

      await sendAlert(
        'reconcile-payments',
        `Paid 24h ago, no booking yet — ${s.customer_email || s.customer_details?.email}`,
        {
          severity: 'warning',
          check: 'B_booking_sla',
          session_id: s.id,
          email: s.customer_email || s.customer_details?.email,
          amount: s.amount_total / 100,
          paid_at: new Date(s.created * 1000).toISOString(),
          ghl_contact_id: status.contactId,
          action: 'comercial: llamar al paciente para agendar manualmente',
        }
      );
      await markAlerted(dedupKey, { check: 'B', sessionId: s.id });
      result.alerts++;
    } catch (err) {
      console.log('[Reconcile B] error on', s.id, err.message);
      result.errors++;
    }
  }
  console.log('[Reconcile B]', JSON.stringify(result));
  return result;
}

async function listPaidSessions(stripeKey, sinceUnix, untilUnix) {
  const out = [];
  let starting_after = '';
  for (let page = 0; page < 5; page++) {
    const url = `${STRIPE_API}/checkout/sessions?created[gte]=${sinceUnix}&created[lte]=${untilUnix}&limit=100${starting_after ? `&starting_after=${starting_after}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${stripeKey}` } });
    if (!res.ok) break;
    const data = await res.json();
    const paid = (data.data || []).filter(s => s.payment_status === 'paid');
    out.push(...paid);
    if (!data.has_more) break;
    starting_after = data.data[data.data.length - 1].id;
  }
  return out;
}

async function checkGHLPaymentSync(session, ghlKey) {
  const email = session.customer_email || session.customer_details?.email || '';
  const contactId = session.metadata?.contactId
    || (email ? await findContactIdByEmail(email, ghlKey) : null);
  if (!contactId) {
    return { ok: false, reason: 'no_ghl_contact', contactId: null };
  }

  const ghlHeaders = {
    Authorization: `Bearer ${ghlKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  const cRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders });
  if (!cRes.ok) return { ok: false, reason: 'ghl_contact_fetch_failed', contactId };
  const cData = await cRes.json();
  const tags = cData?.contact?.tags || [];

  if (!tags.includes('bono_pagado')) {
    return { ok: false, reason: 'tag_missing_bono_pagado', contactId, tags };
  }

  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  const oppRes = await fetch(`${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${contactId}&status=open`, { headers: ghlHeaders });
  if (!oppRes.ok) return { ok: false, reason: 'ghl_opp_search_failed', contactId, tags };
  const opps = (await oppRes.json()).opportunities || [];
  if (!opps.length) return { ok: false, reason: 'no_open_opportunity', contactId, tags };

  const detailRes = await fetch(`${GHL_BASE}/opportunities/${opps[0].id}`, { headers: ghlHeaders });
  if (!detailRes.ok) return { ok: false, reason: 'ghl_opp_fetch_failed', contactId, tags };
  const detail = await detailRes.json();
  const cfs = detail?.opportunity?.customFields || [];
  const statusField = cfs.find(f => f.id === OPP_CF.tratamiento_status);
  const oppStatus = statusField?.fieldValue || statusField?.value || '';
  if (typeof oppStatus !== 'string' || !oppStatus.startsWith('paid')) {
    return { ok: false, reason: 'opp_status_not_paid', contactId, tags, oppStatus };
  }
  return { ok: true, contactId, tags, oppStatus };
}

async function checkBookingExists(session, ghlKey) {
  const email = session.customer_email || session.customer_details?.email || '';
  const contactId = session.metadata?.contactId
    || (email ? await findContactIdByEmail(email, ghlKey) : null);
  if (!contactId) return { booked: false, contactId: null };

  const ghlHeaders = {
    Authorization: `Bearer ${ghlKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  const oppRes = await fetch(`${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${contactId}&status=open`, { headers: ghlHeaders });
  if (!oppRes.ok) return { booked: false, contactId };
  const opps = (await oppRes.json()).opportunities || [];
  if (!opps.length) return { booked: false, contactId };

  const detailRes = await fetch(`${GHL_BASE}/opportunities/${opps[0].id}`, { headers: ghlHeaders });
  if (!detailRes.ok) return { booked: false, contactId };
  const detail = await detailRes.json();
  const cfs = detail?.opportunity?.customFields || [];
  const koiboxField = cfs.find(f => f.id === OPP_CF.koibox_id);
  const koiboxId = koiboxField?.fieldValue || koiboxField?.value || '';
  return { booked: !!koiboxId, contactId, koiboxId };
}

async function findContactIdByEmail(email, ghlKey) {
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  try {
    const res = await fetch(`${GHL_BASE}/contacts/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghlKey}`,
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
  } catch {
    return null;
  }
}

async function alreadyAlerted(dedupKey) {
  const db = getFirestore();
  if (!db) return false;
  try {
    const doc = await db.collection(ALERTS_COLLECTION).doc(dedupKey).get();
    return doc.exists;
  } catch {
    return false;
  }
}

async function markAlerted(dedupKey, payload) {
  const db = getFirestore();
  if (!db) return;
  try {
    await db.collection(ALERTS_COLLECTION).doc(dedupKey).set({
      ...payload,
      alertedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.log('[Reconcile] markAlerted failed:', err.message);
  }
}

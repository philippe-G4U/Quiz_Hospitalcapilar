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

// GHL calendar config (must match koibox-proxy.js)
const GHL_CALENDAR_ID = 'sMbNt8SyzfjroMbZvB74';
const GHL_CALENDAR_ASSIGNED_USER = 'mUXWEKpsLkMbJSVg96Ft';

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
  const checkC = await runCheckC(ghlKey);

  return {
    statusCode: 200,
    body: JSON.stringify({ checkA, checkB, checkC }),
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

/**
 * Check C: every quiz-driven booking from the last 4h must have a matching
 * GHL calendar event. Self-heals if missing, alerts if heal also fails.
 *
 * We iterate Firestore `quiz_leads` (not Koibox) because (a) Koibox API has no
 * created-date filter and pages over staff-managed appts, (b) we only care about
 * quiz/paywall bookings here — staff bookings legitimately don't go to GHL.
 */
async function runCheckC(ghlKey) {
  const result = { scanned: 0, healed: 0, alerts: 0, ok: 0, errors: 0 };
  const db = getFirestore();
  if (!db) { console.log('[Reconcile C] no Firestore — skipping'); return result; }

  // Window: 5 min ago (let synchronous flow finish) → 4h ago.
  const upper = new Date(Date.now() - 5 * 60_000).toISOString();
  const lower = new Date(Date.now() - 4 * 3600_000).toISOString();

  let docs;
  try {
    const snap = await db.collection('quiz_leads')
      .where('appointmentBookedAt', '>=', lower)
      .where('appointmentBookedAt', '<=', upper)
      .get();
    docs = snap.docs;
  } catch (err) {
    console.log('[Reconcile C] firestore query failed:', err.message);
    return result;
  }
  result.scanned = docs.length;

  for (const doc of docs) {
    const lead = doc.data();
    const email = (lead.email || '').toLowerCase();
    const koiboxId = lead.appointmentKoiboxId || '';
    const fecha = lead.appointmentFecha || '';
    const hora = lead.appointmentHora || '';
    if (!email || !fecha || !hora) { result.errors++; continue; }

    const dedupKey = `cal_event_${koiboxId || `${email}_${fecha}_${hora}`}`;
    if (await alreadyAlerted(dedupKey)) { result.ok++; continue; }

    try {
      const contactId = await findContactIdByEmail(email, ghlKey);
      if (!contactId) {
        // Check A would have alerted on this — skip silently here.
        result.errors++;
        continue;
      }
      const apptShape = { fecha, hora_inicio: hora, cliente: { text: lead.nombre || '' } };
      const has = await hasMatchingGHLCalendarEvent(contactId, apptShape, ghlKey);
      if (has) { result.ok++; continue; }

      // Self-heal
      const created = await createGHLCalendarEvent(contactId, apptShape, ghlKey);
      if (created.ok) {
        console.log('[Reconcile C] Self-healed cal event for lead', email, koiboxId, '→ ghl', created.id);
        result.healed++;
        await markAlerted(dedupKey, { check: 'C_healed', koiboxId, ghlEventId: created.id, email });
        await sendAlert(
          'reconcile-payments',
          `Self-healed missing GHL calendar event for ${email} (${fecha} ${hora})`,
          { severity: 'info', check: 'C_calendar_event_healed', koibox_id: koiboxId, contact_id: contactId, email, fecha, hora, ghl_event_id: created.id }
        );
      } else {
        await sendAlert(
          'reconcile-payments',
          `GHL calendar event missing AND self-heal failed for ${email} (${fecha} ${hora})`,
          { severity: 'critical', check: 'C_calendar_event', koibox_id: koiboxId, contact_id: contactId, email, fecha, hora, heal_status: created.status, heal_error: created.error }
        );
        await markAlerted(dedupKey, { check: 'C_failed', koiboxId, email });
        result.alerts++;
      }
    } catch (err) {
      console.log('[Reconcile C] error on lead', email, err.message);
      result.errors++;
    }
  }
  console.log('[Reconcile C]', JSON.stringify(result));
  return result;
}

async function hasMatchingGHLCalendarEvent(contactId, appt, ghlKey) {
  const ghlHeaders = {
    Authorization: `Bearer ${ghlKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/appointments`, { headers: ghlHeaders });
  if (!res.ok) return false;
  const data = await res.json();
  const events = data.events || data.appointments || [];
  if (!events.length) return false;
  // Loose match: any event for this contact whose startTime falls on the same date.
  return events.some(e => (e.startTime || '').startsWith(appt.fecha));
}

async function createGHLCalendarEvent(contactId, appt, ghlKey) {
  try {
    const probe = new Date(`${appt.fecha}T${appt.hora_inicio}:00Z`);
    const madridStr = probe.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
    const madridDate = new Date(madridStr + ' UTC');
    const offsetH = Math.round((madridDate - probe) / 3600_000);
    const offsetStr = `${offsetH >= 0 ? '+' : '-'}${String(Math.abs(offsetH)).padStart(2, '0')}:00`;
    const startLocal = `${appt.fecha}T${appt.hora_inicio}:00${offsetStr}`;
    const startDate = new Date(startLocal);
    const endDate = new Date(startDate.getTime() + 30 * 60_000);

    const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
    const payload = {
      calendarId: GHL_CALENDAR_ID,
      locationId,
      contactId,
      assignedUserId: GHL_CALENDAR_ASSIGNED_USER,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      title: `Diagnóstico Capilar - ${appt.cliente?.text || 'Paciente'}`,
      appointmentStatus: 'confirmed',
      toNotify: false,
      selectedTimezone: 'Europe/Madrid',
      ignoreFreeSlotValidation: true,
    };
    const res = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ghlKey}`, 'Content-Type': 'application/json', Version: '2021-07-28' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, id: data.id || data.event?.id };
    return { ok: false, status: res.status, error: JSON.stringify(data).slice(0, 300) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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

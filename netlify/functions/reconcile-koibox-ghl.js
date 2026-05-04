// Scheduled every 15 min (netlify.toml). Closes the sync gap when staff edit
// or cancel appointments directly in Koibox — without this, GHL keeps the
// original hora_cita and sends WhatsApp reminders with the wrong time.
//
// Flow:
//   1. Pull Koibox agenda for [today, today+5 days].
//   2. Filter to our two services (diagnóstico 103385, asesoría 103373).
//   3. For each, find GHL contact (by koibox_id on opp, else by email/phone).
//   4. Compare fecha/hora/estado → update GHL contact + opp + add audit note.

const KOIBOX_BASE = 'https://api.koibox.cloud/api';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_LOCATION = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
const GHL_CALENDAR_ID = 'sMbNt8SyzfjroMbZvB74'; // Calendario HC (producción)
// Fallback when no prior assigned user can be reused. ignoreFreeSlotValidation
// requires an assignedUserId, so we need a real team member id to fall back to.
const GHL_DEFAULT_ASSIGNED_USER = 'mUXWEKpsLkMbJSVg96Ft';

const OUR_SERVICES = new Set([103385, 103373]); // diagnóstico, asesoría
const WINDOW_DAYS = 5;

const CONTACT_CF = {
  fecha_cita:   'yEjha5MpjAeDrrUfFmur',
  hora_cita:    'KX7eyTmYQKbi0937Wj9I',
  clinica_cita: 'upGgK5yc0bSDwqC99DkZ',
};

const OPP_CF = {
  koibox_id:      'x1MAP0Om3rUW3a10ZiUe',
  fecha_cita_opp: 'RXAkzlyYHnz4MjYuYaml',
  hora_cita_opp:  'age1q0r6Ek0PQztGZ4FJ',
};

const PIPELINE_STAGE_CANCELLED = 'c961b576-b14d-43a6-ac75-a26695886d58';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function getCf(fields, id) {
  const f = (fields || []).find((x) => x.id === id);
  return (f?.value ?? f?.fieldValue ?? '').toString();
}

async function fetchKoiboxAppointments(from, to, headers) {
  const all = [];
  let url = `${KOIBOX_BASE}/agenda/?fecha__gte=${from}&fecha__lte=${to}&limit=50`;
  let pages = 0;
  while (url && pages < 40) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.log(`[Reconcile] Koibox fetch failed: ${res.status}`);
      break;
    }
    const data = await res.json();
    all.push(...(data.results || []));
    url = data.next || null;
    pages += 1;
    if (url) await sleep(100);
  }
  return all;
}

async function findGhlContact({ email, phone }, headers) {
  const tries = [];
  if (email) tries.push(`email=${encodeURIComponent(email)}`);
  if (phone) tries.push(`number=${encodeURIComponent(phone)}`);
  for (const q of tries) {
    const res = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${GHL_LOCATION}&${q}`,
      { headers }
    );
    if (!res.ok) continue;
    const data = await res.json();
    if (data?.contact?.id) return data.contact.id;
  }
  return null;
}

async function findOppByKoiboxId(contactId, koiboxId, headers) {
  const res = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${GHL_LOCATION}&contact_id=${contactId}`,
    { headers }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const opps = data?.opportunities || [];

  const byId = opps.find((o) => {
    const detailCf = o.customFields || [];
    return getCf(detailCf, OPP_CF.koibox_id) === String(koiboxId);
  });
  if (byId) return byId;

  for (const o of opps) {
    const detail = await fetch(`${GHL_BASE}/opportunities/${o.id}`, { headers });
    if (!detail.ok) continue;
    const od = await detail.json();
    if (getCf(od?.opportunity?.customFields, OPP_CF.koibox_id) === String(koiboxId)) {
      return od.opportunity;
    }
  }
  return opps[0] || null;
}

async function patchContact(contactId, fields, headers) {
  return fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ customFields: fields }),
  });
}

async function patchOpp(oppId, body, headers) {
  return fetch(`${GHL_BASE}/opportunities/${oppId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

async function addNote(contactId, body, headers) {
  return fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
}

async function listGhlAppointments(contactId, headers) {
  const r = await fetch(`${GHL_BASE}/contacts/${contactId}/appointments`, { headers });
  if (!r.ok) return [];
  const d = await r.json();
  return d.events || d.appointments || [];
}

async function cancelGhlAppointment(eventId, headers) {
  return fetch(`${GHL_BASE}/calendars/events/appointments/${eventId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ appointmentStatus: 'cancelled' }),
  });
}

function buildIso(fecha, hora) {
  const probe = new Date(`${fecha}T${hora}:00Z`);
  const madridStr = probe.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
  const madridDate = new Date(madridStr + ' UTC');
  const offsetH = Math.round((madridDate - probe) / 3600000);
  const offset = `${offsetH >= 0 ? '+' : '-'}${String(Math.abs(offsetH)).padStart(2, '0')}:00`;
  const start = new Date(`${fecha}T${hora}:00${offset}`);
  const end = new Date(start.getTime() + 30 * 60000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function createGhlAppointment(contactId, fecha, hora, name, assignedUserId, headers) {
  const { start, end } = buildIso(fecha, hora);
  const payload = {
    calendarId: GHL_CALENDAR_ID,
    locationId: GHL_LOCATION,
    contactId,
    assignedUserId: assignedUserId || GHL_DEFAULT_ASSIGNED_USER,
    startTime: start,
    endTime: end,
    title: `Consulta Capilar - ${name || 'Paciente'}`,
    appointmentStatus: 'confirmed',
    toNotify: false, // CFs already drive reminders; avoid double-notifying patient
    selectedTimezone: 'Europe/Madrid',
    ignoreFreeSlotValidation: true, // reconciling outside calendar slot rules
  };
  return fetch(`${GHL_BASE}/calendars/events/appointments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

function eventMatchesKoibox(event, koiboxFecha, koiboxHora) {
  if (!event.startTime) return false;
  // Parse ISO and convert to Madrid local for comparison with koibox YYYY-MM-DD + HH:MM
  const dt = new Date(event.startTime);
  if (isNaN(dt)) return false;
  const madridStr = dt.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }); // "2026-05-07 18:30:00"
  const [date, time] = madridStr.split(' ');
  return date === koiboxFecha && (time || '').slice(0, 5) === koiboxHora;
}

function isActiveEvent(e) {
  const status = e.appointmentStatus || e.appoinmentStatus || '';
  return status !== 'cancelled' && !e.deleted;
}

// Sync GHL calendar events to match Koibox state. Cancels mismatched active
// events and creates a new one when needed. Reuses assignedUserId from the
// most recent cancelled-or-active event so the same staff member stays on
// the patient (avoids round-robin reassignment on every reschedule).
async function syncGhlCalendar(contactId, contactName, koiboxFecha, koiboxHora, isCancelled, headers) {
  const events = await listGhlAppointments(contactId, headers);
  const active = events.filter(isActiveEvent);

  if (isCancelled) {
    for (const ev of active) {
      try { await cancelGhlAppointment(ev.id, headers); } catch (_) {}
    }
    return { cancelled: active.length, created: false };
  }

  const matching = active.find((e) => eventMatchesKoibox(e, koiboxFecha, koiboxHora));
  if (matching) return { cancelled: 0, created: false }; // already in sync

  // Cancel any active events that don't match, then create one matching Koibox
  for (const ev of active) {
    try { await cancelGhlAppointment(ev.id, headers); } catch (_) {}
  }

  // Reuse assignedUserId from most recent event (active or cancelled) so the
  // same staff member stays on the patient.
  const sortedByStart = [...events].sort((a, b) =>
    (b.startTime || '').localeCompare(a.startTime || '')
  );
  const reuseUser = sortedByStart.find((e) => e.assignedUserId)?.assignedUserId;

  const createRes = await createGhlAppointment(contactId, koiboxFecha, koiboxHora, contactName, reuseUser, headers);
  if (!createRes.ok) {
    const txt = await createRes.text();
    console.log(`[Reconcile] Calendar create failed contact=${contactId}: ${createRes.status} ${txt.slice(0, 200)}`);
    return { cancelled: active.length, created: false, error: createRes.status };
  }
  return { cancelled: active.length, created: true };
}

function clinicaFromProvinciaId(id) {
  if (id === 680) return 'Madrid';
  if (id === 697) return 'Murcia';
  if (id === 718) return 'Pontevedra';
  return '';
}

async function reconcileOne(appt, ghlHeaders, stats) {
  const koiboxId = appt.id;
  const servicioIds = (appt.servicios || []).map((s) => s.id || s.value);
  if (!servicioIds.some((id) => OUR_SERVICES.has(id))) return;

  const email = appt.cliente?.email || '';
  const phone = appt.cliente?.movil || '';
  if (!email && !phone) return;

  const estadoId = appt.estado?.id;
  const isCancelled = estadoId === 5;
  const koiboxFecha = appt.fecha || '';
  const koiboxHora = (appt.hora_inicio || '').slice(0, 5);
  const clinica = clinicaFromProvinciaId(appt.cliente?.localidad) || '';

  const contactId = await findGhlContact({ email, phone }, ghlHeaders);
  if (!contactId) {
    stats.skippedNoContact += 1;
    return;
  }

  const contactRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders });
  if (!contactRes.ok) return;
  const contact = (await contactRes.json()).contact || {};
  const cfs = contact.customFields || [];

  const ghlFecha = getCf(cfs, CONTACT_CF.fecha_cita);
  const ghlHora = getCf(cfs, CONTACT_CF.hora_cita);

  const opp = await findOppByKoiboxId(contactId, koiboxId, ghlHeaders);
  const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');

  if (isCancelled) {
    const cfsAlreadyClear = !ghlFecha && !ghlHora && (!opp || opp.pipelineStageId === PIPELINE_STAGE_CANCELLED);

    if (!cfsAlreadyClear) {
      await patchContact(
        contactId,
        [
          { id: CONTACT_CF.fecha_cita, field_value: '' },
          { id: CONTACT_CF.hora_cita, field_value: '' },
          { id: CONTACT_CF.clinica_cita, field_value: '' },
        ],
        ghlHeaders
      );

      if (opp && opp.pipelineStageId !== PIPELINE_STAGE_CANCELLED) {
        await patchOpp(
          opp.id,
          {
            pipelineStageId: PIPELINE_STAGE_CANCELLED,
            customFields: [
              { id: OPP_CF.fecha_cita_opp, field_value: '' },
              { id: OPP_CF.hora_cita_opp, field_value: '' },
              { id: OPP_CF.koibox_id, field_value: '' },
            ],
          },
          ghlHeaders
        );
      }
    }

    // Cancel any active GHL calendar events even if CFs were already clear,
    // since the calendar can drift independently from the CFs.
    const calRes = await syncGhlCalendar(contactId, contactName, '', '', true, ghlHeaders);

    if (!cfsAlreadyClear || calRes.cancelled > 0) {
      await addNote(
        contactId,
        `🔄 RECONCILE — cita cancelada en Koibox (#${koiboxId}). Sincronizado a GHL${calRes.cancelled > 0 ? ` (eventos cancelados: ${calRes.cancelled})` : ''}. ${new Date().toISOString()}`,
        ghlHeaders
      );
      stats.cancelled += 1;
      console.log(`[Reconcile] Cancelled koibox=${koiboxId} contact=${contactId} ghlEventsCancelled=${calRes.cancelled}`);
    }
    return;
  }

  const fechaDiff = ghlFecha && ghlFecha !== koiboxFecha;
  const horaDiff = ghlHora && ghlHora !== koiboxHora;

  // Always sync calendar — the GHL calendar event can drift from CFs even when
  // CFs match Koibox (e.g. reschedules done outside our flow that updated only CFs).
  const calSync = await syncGhlCalendar(contactId, contactName, koiboxFecha, koiboxHora, false, ghlHeaders);

  if (!fechaDiff && !horaDiff) {
    if (calSync.created || calSync.cancelled > 0) {
      await addNote(
        contactId,
        `🔄 RECONCILE — calendar resincronizado (Koibox #${koiboxId} ${koiboxFecha} ${koiboxHora}). Cancelados: ${calSync.cancelled}, creado nuevo: ${calSync.created}. ${new Date().toISOString()}`,
        ghlHeaders
      );
      stats.calendarOnly = (stats.calendarOnly || 0) + 1;
      console.log(`[Reconcile] Calendar-only sync koibox=${koiboxId} contact=${contactId} cancelled=${calSync.cancelled} created=${calSync.created}`);
    }
    return;
  }

  await patchContact(
    contactId,
    [
      { id: CONTACT_CF.fecha_cita, field_value: koiboxFecha },
      { id: CONTACT_CF.hora_cita, field_value: koiboxHora },
      ...(clinica ? [{ id: CONTACT_CF.clinica_cita, field_value: clinica }] : []),
    ],
    ghlHeaders
  );

  if (opp) {
    await patchOpp(
      opp.id,
      {
        customFields: [
          { id: OPP_CF.fecha_cita_opp, field_value: koiboxFecha },
          { id: OPP_CF.hora_cita_opp, field_value: koiboxHora },
          { id: OPP_CF.koibox_id, field_value: String(koiboxId) },
        ],
      },
      ghlHeaders
    );
  }

  await addNote(
    contactId,
    `🔄 RECONCILE — cita reagendada en Koibox (#${koiboxId}). GHL CFs: ${ghlFecha} ${ghlHora} → Koibox: ${koiboxFecha} ${koiboxHora}. Calendar: cancelados ${calSync.cancelled}, creado nuevo: ${calSync.created}. ${new Date().toISOString()}`,
    ghlHeaders
  );

  stats.updated += 1;
  console.log(
    `[Reconcile] Updated koibox=${koiboxId} contact=${contactId} ${ghlFecha} ${ghlHora} → ${koiboxFecha} ${koiboxHora}`
  );
}

exports.handler = async () => {
  const koiboxKey = process.env.KOIBOX_API_KEY;
  const ghlKey = process.env.VITE_GHL_API_KEY;
  if (!koiboxKey || !ghlKey) {
    console.log('[Reconcile] Missing API keys, skipping');
    return { statusCode: 500, body: 'missing keys' };
  }

  const koiboxHeaders = { 'X-Koibox-Key': koiboxKey, 'Content-Type': 'application/json' };
  const ghlHeaders = {
    Authorization: `Bearer ${ghlKey}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  };

  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + WINDOW_DAYS);

  const appts = await fetchKoiboxAppointments(ymd(today), ymd(end), koiboxHeaders);
  console.log(`[Reconcile] Koibox appointments in window: ${appts.length}`);

  const stats = { checked: 0, updated: 0, cancelled: 0, calendarOnly: 0, skippedNoContact: 0, errors: 0 };

  for (const appt of appts) {
    stats.checked += 1;
    try {
      await reconcileOne(appt, ghlHeaders, stats);
    } catch (err) {
      stats.errors += 1;
      console.log(`[Reconcile] Error koibox=${appt.id}: ${err.message}`);
    }
    await sleep(150);
  }

  console.log('[Reconcile] Done', JSON.stringify(stats));
  return { statusCode: 200, body: JSON.stringify(stats) };
};

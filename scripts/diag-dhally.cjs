#!/usr/bin/env node
// Read-only diag for Dhally (or any contactId): prints GHL contact CFs, opportunity
// koibox_id/payment, GHL calendar appointments, and Koibox agenda for that fecha_cita.
// Usage: node scripts/diag-dhally.cjs [contactId]
require('dotenv').config();

const GHL_BASE = 'https://services.leadconnectorhq.com';
const KOIBOX_BASE = 'https://api.koibox.cloud/api';
const GHL_KEY = process.env.VITE_GHL_API_KEY;
const KOIBOX_KEY = process.env.KOIBOX_API_KEY;
const GHL_LOCATION = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';

const CONTACT_ID = process.argv[2] || 'ghWNoCiLTarsr0b1eO8G';

const CF = {
  ecp: 'cFIcdJlT9sfnC3KMSwDD',
  sexo: 'P7D2edjnOHwXLpglw9tB',
  ubicacion: 'LygjPVQnLbqqdL4eqQwT',
  link_agendar: 'UdbclFWU2YGw0YYup4vm',
  fecha_cita: 'yEjha5MpjAeDrrUfFmur',
  hora_cita: 'KX7eyTmYQKbi0937Wj9I',
  clinica_cita: 'upGgK5yc0bSDwqC99DkZ',
  koibox_id_opp: 'x1MAP0Om3rUW3a10ZiUe',
  payment_status_opp: 'Hk81fRW2HaTqlry4I1L0',
  fecha_cita_opp: 'RXAkzlyYHnz4MjYuYaml',
  hora_cita_opp: 'age1q0r6Ek0PQztGZ4FJ',
};

const ghlHeaders = { Authorization: `Bearer ${GHL_KEY}`, Version: '2021-07-28' };
const koiboxHeaders = { 'X-Koibox-Key': KOIBOX_KEY };

const getCf = (cfs, id) => {
  const f = (cfs || []).find((x) => x.id === id);
  return (f?.value ?? f?.fieldValue ?? '').toString();
};

async function main() {
  if (!GHL_KEY || !KOIBOX_KEY) {
    console.error('Missing VITE_GHL_API_KEY or KOIBOX_API_KEY in .env');
    process.exit(1);
  }

  console.log('═══ CONTACT', CONTACT_ID, '═══');
  const cRes = await fetch(`${GHL_BASE}/contacts/${CONTACT_ID}`, { headers: ghlHeaders });
  if (!cRes.ok) {
    console.error('Contact fetch failed:', cRes.status, await cRes.text());
    process.exit(1);
  }
  const c = (await cRes.json()).contact || {};
  const cfs = c.customFields || [];
  console.log('name :', [c.firstName, c.lastName].filter(Boolean).join(' '));
  console.log('email:', c.email);
  console.log('phone:', c.phone);
  console.log('tags :', (c.tags || []).join(', '));
  console.log('--- CFs ---');
  console.log('fecha_cita  :', getCf(cfs, CF.fecha_cita));
  console.log('hora_cita   :', getCf(cfs, CF.hora_cita));
  console.log('clinica_cita:', getCf(cfs, CF.clinica_cita));
  console.log('sexo        :', getCf(cfs, CF.sexo));
  console.log('ubicacion   :', getCf(cfs, CF.ubicacion));
  console.log('link_agendar:', getCf(cfs, CF.link_agendar));

  console.log('\n═══ OPPORTUNITIES ═══');
  const oppRes = await fetch(
    `${GHL_BASE}/opportunities/search?location_id=${GHL_LOCATION}&contact_id=${CONTACT_ID}`,
    { headers: ghlHeaders }
  );
  const oppData = await oppRes.json();
  const opps = oppData?.opportunities || [];
  console.log('count:', opps.length);
  for (const o of opps) {
    const detail = await (await fetch(`${GHL_BASE}/opportunities/${o.id}`, { headers: ghlHeaders })).json();
    const oCfs = detail?.opportunity?.customFields || [];
    console.log('-', o.id, '| status:', o.status, '| stage:', o.pipelineStageId);
    console.log('    koibox_id     :', getCf(oCfs, CF.koibox_id_opp));
    console.log('    payment_status:', getCf(oCfs, CF.payment_status_opp));
    console.log('    fecha_cita_opp:', getCf(oCfs, CF.fecha_cita_opp));
    console.log('    hora_cita_opp :', getCf(oCfs, CF.hora_cita_opp));
  }

  console.log('\n═══ GHL CALENDAR APPOINTMENTS ═══');
  // window: today → +30d
  const startMs = Date.now();
  const endMs = startMs + 30 * 24 * 3600 * 1000;
  const apptUrl = `${GHL_BASE}/contacts/${CONTACT_ID}/appointments`;
  const apptRes = await fetch(apptUrl, { headers: ghlHeaders });
  if (!apptRes.ok) {
    console.log('appointments fetch failed:', apptRes.status, await apptRes.text());
  } else {
    const apptData = await apptRes.json();
    const events = apptData?.events || apptData?.appointments || [];
    console.log('count:', events.length);
    for (const e of events) {
      console.log('-', e.id, '|', e.startTime, '→', e.endTime, '| status:', e.appointmentStatus, '| cal:', e.calendarId, '| title:', e.title);
    }
  }

  console.log('\n═══ KOIBOX AGENDA — fecha del CF ═══');
  const fechaCita = getCf(cfs, CF.fecha_cita).slice(0, 10);
  if (!fechaCita) {
    console.log('(no fecha_cita CF, skipping Koibox agenda lookup)');
    return;
  }
  // Search Koibox by client (email/phone) for that day
  const phone = c.phone || '';
  const koiUrl = `${KOIBOX_BASE}/agenda/?fecha=${fechaCita}&limit=200`;
  const kRes = await fetch(koiUrl, { headers: koiboxHeaders });
  const kData = await kRes.json();
  const all = kData?.results || [];
  const matches = all.filter((a) => {
    const m = a.cliente?.movil || '';
    const e = a.cliente?.email || '';
    return (phone && m && m.replace(/\D/g, '').endsWith(phone.replace(/\D/g, '').slice(-9))) ||
           (c.email && e && e.toLowerCase() === c.email.toLowerCase());
  });
  console.log(`koibox total on ${fechaCita}:`, all.length, '| matches for this contact:', matches.length);
  for (const a of matches) {
    console.log('- id:', a.id, '|', a.fecha, a.hora_inicio, '→', a.hora_fin,
      '| estado:', a.estado?.id, a.estado?.text,
      '| servicios:', (a.servicios || []).map((s) => s.id || s.value).join(','),
      '| user:', typeof a.user === 'object' ? a.user.value : a.user);
  }
  if (matches.length === 0) {
    console.log('⚠️  No Koibox appointment matches this contact on', fechaCita);
    console.log('    → CF says fecha_cita exists, but Koibox has no booking');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

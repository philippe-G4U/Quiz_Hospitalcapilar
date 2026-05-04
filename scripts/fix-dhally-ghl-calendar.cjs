#!/usr/bin/env node
// One-off: fix Dhally Jaimes (contact ghWNoCiLTarsr0b1eO8G).
// - Cancels stale GHL calendar event CcwhORzDYFZmvxob1jlJ (2026-04-29 19:00).
// - Creates a new GHL calendar event for 2026-05-07 18:30 → 19:00 matching Koibox 43205209.
// Pass --dry to preview without writing.
require('dotenv').config();

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_KEY = process.env.VITE_GHL_API_KEY;
const GHL_LOCATION = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
const GHL_CALENDAR_ID = 'sMbNt8SyzfjroMbZvB74'; // Calendario HC (producción) — same one syncAppointmentToGHL uses

const DRY = process.argv.includes('--dry');
const CONTACT_ID = 'ghWNoCiLTarsr0b1eO8G';
const STALE_EVENT_ID = 'CcwhORzDYFZmvxob1jlJ';
const NEW_FECHA = '2026-05-07';
const NEW_HORA = '18:30';
const NOMBRE = 'Dhally Jaimes';

const headers = {
  Authorization: `Bearer ${GHL_KEY}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
};

function spainOffset(fecha, hora) {
  const probe = new Date(`${fecha}T${hora}:00Z`);
  const madridStr = probe.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
  const madridDate = new Date(madridStr + ' UTC');
  const offsetHours = Math.round((madridDate - probe) / 3600000);
  return `${offsetHours >= 0 ? '+' : '-'}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;
}

async function cancelStale() {
  console.log('\n─── 1. Cancel stale event', STALE_EVENT_ID, '───');
  if (DRY) { console.log('  [DRY] would PUT appointmentStatus=cancelled'); return; }
  const res = await fetch(`${GHL_BASE}/calendars/events/appointments/${STALE_EVENT_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ appointmentStatus: 'cancelled' }),
  });
  console.log('  status:', res.status);
  console.log('  body  :', (await res.text()).slice(0, 300));
}

async function createNew() {
  console.log('\n─── 2. Create new event', NEW_FECHA, NEW_HORA, '───');
  const offset = spainOffset(NEW_FECHA, NEW_HORA);
  const startLocal = `${NEW_FECHA}T${NEW_HORA}:00${offset}`;
  const startDate = new Date(startLocal);
  const endDate = new Date(startDate.getTime() + 30 * 60000);
  const payload = {
    calendarId: GHL_CALENDAR_ID,
    locationId: GHL_LOCATION,
    contactId: CONTACT_ID,
    startTime: startDate.toISOString(),
    endTime: endDate.toISOString(),
    title: `Consulta Asesoría - ${NOMBRE}`,
    appointmentStatus: 'confirmed',
    toNotify: false,
    selectedTimezone: 'Europe/Madrid',
    ignoreFreeSlotValidation: true,
  };
  console.log('  payload:', JSON.stringify(payload, null, 2));
  if (DRY) { console.log('  [DRY] would POST'); return; }
  const res = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  console.log('  status:', res.status);
  console.log('  body  :', (await res.text()).slice(0, 400));
}

async function addNote() {
  console.log('\n─── 3. Add audit note ───');
  const body = `🔧 FIX MANUAL — GHL calendar resincronizado con Koibox.\nEvento viejo (${STALE_EVENT_ID}, 2026-04-29 19:00) cancelado.\nNuevo evento creado para ${NEW_FECHA} ${NEW_HORA} (Koibox #43205209).\n${new Date().toISOString()}`;
  if (DRY) { console.log('  [DRY] note:', body); return; }
  const res = await fetch(`${GHL_BASE}/contacts/${CONTACT_ID}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  console.log('  status:', res.status);
}

async function main() {
  if (!GHL_KEY) { console.error('Missing VITE_GHL_API_KEY'); process.exit(1); }
  console.log(DRY ? '[DRY RUN]' : '[LIVE]', 'Fixing contact', CONTACT_ID);
  await cancelStale();
  await createNew();
  await addNote();
  console.log('\n✓ done');
}
main().catch((e) => { console.error(e); process.exit(1); });

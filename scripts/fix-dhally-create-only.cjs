#!/usr/bin/env node
// Retry: create the GHL calendar event for Dhally with ignoreFreeSlotValidation.
// Cancel and note already ran in fix-dhally-ghl-calendar.cjs.
require('dotenv').config();

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_KEY = process.env.VITE_GHL_API_KEY;
const GHL_LOCATION = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
const GHL_CALENDAR_ID = 'sMbNt8SyzfjroMbZvB74';

const headers = {
  Authorization: `Bearer ${GHL_KEY}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
};

async function main() {
  const payload = {
    calendarId: GHL_CALENDAR_ID,
    locationId: GHL_LOCATION,
    contactId: 'ghWNoCiLTarsr0b1eO8G',
    assignedUserId: 'mUXWEKpsLkMbJSVg96Ft',
    startTime: '2026-05-07T16:30:00.000Z', // 18:30 CEST
    endTime: '2026-05-07T17:00:00.000Z',
    title: 'Consulta Asesoría - Dhally Jaimes',
    appointmentStatus: 'confirmed',
    toNotify: false,
    selectedTimezone: 'Europe/Madrid',
    ignoreFreeSlotValidation: true,
  };
  console.log('payload:', JSON.stringify(payload, null, 2));
  const res = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  console.log('status:', res.status);
  console.log('body  :', (await res.text()).slice(0, 600));
}
main();

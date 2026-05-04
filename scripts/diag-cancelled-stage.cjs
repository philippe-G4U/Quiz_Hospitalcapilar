// Inspecciona los 17 opps en Lost/Cancelled stage para ver si son
// cancelaciones reales o restos de viejas "Lost" que deberían moverse a Abandoned.
require('dotenv').config();

const KEY = process.env.VITE_GHL_API_KEY;
const LOC = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
const PIPELINE = 'xXCgpUIEizlqdrmGrJkg';
const CANCELLED_STAGE = 'c961b576-b14d-43a6-ac75-a26695886d58';
const BASE = 'https://services.leadconnectorhq.com';
const h = { Authorization: 'Bearer ' + KEY, Version: '2021-07-28' };

async function fetchAllOpps() {
  let all = [], startAfterId = '', hasMore = true, guard = 0;
  while (hasMore && guard++ < 50) {
    const url = `${BASE}/opportunities/search?location_id=${LOC}&pipeline_id=${PIPELINE}&limit=100${startAfterId ? `&startAfterId=${startAfterId}` : ''}`;
    const r = await fetch(url, { headers: h });
    if (!r.ok) break;
    const d = await r.json();
    const opps = d.opportunities || [];
    all = all.concat(opps);
    hasMore = opps.length >= 100;
    if (hasMore) startAfterId = opps[opps.length - 1].id;
  }
  return all;
}

async function fetchContact(id) {
  try {
    const r = await fetch(`${BASE}/contacts/${id}`, { headers: h });
    if (!r.ok) return null;
    return (await r.json()).contact;
  } catch { return null; }
}

(async () => {
  const opps = await fetchAllOpps();
  const FROM_TS = new Date('2026-04-09T00:00:00Z').getTime();
  const cancelled = opps.filter(o => o.pipelineStageId === CANCELLED_STAGE
    && new Date(o.createdAt||0).getTime() >= FROM_TS);
  console.log('Opps en Lost/Cancelled (rango actual):', cancelled.length);
  console.log('');

  // Get unique contacts and their tags
  const seen = new Set();
  for (const o of cancelled) {
    if (!o.contactId || seen.has(o.contactId)) continue;
    seen.add(o.contactId);
    const c = await fetchContact(o.contactId);
    if (!c) { console.log(' ', o.contactId, '(contact fetch failed)'); continue; }
    const tags = (c.tags||[]).join(',');
    const hasCancelTag = (c.tags||[]).some(t => /cancel|cita_cancelada/i.test(t));
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || '';
    console.log(' ', name.padEnd(28).slice(0,28),
      '| email='+(c.email||'').padEnd(30).slice(0,30),
      '| stage_change='+(o.lastStageChangeAt||'').slice(0,10),
      '| cancelTag='+hasCancelTag,
      '| tags=['+tags+']');
  }
})();

// Scheduled every 5 min (netlify.toml). Catches Meta-direct leads that arrive
// in GHL via the native Facebook Lead Form integration but bypass our quiz
// flow, so they never get link_agendar / link_paywall populated. Without this
// the auto-reply WhatsApp goes out with an empty link.
//
// Logic mirrors scripts/enrich-meta-leads.cjs:
//   - Search GHL contacts created in last 24h with source containing "Facebook".
//   - Skip ones that already have link_agendar matching the canonical format.
//   - PUT link_agendar + link_paywall on the contact, link_agendados on the
//     open opportunity, then add the meta_form_directo tag.
//
// Idempotent: re-running on a populated contact is a no-op (skip path).

const { fetchRecentMetaLeads } = require('./lib/meta-leads-fetcher');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_LOCATION = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
const CONTACT_LINK_AGENDAR_CF = 'UdbclFWU2YGw0YYup4vm';
const CONTACT_LINK_PAYWALL_CF = 'uRxexlYy8HItx45Z7sih';
const CONTACT_DOOR_CF         = '2JYlfGk60lHbuyh9vcdV'; // SINGLE_OPTIONS: quiz_corto|quiz_largo|form|meta_form_directo
const OPP_LINK_AGENDADOS_CF   = 'eHCAvPZKNph7h15z1gGt';
// UTM CFs (mirror of dashboard-data.js GHL_CF map)
const CONTACT_UTM_SOURCE_CF   = 'MisB9YJJAH7cnh8JOtQn';
const CONTACT_UTM_MEDIUM_CF   = 'vykx7m6bcfbYMXRqToYP';
const CONTACT_UTM_CAMPAIGN_CF = '3fUI7GO9o7oZ7ddMNnFf';
const CONTACT_UTM_CONTENT_CF  = 'dydSaUSYbb5R7nYOboLq';
const CONTACT_UTM_TERM_CF     = 'eLdhsOthmyD38al527tG';

// 30 days lookback so the cron can backfill historical contacts that
// were created before Meta's leads_retrieval permission was granted.
// Once everything is enriched (after ~1 cron cycle) this could go back
// to 24h for normal operation, but 30d is safe and idempotent.
const LOOKBACK_HOURS = 24 * 30;

function buildLink(c) {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return `https://diagnostico.hospitalcapilar.com/agendar?contactId=${c.id}`
    + `&nombre=${encodeURIComponent(fullName)}`
    + `&email=${encodeURIComponent(c.email || '')}`
    + `&phone=${encodeURIComponent(c.phone || '')}`
    + `&tipo=diagnostico`;
}

function buildPaywallLink(c) {
  const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return `https://diagnostico.hospitalcapilar.com/p/?ecp=protocolo-mujer&contactId=${c.id}`
    + `&nombre=${encodeURIComponent(fullName)}`
    + `&email=${encodeURIComponent(c.email || '')}`
    + `&telefono=${encodeURIComponent(c.phone || '')}`;
}

// Meta Lead Forms can be served on Facebook OR Instagram. The /contacts/search
// endpoint does NOT return `createdBy`, so we can't rely on createdBy.sourceId
// to identify Instagram leads. Instead we filter orphans by what they LACK:
//   - empty link_agendar field (Quiz/Form leads always have one set by ghl-proxy)
//   - source does not look like a Quiz/Form internal flow
//   - not blocked / spammy (must have email or phone)
// This catches Meta Facebook + Meta Instagram + any other native integration
// lead missing the link, while skipping our own Quiz/Form leads (which are
// already enriched at creation).

function isQuizOrFormSource(c) {
  const src = (c.source || '').toLowerCase();
  return src.includes('quiz') || src.includes('form-') || src.includes(' form ') || src.startsWith('form ');
}

function isOrphanCandidate(c) {
  // Must have at least email or phone (skip ghost/blocked contacts).
  if (!c.email && !c.phone) return false;
  // Skip our own quiz/form pipeline — those are populated at creation.
  if (isQuizOrFormSource(c)) return false;
  // Skip if blocked tag present (Instagram comment-spam, etc.)
  const tags = (c.tags || []).map(t => (t || '').toLowerCase());
  if (tags.includes('blocked')) return false;
  // NOTE: we DON'T skip on hasLink anymore — enrichOne returns skipped=true
  // if both links AND utm_campaign are already set. This way historical
  // contacts that already got links can still receive UTM enrichment now
  // that the Meta API token finally has leads_retrieval.
  return true;
}

async function searchRecentOrphans(ghlHeaders, lookbackHours = LOOKBACK_HOURS) {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const results = [];
  let page = 1;
  while (page <= 10) {
    const r = await fetch(`${GHL_BASE}/contacts/search`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({
        locationId: GHL_LOCATION,
        pageLimit: 100,
        page,
        filters: [
          { field: 'dateAdded', operator: 'range', value: { gte: since } },
        ],
      }),
    });
    if (!r.ok) {
      console.error('[cron-enrich] search failed', r.status, await r.text());
      break;
    }
    const d = await r.json();
    const batch = d?.contacts || [];
    results.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return results.filter(isOrphanCandidate);
}

async function enrichOne(c, ghlHeaders, metaAttribution) {
  const cfs = c.customFields || [];
  const currentLink = cfs.find(f => f.id === CONTACT_LINK_AGENDAR_CF)?.value || '';
  const currentPaywall = cfs.find(f => f.id === CONTACT_LINK_PAYWALL_CF)?.value || '';
  const currentUtmCampaign = cfs.find(f => f.id === CONTACT_UTM_CAMPAIGN_CF)?.value || '';
  const link = buildLink(c);
  const linkPaywall = buildPaywallLink(c);

  // Skip only if links are populated AND (no meta attribution to add OR
  // utm_campaign already set). This way new attribution data still flows
  // through even on idempotent re-runs.
  const linksOk = currentLink === link && currentPaywall === linkPaywall;
  const metaCamp = metaAttribution?.campaign_name || '';
  const utmsOk = !metaAttribution || (metaCamp && currentUtmCampaign === metaCamp);
  const dbg = {
    cf_count: cfs.length,
    cf_link_field: cfs.find(f => f.id === CONTACT_LINK_AGENDAR_CF) || null,
    cf_camp_field: cfs.find(f => f.id === CONTACT_UTM_CAMPAIGN_CF) || null,
    currentLink_len: currentLink.length,
    link_len: link.length,
    currentUtmCampaign,
    metaCamp,
    linksOk,
    utmsOk,
    hasMeta: !!metaAttribution,
  };
  if (linksOk && utmsOk) {
    return { id: c.id, skipped: true, debug: dbg };
  }

  // PUT contact CFs (link_agendar + link_paywall + door=meta_form_directo).
  // When metaAttribution is available, also write utm_source/medium/campaign
  // /content/term so the dashboard can group leads by Meta campaign instead
  // of dropping them into "sin-dato".
  const customFields = [
    { id: CONTACT_LINK_AGENDAR_CF, field_value: link },
    { id: CONTACT_LINK_PAYWALL_CF, field_value: linkPaywall },
    { id: CONTACT_DOOR_CF, field_value: 'meta_form_directo' },
  ];
  if (metaAttribution) {
    customFields.push(
      { id: CONTACT_UTM_SOURCE_CF,   field_value: 'facebook' },
      { id: CONTACT_UTM_MEDIUM_CF,   field_value: 'paid_social' },
      { id: CONTACT_UTM_CAMPAIGN_CF, field_value: metaAttribution.campaign_name || '' },
      { id: CONTACT_UTM_CONTENT_CF,  field_value: metaAttribution.ad_id || '' },
      { id: CONTACT_UTM_TERM_CF,     field_value: metaAttribution.adset_name || '' },
    );
  }
  await fetch(`${GHL_BASE}/contacts/${c.id}`, {
    method: 'PUT',
    headers: ghlHeaders,
    body: JSON.stringify({ customFields }),
  });

  // Mirror link on the open opportunity
  try {
    const sr = await fetch(`${GHL_BASE}/opportunities/search?location_id=${GHL_LOCATION}&contact_id=${c.id}`, { headers: ghlHeaders });
    const sd = await sr.json();
    const opp = (sd?.opportunities || []).find(o => o.status === 'open') || (sd?.opportunities || [])[0];
    if (opp) {
      await fetch(`${GHL_BASE}/opportunities/${opp.id}`, {
        method: 'PUT',
        headers: ghlHeaders,
        body: JSON.stringify({ customFields: [{ id: OPP_LINK_AGENDADOS_CF, field_value: link }] }),
      });
    }
  } catch (e) {
    console.error('[cron-enrich] opp update failed for', c.id, e.message);
  }

  // Tag last so any tag-triggered downstream reads populated fields.
  try {
    await fetch(`${GHL_BASE}/contacts/${c.id}/tags`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ tags: ['meta_form_directo'] }),
    });
  } catch (e) {
    console.error('[cron-enrich] tag POST failed for', c.id, e.message);
  }

  return { id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(' '), updated: true };
}

exports.handler = async (event) => {
  const apiKey = process.env.VITE_GHL_API_KEY;
  if (!apiKey) {
    console.error('[cron-enrich] VITE_GHL_API_KEY not set');
    return { statusCode: 500, body: 'Missing GHL key' };
  }
  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };
  // Allow caller to override lookback for backfill / testing.
  const params = (event && event.queryStringParameters) || {};
  const lookback = parseInt(params.days, 10) > 0
    ? parseInt(params.days, 10) * 24
    : LOOKBACK_HOURS;
  const maxContacts = parseInt(params.max, 10) > 0 ? parseInt(params.max, 10) : Infinity;

  const startedAt = Date.now();
  let scanned = 0, skipped = 0, updated = 0, failed = 0, attributed = 0;
  const updates = [];

  // Pre-fetch Meta attribution for recent leads so we can match by email
  // when enriching each GHL contact. Falls back gracefully if Meta API
  // doesn't yet have leads_retrieval permission (returns empty + logs).
  let metaByEmail = new Map();
  let metaError = null;
  try {
    // Match the GHL contact lookback so all candidates have a chance to
    // be matched against Meta attribution.
    const result = await fetchRecentMetaLeads(lookback);
    if (result.errors && result.errors.length) {
      metaError = result.errors.join('; ');
      console.log('[cron-enrich] meta-leads warnings:', metaError);
    }
    for (const lead of (result.leads || [])) {
      if (lead.email) metaByEmail.set(lead.email.toLowerCase().trim(), lead);
    }
    console.log('[cron-enrich] fetched', metaByEmail.size, 'attributed Meta leads from API');
  } catch (e) {
    metaError = e.message;
    console.log('[cron-enrich] meta-leads fetch failed (continuing without attribution):', e.message);
  }

  try {
    let contacts = await searchRecentOrphans(ghlHeaders, lookback);
    if (Number.isFinite(maxContacts)) contacts = contacts.slice(0, maxContacts);
    scanned = contacts.length;
    const debugSamples = [];
    for (const c of contacts) {
      try {
        const email = (c.email || '').toLowerCase().trim();
        const metaLead = email ? metaByEmail.get(email) : null;
        if (metaLead) attributed += 1;
        const r = await enrichOne(c, ghlHeaders, metaLead);
        if (r.skipped) skipped += 1;
        else if (r.updated) { updated += 1; updates.push(r.name + ' (' + r.id + ')'); }
        if (debugSamples.length < 3 && r.debug) debugSamples.push({ email, ...r.debug });
      } catch (e) {
        failed += 1;
        console.error('[cron-enrich] failed for', c.id, e.message);
      }
    }
    if (debugSamples.length) updates.push({ _debug: debugSamples });
  } catch (e) {
    console.error('[cron-enrich] fatal', e);
    return { statusCode: 500, body: e.message };
  }

  const ms = Date.now() - startedAt;
  console.log(`[cron-enrich] done in ${ms}ms — scanned:${scanned} updated:${updated} attributed:${attributed} skipped:${skipped} failed:${failed}`);
  if (updates.length) console.log('[cron-enrich] updated:', updates.join(', '));
  return {
    statusCode: 200,
    body: JSON.stringify({ ms, scanned, updated, attributed, skipped, failed, metaError, updates }),
  };
};

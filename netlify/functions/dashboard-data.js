// Netlify Function: Dashboard Data from PostHog
// Fetches real analytics data via PostHog HogQL queries + direct GHL
// lookups for fields that are authoritative in the CRM (sexo, pipeline
// stage) and not reliably propagated through the PostHog sync.

const POSTHOG_HOST = 'https://eu.i.posthog.com';
const PROJECT_ID = '137870';
const LAUNCH_DATE = '2026-04-09';

// GHL constants (mirrors sync-ghl-posthog.js)
const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_PIPELINE_ID = 'xXCgpUIEizlqdrmGrJkg';
// Pipeline stages (10 total). User added "Paid" + "Abandoned" stages so we
// no longer need the cita_cancelada tag workaround: Lost/Cancelled now means
// real cancellations only, Abandoned is its own bucket.
const GHL_STAGE_NEW_LEAD   = 'fbed92b1-5e91-4b86-820f-44b9f66f8b73';
const GHL_STAGE_CONTACTED  = 'f0b2e24c-ce25-4c54-bb2f-6ba3571308c7';
const GHL_STAGE_PAID       = '2eac8c05-25cf-4a21-9d1f-4fb2df071c0d';
const GHL_STAGE_BOOKED     = 'f9e5c1cf-7701-4883-ac96-f16b3d78c0d5';
const GHL_STAGE_REMINDER   = '24956338-65d9-4a16-97e5-ba01b64f390f';
const GHL_STAGE_ATTENDED   = '71a5cc36-584e-47dc-9cce-215803e3140d';
const GHL_STAGE_WON        = '1cd97c60-fb19-4699-9293-2b32fd48b54a';
const GHL_STAGE_NO_SHOW_ID = '437d0663-bd17-4d84-a939-11aed1b4b384';
const GHL_STAGE_CANCELLED  = 'c961b576-b14d-43a6-ac75-a26695886d58';
const GHL_STAGE_ABANDONED  = '28227d12-8f47-4da3-b5d9-140bc546a635';

// Stages that count as "ever booked" (total appointments incl. cancellations).
const GHL_BOOKED_STAGES = new Set([
  GHL_STAGE_PAID,         // pago hecho → cita inminente
  GHL_STAGE_BOOKED,
  GHL_STAGE_REMINDER,
  GHL_STAGE_ATTENDED,
  GHL_STAGE_WON,
  GHL_STAGE_NO_SHOW_ID,
  GHL_STAGE_CANCELLED,    // real cancellations count as "had a booking"
]);
// Sub-classification for the funnel breakdown chips.
const GHL_STAGE_AGENDADA = new Set([GHL_STAGE_BOOKED, GHL_STAGE_REMINDER, GHL_STAGE_PAID]);
const GHL_STAGE_ATENDIDA = new Set([GHL_STAGE_ATTENDED, GHL_STAGE_WON]);
const GHL_STAGE_NO_SHOW  = new Set([GHL_STAGE_NO_SHOW_ID]);

async function hogqlQuery(apiKey, query) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: {
        kind: 'HogQLQuery',
        query,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog query failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.results || [];
}

// Small Spanish first-name → gender lookup used as a fallback when
// contact.gender isn't set in GHL (happens for leads that came via
// forms without a sexo question, e.g. formulario directo).
// Only covers the top ~80 most common Spanish names; anything else
// falls through to 'sin-dato'.
const MALE_NAMES = new Set([
  'diego','izan','andres','juan','jose','carlos','miguel','antonio','pedro',
  'pablo','manuel','luis','fernando','javier','francisco','daniel','alejandro',
  'rafael','alberto','ricardo','raul','enrique','jorge','ignacio','ivan',
  'alvaro','ismael','adrian','ruben','gabriel','david','victor','marcos',
  'mario','hector','samuel','joaquin','sergio','eduardo','roberto','santiago',
  'gonzalo','ramon','alex','hugo','oscar','lucas','martin','emilio','nicolas',
  'cristian','felipe','marc','albert','xavier','dario','julian','cesar',
]);
const FEMALE_NAMES = new Set([
  'maria','ana','carmen','laura','isabel','sara','rosa','catalina','pilar',
  'lucia','elena','cristina','marta','paula','sofia','andrea','alba','marina',
  'eva','ines','patricia','beatriz','rocio','silvia','sandra','raquel','monica',
  'teresa','julia','claudia','natalia','lorena','gloria','susana','angela',
  'yolanda','alicia','elisa','dolores','adriana','concepcion','esther',
  'mercedes','manuela','josefa','antonia','encarnacion','amparo','nieves',
  'montserrat','montse','noelia','nuria','virginia','olga','irene','celia',
  'veronica','carla','diana','rebeca','nerea','aitana','martina','valentina',
  'vanesa','vanessa','miriam','ester','nadia','leire','ainhoa',
]);

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Try each token in the full name in order — handles "IBM Andrés noreña"
// (first token is not a name) or "María del Carmen" (second/third tokens).
function inferSexoFromName(fullName) {
  if (!fullName) return null;
  const tokens = fullName.trim().toLowerCase().split(/\s+/).map(stripAccents);
  for (const t of tokens) {
    if (MALE_NAMES.has(t)) return 'hombre';
    if (FEMALE_NAMES.has(t)) return 'mujer';
  }
  return null;
}

// ─── Direct GHL → by_sexo aggregation ─────────────────────────────
// GHL is the source of truth for gender (native contact.gender field).
// When gender is missing (contacts from form-direct flows that don't ask
// sexo), fall back to a first-name heuristic against a Spanish name list.
// Pulling directly avoids PostHog's person-property propagation lag.
// Fetch current Google Ads catalog: ad_group_id → { ad_group_name, campaign_name }.
// Lets us translate the raw {adgroupid} from utm_content into real ad group
// names. Same conventions as fetchMetaAdCatalog: only campaigns whose ads
// target diagnostico.hospitalcapilar.com are kept (mirrors sync-ad-spend.js).
async function fetchGoogleAdsCatalog() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const mccId = process.env.GOOGLE_ADS_MCC_ID;
  if (!clientId || !refreshToken || !developerToken || !customerId) return null;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access_token}`,
      'developer-token': developerToken,
    };
    if (mccId) headers['login-customer-id'] = mccId;
    const url = `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:searchStream`;
    const runQuery = async (query) => {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query }) });
      if (!res.ok) return null;
      return res.json();
    };
    // 1) Find G4U-relevant campaigns (those whose ads target our landing).
    const adsData = await runQuery(`
      SELECT campaign.id, ad_group_ad.ad.final_urls
      FROM ad_group_ad
      WHERE campaign.status = 'ENABLED'
    `);
    if (!adsData) return null;
    const ourCampaignIds = new Set();
    for (const batch of (adsData || [])) {
      for (const row of (batch.results || [])) {
        const urls = row.adGroupAd?.ad?.finalUrls || [];
        if (urls.some(u => u.includes('diagnostico.hospitalcapilar.com'))) {
          ourCampaignIds.add(String(row.campaign?.id || ''));
        }
      }
    }
    if (ourCampaignIds.size === 0) return { byAdGroupId: {}, count: 0 };
    const idList = [...ourCampaignIds].join(', ');
    // 2) Pull ad group names + campaign names for those campaigns.
    const groupsData = await runQuery(`
      SELECT ad_group.id, ad_group.name, campaign.id, campaign.name
      FROM ad_group
      WHERE campaign.id IN (${idList})
    `);
    const byAdGroupId = {};
    for (const batch of (groupsData || [])) {
      for (const row of (batch.results || [])) {
        const adGroupId = String(row.adGroup?.id || '');
        if (!adGroupId) continue;
        byAdGroupId[adGroupId] = {
          ad_group_id: adGroupId,
          ad_group_name: row.adGroup?.name || '',
          campaign_id: String(row.campaign?.id || ''),
          campaign_name: row.campaign?.name || '',
          status: 'ENABLED',
        };
      }
    }
    return { byAdGroupId, count: Object.keys(byAdGroupId).length };
  } catch (e) {
    console.log('[GoogleAds catalog] fetch failed:', e.message);
    return null;
  }
}

// Fetch current Meta ads catalog: ad_id → { ad_name, adset_name, campaign_name }.
// Lets us cross-reference the free-text utm_content that GHL stores (which is
// whatever the marketer typed in the URL params) against Meta's real structure
// of campaigns → adsets → ads. Each HC campaign has BOTH Quiz Largo and Quiz
// Corto adsets inside, so proper attribution needs the adset_name.
// Module-level cache to survive across warm lambda invocations.
// Meta hits rate-limit fast on the ads-management endpoint — caching for
// 5 min cuts our calls from once-per-dashboard-load to once per cold-start
// or 5min interval.
let _metaCatalogCache = null;
let _metaCatalogCacheAt = 0;
const META_CATALOG_TTL_MS = 5 * 60 * 1000;

async function fetchMetaAdCatalog() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return { _error: 'Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID', count: 0, byId: {}, byVideoId: {}, byNameAndLanding: {}, byNameAny: {}, videoLabel: {} };
  }
  if (_metaCatalogCache && (Date.now() - _metaCatalogCacheAt) < META_CATALOG_TTL_MS) {
    return _metaCatalogCache;
  }
  try {
    // creative{...} pulls the underlying video_id so we can group all ads
    // that reuse the same video file (different copy, same UGC) under one
    // "Video N" label in the master table. Use a flat field list — nested
    // object_story_spec{video_data{...}} can fail with permission errors
    // on some ad accounts, dropping the whole catalog read.
    const fields = [
      'id', 'name', 'status', 'effective_status',
      'adset{id,name}',
      'campaign{id,name}',
      'creative{id,name,video_id,thumbnail_url}',
    ].join(',');
    // Paginate ACTIVE ads only — inactive/archived ads still count toward
    // attribution if their utm_content shows up in a lead, but for the
    // overwhelming majority of leads we only need active. Filtering at the
    // API drops volume ~70% and avoids rate-limit (code 80004).
    const ads = [];
    const filter = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]));
    let nextUrl = `https://graph.facebook.com/v21.0/${account}/ads?fields=${fields}&filtering=${filter}&limit=25&access_token=${token}`;
    let pageGuard = 0;
    while (nextUrl && pageGuard++ < 20) {  // hard cap: 500 ACTIVE ads
      const res = await fetch(nextUrl);
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        console.log('[Meta catalog] read failed:', res.status, errText);
        if (ads.length === 0) {
          return { _error: `Meta API ${res.status}: ${errText}`, count: 0, byId: {}, byVideoId: {}, byNameAndLanding: {}, byNameAny: {}, videoLabel: {} };
        }
        break;  // partial result is still useful
      }
      const data = await res.json();
      ads.push(...(data.data || []));
      nextUrl = data.paging?.next || null;
    }
    const byId = {};
    const byVideoId = {};          // video_id → array of ads using it
    // Meta frequently reuses the same creative name across multiple adsets
    // (e.g., "Miniaturizacion soto" lives in both a Quiz Largo adset and a
    // Quiz Rápido adset). To disambiguate we infer the landing flavor
    // from the adset name and index by (name, landing).
    const byNameAndLanding = {};   // "miniaturizacion soto|quiz_largo" → info
    const byNameAny = {};          // "miniaturizacion soto" → array of all matches
    const byCreativeName = {};     // "miniaturizacion soto" → array of ads w/ that creative.name
    const allInfos = [];           // for substring fallback search
    const isG4U = (camp) => /G4U|Postparto_G4U|Menopausia G4U|¿Qué me pasa/i.test(camp || '');
    const detectLanding = (adsetName) => {
      const s = (adsetName || '').toLowerCase();
      if (/form\.?\s*directo|form_directo/.test(s))       return 'formulario_directo';
      if (/quiz\s*r[áa]pido|quiz\s*corto/.test(s))        return 'quiz_corto';
      if (/quiz\s*largo/.test(s))                         return 'quiz_largo';
      return null;
    };
    const extractVideoId = (cr) => {
      if (!cr) return '';
      return cr.video_id || '';
    };
    for (const a of ads) {
      const videoId = extractVideoId(a.creative);
      const info = {
        ad_id: a.id,
        ad_name: a.name || '',
        adset_id: a.adset?.id || '',
        adset_name: a.adset?.name || '',
        adset_landing: detectLanding(a.adset?.name),
        campaign_id: a.campaign?.id || '',
        campaign_name: a.campaign?.name || '',
        status: a.effective_status || a.status || '',
        is_g4u: isG4U(a.campaign?.name),
        video_id: videoId,
        creative_name: a.creative?.name || '',
        thumbnail: a.creative?.thumbnail_url || '',
      };
      byId[a.id] = info;
      allInfos.push(info);
      if (videoId) {
        if (!byVideoId[videoId]) byVideoId[videoId] = [];
        byVideoId[videoId].push(info);
      }
      const nameKey = (a.name || '').trim().toLowerCase();
      if (nameKey) {
        if (!byNameAny[nameKey]) byNameAny[nameKey] = [];
        byNameAny[nameKey].push(info);
        if (info.adset_landing) {
          const key = nameKey + '|' + info.adset_landing;
          const existing = byNameAndLanding[key];
          if (!existing ||
              (info.is_g4u && !existing.is_g4u) ||
              (info.is_g4u === existing.is_g4u && info.status === 'ACTIVE' && existing.status !== 'ACTIVE')) {
            byNameAndLanding[key] = info;
          }
        }
      }
      // Also index by creative.name (Meta's separate creative-level label)
      const creativeKey = (a.creative?.name || '').trim().toLowerCase();
      if (creativeKey) {
        if (!byCreativeName[creativeKey]) byCreativeName[creativeKey] = [];
        byCreativeName[creativeKey].push(info);
      }
    }
    // Build video → label map. Order videos by total ad count desc, give
    // each a stable "Video 1/2/3..." label. Only G4U videos get labelled
    // (HC's other campaigns use their own creatives we don't care about).
    const g4uVideos = Object.entries(byVideoId)
      .filter(([, ads]) => ads.some(x => x.is_g4u))
      .sort((a, b) => b[1].length - a[1].length);
    const videoLabel = {};
    g4uVideos.forEach(([videoId], i) => { videoLabel[videoId] = `Video ${i + 1}`; });
    const result = { byId, byVideoId, byNameAndLanding, byNameAny, byCreativeName, allInfos, videoLabel, count: ads.length };
    _metaCatalogCache = result;
    _metaCatalogCacheAt = Date.now();
    return result;
  } catch (e) {
    console.log('[Meta catalog] fetch failed:', e.message);
    if (_metaCatalogCache) return _metaCatalogCache;  // serve stale on error
    return { _error: e.message, count: 0, byId: {}, byVideoId: {}, byNameAndLanding: {}, byNameAny: {}, videoLabel: {} };
  }
}

// GHL custom field IDs (mirror of packages/quiz/src/components/HospitalCapilarQuiz.jsx)
const GHL_CF = {
  door:              '2JYlfGk60lHbuyh9vcdV',
  sexo:              'P7D2edjnOHwXLpglw9tB',
  ecp:               'cFIcdJlT9sfnC3KMSwDD',
  ubicacion_clinica: 'LygjPVQnLbqqdL4eqQwT',
  utm_source:        'MisB9YJJAH7cnh8JOtQn',
  utm_medium:        'vykx7m6bcfbYMXRqToYP',
  utm_campaign:      '3fUI7GO9o7oZ7ddMNnFf',
  utm_content:       'dydSaUSYbb5R7nYOboLq',
  utm_term:          'eLdhsOthmyD38al527tG',
  nicho:             'o4I4AG3ZK07nEzAMLTlK',
  funnel_type:       'liIshAFJMngl2BV9MtVw',
  traffic_source:    'miu6E3oxZowYahYGjX1A',
};

const CLINICAS_OPERATIVAS = new Set(['madrid', 'murcia', 'pontevedra']);

// Collapse free-text utm_campaign strings into Meta's canonical campaign
// names. The marketer writes utm_campaign manually in ad URLs (values like
// "quiz-largo-es-normal", "form-directo-que-me-pasa") but those aren't
// real campaigns in Ads Manager — Meta only has 3 G4U campaigns. We route
// each nicho slug to its canonical Meta campaign so the dashboard doesn't
// fragment into 5+ fake campaigns.
function canonicalCampaignFromUtm(utm_campaign) {
  const lower = (utm_campaign || '').toLowerCase();
  if (!lower || lower === 'sin-dato') return null;
  if (/\bmenopausia\b|\bes[-_ ]?normal\b/.test(lower)) return 'Menopausia G4U';
  if (/\bque[-_ ]?me[-_ ]?pasa\b/.test(lower))          return '¿Qué me pasa? G4U';
  if (/\bpostparto\b/.test(lower))                      return 'Postparto_G4U_Madrid';
  // Trichometabolic / tricometabolic — accepts both spellings (with and
  // without the 'h'). Launched 2026-04-29 in Meta as "Trichometabolic G4U".
  if (/\btric?h?o[-_ ]?metabolic\b/.test(lower))        return 'Trichometabolic G4U';
  return null; // unknown nicho → keep raw
}

// Alias map for campaign names that have been renamed in the source
// platforms. Keeps historical leads (which still carry the old name)
// merged with new leads under the unified name. Add new aliases here
// when a campaign gets renamed in Meta/Google.
const CAMPAIGN_ALIASES = new Map([
  // Google ¿Qué me pasa? renamed to add G4U suffix on 2026-04-29.
  ['¿qué me pasa?',                         '¿Qué me pasa? G4U'],
  ['¿que me pasa?',                         '¿Qué me pasa? G4U'],
  ['postparto / lo que vino con el bebé /madrid', 'Postparto_G4U_Madrid'],
  // Trichometabolic launched 2026-04-29. Accept variant spellings so any
  // typo (with/without 'h') still maps to the canonical Meta name.
  ['tricometabolic g4u',                    'Trichometabolic G4U'],
  ['trichometabolic',                       'Trichometabolic G4U'],
  ['tricometabolic',                        'Trichometabolic G4U'],
]);

function aliasCampaignName(name) {
  if (!name) return name;
  const key = String(name).trim().toLowerCase();
  return CAMPAIGN_ALIASES.get(key) || name;
}

// Fetch all opportunities in the pipeline + every related contact. Returns
// an array of flattened rows; each row has the fully resolved dimensions
// we can use to cross-tab the master table.
async function fetchGhlOppsWithContacts(startDate, endDate) {
  const GHL_KEY = process.env.VITE_GHL_API_KEY;
  const GHL_LOCATION = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  if (!GHL_KEY) return null;

  const headers = { Authorization: `Bearer ${GHL_KEY}`, Version: '2021-07-28' };

  let allOpps = [];
  let startAfterId = '';
  let hasMore = true;
  let guard = 0;
  // Hard cap: 50 pages × 100 = 5000 opps. GHL accumulates re-emitted opps
  // per contact over time so we need headroom — at 22 days post-launch
  // we hit ~3000 opps for ~150 contacts (~9× ratio). Bumped from 2000 →
  // 5000 so tail-end contacts (typically older quiz_largo leads) aren't
  // dropped from the dashboard.
  while (hasMore && guard++ < 50) {
    const url = `${GHL_BASE}/opportunities/search?location_id=${GHL_LOCATION}&pipeline_id=${GHL_PIPELINE_ID}&limit=100${startAfterId ? `&startAfterId=${startAfterId}` : ''}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GHL search ${res.status}`);
    const data = await res.json();
    const opps = data.opportunities || [];
    allOpps = allOpps.concat(opps);
    hasMore = opps.length >= 100;
    if (hasMore) startAfterId = opps[opps.length - 1].id;
  }

  const startTs = new Date(startDate + 'T00:00:00Z').getTime();
  const endTs = new Date(endDate + 'T23:59:59Z').getTime();
  const inRangeRaw = allOpps.filter(opp => {
    const t = new Date(opp.createdAt || opp.updatedAt || 0).getTime();
    return t >= startTs && t <= endTs;
  });

  // Dedupe to ONE opp per contact so leads count = unique contacts.
  // GHL creates multiple opps per contact when workflows re-trigger or
  // pipeline sync re-emits — counting all of them inflates leads ~9x.
  // Keep the most-progressed opp (booked > contacted > new) to preserve
  // the cita state. Tiebreaker: most recently updated.
  const STAGE_PRIORITY = {
    [GHL_STAGE_WON]:        7, // won (closed deal)
    [GHL_STAGE_ATTENDED]:   7, // attended
    [GHL_STAGE_REMINDER]:   6, // reminder_sent
    [GHL_STAGE_BOOKED]:     6, // booked
    [GHL_STAGE_PAID]:       5, // paid (between contacted and booked)
    [GHL_STAGE_NO_SHOW_ID]: 4, // no_show
    [GHL_STAGE_CANCELLED]:  3, // lost/cancelled (real cancellation)
    [GHL_STAGE_CONTACTED]:  2, // contacted
    [GHL_STAGE_NEW_LEAD]:   1, // new_lead
    [GHL_STAGE_ABANDONED]:  0, // abandoned (lowest — dead lead)
  };
  const oppByContact = new Map();
  for (const opp of inRangeRaw) {
    if (!opp.contactId) continue;
    const existing = oppByContact.get(opp.contactId);
    if (!existing) { oppByContact.set(opp.contactId, opp); continue; }
    const a = STAGE_PRIORITY[opp.pipelineStageId] || 0;
    const b = STAGE_PRIORITY[existing.pipelineStageId] || 0;
    if (a > b) { oppByContact.set(opp.contactId, opp); continue; }
    if (a === b) {
      const at = new Date(opp.updatedAt || opp.createdAt || 0).getTime();
      const bt = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      if (at > bt) oppByContact.set(opp.contactId, opp);
    }
  }
  const inRange = [...oppByContact.values()];
  const contactIds = [...oppByContact.keys()];
  const contactById = {};
  // Concurrency 3 + 3-attempt retry on 429/5xx. Earlier we lost ~7 contacts
  // per run to silent rate-limit failures, which dropped quiz_largo leads.
  const concurrency = 3;
  let idx = 0;
  let lookupFails = 0;
  async function fetchContactWithRetry(cid) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${GHL_BASE}/contacts/${cid}`, { headers });
        if (r.ok) return (await r.json()).contact || {};
        if (r.status === 429 || r.status >= 500) {
          await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
          continue;
        }
        return null; // 4xx other than 429: don't retry
      } catch (_) {
        await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
      }
    }
    return null;
  }
  async function worker() {
    while (idx < contactIds.length) {
      const i = idx++;
      const cid = contactIds[i];
      const contact = await fetchContactWithRetry(cid);
      if (contact) contactById[cid] = contact;
      else lookupFails++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, contactIds.length) }, worker));
  if (lookupFails > 0) console.log('[dashboard-data] contact lookup failures:', lookupFails, 'of', contactIds.length);

  // Funnel-only filter. We run paid Meta + Google exclusively, so a real
  // lead has at least one of:
  //   - source contains paid pattern (facebook, google, quiz, form hc, …)
  //   - door CF set (came through ghl-proxy or cron-enrich)
  //   - utm_source CF set (came with URL tracking)
  //   - tag meta_form_directo (cron-enrich tagged it)
  // Anything with all four missing is GHL's native IG capture (handles,
  // Chat AI bot, Nova Chat) — DM noise that shouldn't count as a lead.
  // User confirmed 2026-05-04: "los de IG dms nativos hay que volarlo de
  // todo el reporte, no nos sirve."
  const isFunnelSource = (contact) => {
    const source = (contact.source || '').toLowerCase();
    if (source.includes('social media instagram')) return false;
    if (source.includes('social media facebook')) return false;
    if (source.includes('manual')) return false;
    const cfs = contact.customFields || [];
    const cfHas = (id) => cfs.some(f => f.id === id && (f.value || f.fieldValue));
    const hasSourcePattern = /facebook|instagram|paid_social|google|cpc|adwords|quiz|form hc|lead ad|meta/i.test(source);
    const hasDoor = cfHas('2JYlfGk60lHbuyh9vcdV');     // CONTACT_DOOR_CF
    const hasUtmSource = cfHas('MisB9YJJAH7cnh8JOtQn'); // CONTACT_UTM_SOURCE_CF
    const hasMetaTag = (contact.tags || []).some(t => /meta_form_directo/i.test(t || ''));
    return hasSourcePattern || hasDoor || hasUtmSource || hasMetaTag;
  };
  // Count every lead in the pipeline including lost + abandoned. Only filter
  // is isFunnelSource (drops IG/FB DMs from Manychat + manual entries).
  return inRange.map(opp => {
    const contact = contactById[opp.contactId] || {};
    if (!isFunnelSource(contact)) return null;
    const cfMap = {};
    (contact.customFields || []).forEach(f => { cfMap[f.id] = f.value; });
    const cf = (key) => cfMap[GHL_CF[key]] || null;

    const g = (contact.gender || '').toLowerCase();
    let sexo = g === 'female' ? 'mujer' : g === 'male' ? 'hombre' : null;
    if (!sexo) sexo = cf('sexo') || null;
    if (!sexo) {
      const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || '';
      sexo = inferSexoFromName(fullName);
    }
    // Normalize to one of 3 buckets so Pago + No-Pago always sum to total.
    // Camino Pago = mujer + sin-dato (paywall flow), Camino No-Pago = hombre.
    const sexoLower = (sexo || '').toLowerCase().trim();
    if (sexoLower === 'female' || sexoLower === 'mujer' || sexoLower === 'f' || sexoLower === 'woman') {
      sexo = 'mujer';
    } else if (sexoLower === 'male' || sexoLower === 'hombre' || sexoLower === 'm' || sexoLower === 'man') {
      sexo = 'hombre';
    } else {
      sexo = 'sin-dato';
    }

    const ubicacion = (cf('ubicacion_clinica') || '').toLowerCase();
    const clinica = CLINICAS_OPERATIVAS.has(ubicacion) ? ubicacion
      : (ubicacion ? 'otra' : 'sin-dato');

    const tagsArr = Array.isArray(contact.tags) ? contact.tags : [];
    const sourceLower = (contact.source || '').toLowerCase();

    // Channel — fall back through utm_source CF, source string, tags, door.
    // Order matters: explicit source/UTM beats inference from tags/door.
    const doorRaw = (cf('door') || cf('funnel_type') || '').toLowerCase();
    let utmSource = (cf('utm_source') || cf('traffic_source') || '').toLowerCase();
    if (!utmSource) {
      if (/facebook|instagram|paid_social|lead ad|lead_ad/.test(sourceLower)) utmSource = 'facebook';
      else if (/google|cpc|adwords/.test(sourceLower))                        utmSource = 'google';
      else if (tagsArr.includes('meta_form_directo'))                         utmSource = 'facebook';
      else if (doorRaw === 'meta_form_directo')                               utmSource = 'facebook';
    }
    if (!utmSource) utmSource = 'sin-dato';

    // Funnel type — primary signal: GHL `door` CF.
    //   quiz_largo        → / (que-me-pasa, es-normal, mujeres)        [ghl-proxy]
    //   quiz_corto        → /rapido/*                                  [ghl-proxy]
    //   form_directo      → /form/* (HC landing con formulario)         [ghl-proxy]
    //   form_meta_directo → Meta Lead Form (form vive en FB/IG → /p/)  [cron 5 min]
    //
    // Source override: if contact.source clearly says "Quiz HC" or "Quiz
    // Corto HC" but door=meta_form_directo, source wins. This recovers
    // contacts whose door was overwritten by an old cron-enrich bug.
    const door = doorRaw;
    let funnelType;
    // Source override — runs FIRST to fix legacy door corruption.
    if (sourceLower.includes('quiz corto hc') ||
        sourceLower.includes('quiz rápido hc') || sourceLower.includes('quiz rapido hc')) {
      funnelType = 'quiz_corto';
    } else if (sourceLower.includes('quiz hc') && !sourceLower.includes('corto') && !sourceLower.includes('rapido') && !sourceLower.includes('rápido')) {
      funnelType = 'quiz_largo';
    } else if (sourceLower.includes('form hc')) {
      funnelType = 'form_directo';
    } else if (door === 'quiz_largo')                           funnelType = 'quiz_largo';
    else if (door === 'quiz_corto')                             funnelType = 'quiz_corto';
    else if (door === 'form' || door === 'form_directo' ||
             door === 'formulario_directo')                     funnelType = 'form_directo';
    else if (door === 'meta_form_directo' ||
             tagsArr.includes('meta_form_directo'))             funnelType = 'form_meta_directo';
    else                                                         funnelType = 'sin-dato';
    const channelMap = { meta: 'Meta', facebook: 'Meta', instagram: 'Meta', google: 'Google', google_ads: 'Google', seo: 'SEO', tiktok: 'TikTok', direct: 'Directo', directo: 'Directo' };
    const channel = channelMap[utmSource] || (utmSource === 'sin-dato' ? 'Sin dato' : utmSource);

    // Derive payment model from funnel + sexo (mirrors sync-ghl-posthog derivePaymentVariant)
    let pago;
    if ((funnelType || '').toLowerCase() === 'asesores') pago = 'clinica';
    else if (sexo === 'hombre') pago = '0';
    else if (sexo === 'mujer') pago = '125';
    else pago = 'unknown';

    const tags = Array.isArray(contact.tags) ? contact.tags : [];
    const stage = opp.pipelineStageId;
    const isAgendada  = GHL_STAGE_AGENDADA.has(stage);
    const isAtendida  = GHL_STAGE_ATENDIDA.has(stage);
    const isNoShow    = GHL_STAGE_NO_SHOW.has(stage);
    // Lost/Cancelled stage holds two things until old "Lost" data is migrated
    // to the new Abandoned stage:
    //   1. Real appointment cancellations (have tag cita_cancelada)
    //   2. Abandoned leads (legacy Lost without cancellation tag)
    // Only #1 counts as a cancelled booking.
    const hasCancelTag = tags.includes('cita_cancelada') || tags.includes('appointment_cancelled');
    const isCancelada = stage === GHL_STAGE_CANCELLED && hasCancelTag;
    // Abandoned = explicit Abandoned stage OR Lost/Cancelled without cancel tag
    const isAbandoned = stage === GHL_STAGE_ABANDONED
                     || (stage === GHL_STAGE_CANCELLED && !hasCancelTag);
    // isBooked: real bookings only, excluding abandoned leads.
    const isBooked = GHL_STAGE_AGENDADA.has(stage)
                  || GHL_STAGE_ATENDIDA.has(stage)
                  || GHL_STAGE_NO_SHOW.has(stage)
                  || isCancelada;
    const isPaid = stage === GHL_STAGE_PAID
                || stage === GHL_STAGE_WON
                || tags.includes('bono_pagado');             // belt-and-suspenders

    return {
      opp_id: opp.id,
      contact_id: opp.contactId,
      createdAt: opp.createdAt,
      pipeline_stage: stage,
      channel,
      utm_source: utmSource,
      utm_medium: cf('utm_medium') || 'sin-dato',
      utm_campaign: cf('utm_campaign') || 'sin-dato',
      utm_content: cf('utm_content') || 'sin-atribucion',
      utm_term: cf('utm_term') || 'sin-dato',
      nicho: cf('nicho') || 'sin-dato',
      landing: funnelType,
      sexo,
      pago,
      clinica,
      leads: 1,
      booked:    isBooked ? 1 : 0,
      agendada:  isAgendada ? 1 : 0,
      atendida:  isAtendida ? 1 : 0,
      no_show:   isNoShow ? 1 : 0,
      cancelada: isCancelada ? 1 : 0,
      abandoned: isAbandoned ? 1 : 0,
      paid: isPaid ? 1 : 0,
    };
  }).filter(Boolean);
}

// Backward-compatible wrapper — aggregate rows by sexo only.
async function fetchGhlBySexo(startDate, endDate) {
  const rows = await fetchGhlOppsWithContacts(startDate, endDate);
  if (!rows) return null;
  const buckets = {};
  const ensure = (k) => { if (!buckets[k]) buckets[k] = { sexo: k, leads: 0, booked: 0, paid: 0 }; return buckets[k]; };
  for (const r of rows) {
    const b = ensure(r.sexo);
    b.leads += r.leads;
    b.booked += r.booked;
    b.paid += r.paid;
  }
  return Object.values(buckets).sort((a, b) => b.leads - a.leads);
}

// Normalize junk utm_content values that don't correspond to real ads.
// Examples seen in practice:
//   "***Cambiar video***"  → placeholder text
//   "{{ad.name}}"          → Meta macro written literally, never substituted
//   "198626380310"         → Google Ads {adgroupid} on a Meta-attributed row
//   ""                     → empty
function classifyUtmContent(utm, channel, landing, metaCatalog, googleCatalog) {
  if (!utm || utm === 'sin-atribucion' || utm === 'sin-dato') {
    return { kind: 'sin-atribucion', display: 'Sin atribuir' };
  }
  if (/^\*+.+\*+$/.test(utm))              return { kind: 'placeholder',   display: 'Sin atribuir (placeholder)' };
  if (/^\{\{.+\}\}$/.test(utm))            return { kind: 'macro-literal', display: 'Sin atribuir (macro)' };
  if (/^\d{10,}$/.test(utm) && channel !== 'Meta') {
    // Google: utm_content is the raw {adgroupid}. Cross-ref the catalog so we
    // surface the actual ad group + campaign names instead of a numeric ID.
    const hit = googleCatalog?.byAdGroupId?.[utm];
    if (hit) {
      return { kind: 'google-matched', display: hit.ad_group_name, google: hit };
    }
    return { kind: 'google-adgroupid', display: `Google adgroup ${utm}` };
  }
  if (metaCatalog) {
    const nameKey = utm.trim().toLowerCase();
    // First try: match by (name, landing) so leads that landed on quiz_largo
    // attribute to the Quiz Largo adset copy of this creative, not the
    // Quiz Rápido one.
    if (landing) {
      const hit = metaCatalog.byNameAndLanding[nameKey + '|' + landing];
      if (hit) return { kind: 'matched', display: hit.ad_name, meta: hit };
    }
    // Fall back to any ad with this name (may be ambiguous across adsets)
    const candidates = metaCatalog.byNameAny[nameKey] || [];
    if (candidates.length === 1) {
      return { kind: 'matched', display: candidates[0].ad_name, meta: candidates[0] };
    }
    if (candidates.length > 1) {
      // Pick: prefer G4U + ACTIVE, else first
      const pick = candidates.find(c => c.is_g4u && c.status === 'ACTIVE')
                || candidates.find(c => c.is_g4u)
                || candidates[0];
      return { kind: 'matched-ambiguous', display: pick.ad_name, meta: pick };
    }
    // Try by creative.name (Meta has separate ad-name and creative-name).
    const creativeHits = metaCatalog.byCreativeName?.[nameKey] || [];
    if (creativeHits.length > 0) {
      const pick = creativeHits.find(c => c.is_g4u && c.status === 'ACTIVE')
                || creativeHits.find(c => c.is_g4u)
                || creativeHits[0];
      return { kind: 'matched-creative', display: pick.ad_name, meta: pick };
    }
    // Substring fallback: try to match any ad whose name CONTAINS this
    // utm_content phrase (or vice-versa). Lets us hook orphan rows up to
    // a video when the marketer used a shorthand label (e.g. utm_content=
    // "soto" matching ad_name "Mujer 45-55 / Quiz Largo / Soto - Tricho").
    const all = metaCatalog.allInfos || [];
    const subHits = all.filter(c => {
      const adN = (c.ad_name || '').toLowerCase();
      const crN = (c.creative_name || '').toLowerCase();
      return c.is_g4u && (
        adN.includes(nameKey) || nameKey.includes(adN) ||
        crN.includes(nameKey) || nameKey.includes(crN)
      );
    });
    if (subHits.length > 0) {
      // Prefer ones whose adset_landing matches the lead's landing, then ACTIVE.
      const pick = subHits.find(c => landing && c.adset_landing === landing && c.status === 'ACTIVE')
                || subHits.find(c => c.status === 'ACTIVE')
                || subHits[0];
      return { kind: 'matched-substring', display: pick.ad_name, meta: pick };
    }
  }
  return { kind: 'unmatched', display: utm };
}

// Master funnel aggregation — groups by all 9 dimensions. Each row
// represents a unique (channel × campaign × adset × ad × nicho × landing
// × sexo × pago × clinica) combination. When a Meta ads catalog is available,
// utm_content values that match a current Meta ad name get enriched with the
// real ad_id + campaign/adset names from Ads Manager.
function buildMasterFunnelFromGhl(rows, phDimensions = [], metaCatalog = null, googleCatalog = null) {
  if (!rows) return null;

  // Index PostHog dimensions by (utm_content, landing) for upstream enrichment.
  // We use only these two keys because sexo/payment_variant/nicho in PostHog
  // are often 'sin-dato' (fragmentation) and would miss GHL rows that DO have
  // the field from the contact record.
  const phByAdLanding = new Map();
  for (const d of (phDimensions || [])) {
    const key = (d.utm_content || 'sin-atribucion') + '|' + (d.landing || '');
    const agg = phByAdLanding.get(key) || { visits: 0, started: 0, completed: 0 };
    agg.visits    += d.visits    || 0;
    agg.started   += d.started   || 0;
    agg.completed += d.completed || 0;
    phByAdLanding.set(key, agg);
  }

  const buckets = new Map();
  for (const r of rows) {
    const cls = classifyUtmContent(r.utm_content, r.channel, r.landing, metaCatalog, googleCatalog);
    // Campaign resolution order:
    //   1) Meta or Google catalog match (authoritative)
    //   2) nicho-slug → canonical Meta campaign (Menopausia G4U, etc.)
    //   3) raw utm_campaign string from GHL (fallback)
    const metaCampaign = aliasCampaignName(
      cls.meta?.campaign_name
      || cls.google?.campaign_name
      || canonicalCampaignFromUtm(r.utm_campaign)
      || r.utm_campaign
    );
    // Adset name only from authoritative sources (Meta catalog / Google
    // catalog). utm_medium fallback would surface generic mediums like
    // "paid_social" / "cpc" / "social" as fake adset names — guarded out.
    const isGenericMedium = (v) => /^(paid_social|paid-social|cpc|social|email|referral|organic|none|\(none\))$/i.test((v || '').trim());
    const metaAdset    = cls.meta?.adset_name
      || cls.google?.ad_group_name
      || (isGenericMedium(r.utm_medium) ? 'Sin adset' : r.utm_medium);
    const metaAdId     = cls.meta?.ad_id         || null;
    const adDisplay    = cls.display;
    const adKind       = cls.kind;
    const videoId      = cls.meta?.video_id      || '';
    const videoLabel   = (videoId && metaCatalog?.videoLabel?.[videoId])
      || (r.channel === 'Google' ? 'Google (texto)' : 'Sin video');

    const key = [r.channel, metaCampaign, metaAdset, adKind + '|' + adDisplay, r.nicho, r.landing, r.sexo, r.pago, r.clinica].join('::');
    let b = buckets.get(key);
    if (!b) {
      b = {
        channel: r.channel,
        utm_campaign: metaCampaign,
        utm_medium:   metaAdset,
        utm_content:  r.utm_content,
        ad_display:   adDisplay,
        ad_kind:      adKind,
        ad_id:        metaAdId,
        video_id:     videoId,
        video_label:  videoLabel,
        nicho: r.nicho,
        landing: r.landing,
        sexo: r.sexo,
        pago: r.pago,
        clinica: r.clinica,
        visits: 0,
        started: 0,
        completed: 0,
        leads: 0,
        booked: 0,
        agendada: 0,
        atendida: 0,
        no_show: 0,
        cancelada: 0,
        paid: 0,
      };
      buckets.set(key, b);
    }
    b.leads += r.leads;
    b.booked += r.booked;
    b.agendada += r.agendada || 0;
    b.atendida += r.atendida || 0;
    b.no_show += r.no_show || 0;
    b.cancelada += r.cancelada || 0;
    b.paid += r.paid;
  }

  // Attach PostHog upstream to each bucket. Distribute proportionally to the
  // bucket's share of leads within the (utm_content, landing) group so rows
  // that split by sexo/pago don't all inherit the same raw count.
  const leadsByAdLanding = new Map();
  for (const b of buckets.values()) {
    const key = b.utm_content + '|' + b.landing;
    leadsByAdLanding.set(key, (leadsByAdLanding.get(key) || 0) + b.leads);
  }
  for (const b of buckets.values()) {
    const key = b.utm_content + '|' + b.landing;
    const upstream = phByAdLanding.get(key);
    if (!upstream) continue;
    const totalLeadsForGroup = leadsByAdLanding.get(key) || 0;
    const weight = totalLeadsForGroup > 0 ? (b.leads / totalLeadsForGroup) : 1;
    b.visits    = Math.round(upstream.visits * weight);
    b.started   = Math.round(upstream.started * weight);
    b.completed = Math.round(upstream.completed * weight);
  }

  return [...buckets.values()].sort((a, b) => b.leads - a.leads);
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  // Auth check
  const params = event.queryStringParameters || {};
  const secret = process.env.DASHBOARD_SECRET || 'hc-dashboard-2026';
  if (params.key !== secret) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing POSTHOG_PERSONAL_API_KEY' }) };
  }

  // Support custom date range: ?start=2026-04-01&end=2026-04-14
  // Or preset: ?days=30
  const days = parseInt(params.days) || 30;
  const customStart = params.start; // YYYY-MM-DD
  const customEnd = params.end;     // YYYY-MM-DD

  try {
    let dateFilter;
    let effectiveStart, effectiveEnd;

    if (customStart && customEnd) {
      // Custom date range
      effectiveStart = customStart;
      effectiveEnd = customEnd;
      dateFilter = `AND timestamp >= toDateTime('${customStart}') AND timestamp < toDateTime('${customEnd}') + interval 1 day`;
    } else {
      // Preset days, bounded by launch date
      effectiveEnd = new Date().toISOString().split('T')[0];
      const daysAgo = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
      effectiveStart = daysAgo > LAUNCH_DATE ? daysAgo : LAUNCH_DATE;
      dateFilter = `AND timestamp >= greatest(toDateTime('${LAUNCH_DATE}'), now() - interval ${days} day)`;
    }

    // Ad spend uses properties.date (the actual spend date) instead of event timestamp
    let adDateFilter;
    if (customStart && customEnd) {
      adDateFilter = `AND properties.date >= '${customStart}' AND properties.date <= '${customEnd}'`;
    } else {
      adDateFilter = `AND properties.date >= '${effectiveStart}'`;
    }

    const [
      kpiPageviews,
      kpiStarted,
      kpiCompleted,
      kpiLeads,
      kpiPaid,
      kpiBooked,
      kpiAttended,
      kpiNoShow,
      leadsBySource,
      bookingsBySource,
      funnelVisitsLeads,
      funnelBookings,
      byNicho,
      byEcp,
      dailyLeads,
      dailyLeadsBySource,
      noShowBySource,
      adSpendBySource,
      adSpendDaily,
      quizDropoff,
      bySexo,
      byFunnelDimensions,
      adSpendByCampaign,
    ] = await Promise.all([
      // KPIs — all use count() for funnel consistency
      // Pageviews: exclude non-landing paths (admin, preview, /agendar, /mi-cita,
      // /test-*, /api/*) so the funnel head matches actual ad-driven traffic.
      hogqlQuery(apiKey, `SELECT count(DISTINCT person_id) FROM events
        WHERE event = '$pageview'
          AND properties.$pathname NOT LIKE '/admin%'
          AND properties.$pathname NOT LIKE '/preview/%'
          AND properties.$pathname NOT LIKE '/agendar%'
          AND properties.$pathname NOT LIKE '/mi-cita%'
          AND properties.$pathname NOT LIKE '/test-%'
          AND properties.$pathname NOT LIKE '/api/%'
          ${dateFilter}`),
      hogqlQuery(apiKey, `SELECT count() FROM events WHERE (event = 'short_quiz_started' OR (event = 'quiz_started' AND properties.$pathname NOT LIKE '%/rapido/%')) ${dateFilter}`),
      hogqlQuery(apiKey, `SELECT count() FROM events WHERE event IN ('quiz_completed', 'short_quiz_completed') ${dateFilter}`),
      hogqlQuery(apiKey, `SELECT count() FROM events WHERE event IN ('form_submitted', 'direct_form_submitted') ${dateFilter}`),
      // Pagos: dedupe by stripe_session_id (each Stripe checkout fires payment_completed
      // exactly once from netlify/functions/stripe-webhook.js).
      hogqlQuery(apiKey, `SELECT count(DISTINCT toString(properties.stripe_session_id)) FROM events WHERE event = 'payment_completed' ${dateFilter}`),
      // Bookings: dedupe by opportunity_id across v4+v5 sync batches. A single opp
      // can have both a legacy _v4 insert_id and a new _v5 one after the sync
      // re-emits with enriched properties — dedupe-by-opp keeps the count stable.
      hogqlQuery(apiKey, `SELECT count(DISTINCT toString(properties.opportunity_id)) FROM events WHERE event = 'appointment_booked' AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5') ${dateFilter}`),
      hogqlQuery(apiKey, `SELECT count(DISTINCT toString(properties.opportunity_id)) FROM events WHERE event = 'appointment_attended' AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5') ${dateFilter}`),
      hogqlQuery(apiKey, `SELECT count(DISTINCT toString(properties.opportunity_id)) FROM events WHERE event = 'appointment_no_show' AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5') ${dateFilter}`),

      // Leads + Visits by traffic source. Coalesces UTM source from every
      // place PostHog might park it: event-level $utm_source (autocapture
      // from URL), event-level utm_source (sometimes set explicitly), and
      // person-level $initial_utm_source (set on first pageview, propagates
      // back to anonymous events). Without this coalesce 99% of visits fall
      // into "direct" because PostHog stores UTM as $-prefixed only on the
      // FIRST event, and everything else lacks it.
      hogqlQuery(apiKey, `
        SELECT
          multiIf(
            lower(coalesce(
              nullIf(toString(properties.$utm_source), ''),
              nullIf(toString(properties.utm_source), ''),
              nullIf(toString(person.properties.$initial_utm_source), ''),
              nullIf(toString(person.properties.utm_source), ''),
              ''
            )) IN ('facebook', 'instagram', 'meta', 'fb', 'ig'), 'meta',
            lower(coalesce(
              nullIf(toString(properties.$utm_source), ''),
              nullIf(toString(properties.utm_source), ''),
              nullIf(toString(person.properties.$initial_utm_source), ''),
              nullIf(toString(person.properties.utm_source), ''),
              ''
            )) IN ('google', 'google_ads', 'gads', 'adwords'), 'google_ads',
            isNotNull(properties.$initial_referring_domain) AND toString(properties.$initial_referring_domain) LIKE '%facebook%', 'meta',
            isNotNull(properties.$initial_referring_domain) AND toString(properties.$initial_referring_domain) LIKE '%instagram%', 'meta',
            isNotNull(properties.$initial_referring_domain) AND toString(properties.$initial_referring_domain) LIKE '%google%', 'google_ads',
            isNotNull(properties.$referring_domain) AND toString(properties.$referring_domain) LIKE '%facebook%', 'meta',
            isNotNull(properties.$referring_domain) AND toString(properties.$referring_domain) LIKE '%instagram%', 'meta',
            isNotNull(properties.$referring_domain) AND toString(properties.$referring_domain) LIKE '%google%', 'google_ads',
            'direct'
          ) as source,
          count(DISTINCT if(event = '$pageview', person_id, NULL)) as visits,
          countIf(event IN ('form_submitted', 'direct_form_submitted')) as leads
        FROM events
        WHERE event IN ('$pageview', 'form_submitted', 'direct_form_submitted')
          AND properties.$pathname NOT LIKE '/admin%'
          AND properties.$pathname NOT LIKE '/preview/%'
          AND properties.$pathname NOT LIKE '/agendar%'
          AND properties.$pathname NOT LIKE '/mi-cita%'
          AND properties.$pathname NOT LIKE '/test-%'
          AND properties.$pathname NOT LIKE '/api/%'
          ${dateFilter}
        GROUP BY source
        ORDER BY leads DESC
      `),

      // Bookings by traffic source — dedupe by opportunity_id across v4+v5
      hogqlQuery(apiKey, `
        SELECT
          properties.traffic_source as source,
          uniqIf(toString(properties.opportunity_id), event = 'appointment_booked') as booked,
          uniqIf(toString(properties.opportunity_id), event = 'appointment_attended') as attended,
          uniqIf(toString(properties.opportunity_id), event = 'appointment_no_show') as no_show
        FROM events
        WHERE event IN ('appointment_booked', 'appointment_attended', 'appointment_no_show')
          AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5')
          ${dateFilter}
        GROUP BY properties.traffic_source
      `),

      // Visits + leads by URL path
      // NOTE: short flow emits both 'quiz_started' and 'short_quiz_started' on the
      // same CTA click, so we count short_quiz_started on /rapido/* and quiz_started
      // elsewhere to avoid double counting.
      // Non-landing paths (/agendar, /mi-cita, /test-*, /preview/*) are bucketed as
      // 'other' and filtered out so quiz_largo visits reflect only landing traffic.
      hogqlQuery(apiKey, `
        SELECT
          multiIf(
            properties.$pathname LIKE '%/rapido/%', 'quiz_corto',
            properties.$pathname LIKE '%/form/%', 'form_directo',
            properties.$pathname LIKE '/p/%' OR properties.$pathname = '/p', 'form_meta_directo',
            properties.$pathname LIKE '/agendar%'
              OR properties.$pathname LIKE '/mi-cita%'
              OR properties.$pathname LIKE '/test-%'
              OR properties.$pathname LIKE '/preview/%'
              OR properties.$pathname LIKE '/admin%'
              OR properties.$pathname LIKE '/api/%', 'other',
            'quiz_largo'
          ) as funnel,
          count(DISTINCT if(event = '$pageview', person_id, NULL)) as visits,
          countIf(
            event = 'short_quiz_started'
            OR (event = 'quiz_started' AND properties.$pathname NOT LIKE '%/rapido/%')
          ) as started,
          countIf(event IN ('form_submitted', 'direct_form_submitted')) as leads
        FROM events
        WHERE event IN ('$pageview', 'quiz_started', 'short_quiz_started', 'form_submitted', 'direct_form_submitted')
          ${dateFilter}
        GROUP BY funnel
        HAVING funnel != 'other'
        ORDER BY visits DESC
      `),

      // Bookings by funnel_type — dedupe by opportunity_id across v4+v5
      hogqlQuery(apiKey, `
        SELECT
          properties.funnel_type as funnel,
          count(DISTINCT toString(properties.opportunity_id)) as booked
        FROM events
        WHERE event = 'appointment_booked'
          AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5')
          ${dateFilter}
        GROUP BY funnel
      `),

      // By nicho
      hogqlQuery(apiKey, `
        SELECT properties.nicho as nicho, count() as cnt
        FROM events
        WHERE event IN ('quiz_completed', 'short_quiz_completed')
          ${dateFilter}
        GROUP BY properties.nicho
        ORDER BY cnt DESC
      `),

      // ECP classification
      hogqlQuery(apiKey, `
        SELECT properties.ecp as ecp, count() as cnt
        FROM events
        WHERE event = 'lead_classified'
          ${dateFilter}
        GROUP BY properties.ecp
        ORDER BY cnt DESC
      `),

      // Daily leads
      hogqlQuery(apiKey, `
        SELECT toDate(timestamp) as day, count() as cnt
        FROM events
        WHERE event IN ('form_submitted', 'direct_form_submitted')
          ${dateFilter}
        GROUP BY day
        ORDER BY day ASC
      `),

      // Daily leads by source
      hogqlQuery(apiKey, `
        SELECT toDate(timestamp) as day, properties.traffic_source as source, count() as cnt
        FROM events
        WHERE event IN ('form_submitted', 'direct_form_submitted')
          ${dateFilter}
        GROUP BY day, source
        ORDER BY day ASC
      `),

      // No-show by source
      hogqlQuery(apiKey, `
        SELECT properties.traffic_source as source,
          count(DISTINCT properties.$insert_id) as cnt
        FROM events
        WHERE event = 'appointment_no_show'
          ${dateFilter}
        GROUP BY source
        ORDER BY cnt DESC
      `),

      // Ad spend by source — G4U-only. HC runs other campaigns through the same
      // ad accounts ("Campaña Madrid", "Camp. Murcia", WhatsApp lead gen, etc.)
      // that would otherwise inflate our spend. Filter to:
      //   - Meta: campaign_name must contain 'G4U' (our naming convention)
      //   - Google: all events pass (sync-ad-spend already filters to campaigns
      //     whose final_urls target diagnostico.hospitalcapilar.com)
      hogqlQuery(apiKey, `
        SELECT
          properties.source as ad_source,
          sum(toFloatOrZero(toString(properties.spend))) as total_spend,
          sum(toIntOrZero(toString(properties.clicks))) as total_clicks,
          sum(toIntOrZero(toString(properties.impressions))) as total_impressions,
          sum(toIntOrZero(toString(properties.conversions))) as total_conversions
        FROM events
        WHERE event = 'ad_spend_daily'
          AND properties.$insert_id IS NOT NULL
          AND (
            properties.source = 'google_ads'
            OR (properties.source = 'meta_ads' AND toString(properties.campaign_name) LIKE '%G4U%')
          )
          ${adDateFilter}
        GROUP BY properties.source
        ORDER BY total_spend DESC
      `),

      // Ad spend daily trend — same G4U-only filter
      hogqlQuery(apiKey, `
        SELECT
          properties.date as spend_date,
          properties.source as ad_source,
          sum(toFloatOrZero(toString(properties.spend))) as daily_spend
        FROM events
        WHERE event = 'ad_spend_daily'
          AND properties.$insert_id IS NOT NULL
          AND (
            properties.source = 'google_ads'
            OR (properties.source = 'meta_ads' AND toString(properties.campaign_name) LIKE '%G4U%')
          )
          ${adDateFilter}
        GROUP BY properties.date, properties.source
        ORDER BY spend_date ASC
      `),

      // Quiz drop-off — use screen_viewed (fires on every screen render:
      // questions, info/social-proof intermissions, contact form, results),
      // not question_answered (which misses people who viewed a screen but
      // never clicked an option). Expose screen_type so the UI can label
      // info screens distinctly from questions.
      hogqlQuery(apiKey, `
        SELECT
          toString(properties.screen_id) as s_id,
          min(properties.screen_index) as s_idx,
          argMin(toString(properties.screen_type), properties.screen_index) as s_type,
          count(DISTINCT person_id) as users
        FROM events
        WHERE event = 'screen_viewed'
          AND properties.screen_id IS NOT NULL
          ${dateFilter}
        GROUP BY s_id
        ORDER BY s_idx ASC NULLS LAST
      `),

      // By sexo — resolve sexo at the PERSON level only (not the event level).
      // A single opportunity can have multiple appointment_booked events across
      // sync re-runs; some may have properties.sexo=null while others have it
      // populated. Grouping by the event-level field would split the same opp
      // across buckets. Person.properties.sexo is consistent across ALL events
      // of the same person (set once by GHL sync $set / $identify), so it gives
      // a stable per-opportunity bucket.
      hogqlQuery(apiKey, `
        SELECT
          coalesce(nullIf(lower(toString(person.properties.sexo)), ''), 'sin-dato') as sexo,
          count(DISTINCT if(event = '$pageview', person_id, NULL)) as visits,
          countIf(
            event = 'short_quiz_started'
            OR (event = 'quiz_started' AND properties.$pathname NOT LIKE '%/rapido/%')
          ) as started,
          countIf(event IN ('form_submitted', 'direct_form_submitted', 'lead_form_submitted')) as leads,
          uniqIf(toString(properties.opportunity_id),
                 event = 'appointment_booked'
                 AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5')) as booked
        FROM events
        WHERE event IN (
          '$pageview',
          'quiz_started', 'short_quiz_started',
          'form_submitted', 'direct_form_submitted', 'lead_form_submitted',
          'appointment_booked'
        )
          ${dateFilter}
        GROUP BY sexo
        HAVING visits > 0 OR started > 0 OR leads > 0 OR booked > 0
        ORDER BY leads DESC
      `),

      // F3 — master funnel table: 1 row per (utm_content, landing, nicho, sexo, payment_variant).
      // Coalesce chain: event-level property → PostHog $utm_* autocapture → person-level
      // $initial_utm_* (set once per person on first pageview) → person custom property.
      // This ensures events fired AFTER the user navigated off the landing URL still
      // attribute to the original ad.
      hogqlQuery(apiKey, `
        SELECT
          coalesce(
            nullIf(toString(properties.utm_content), ''),
            nullIf(toString(properties.$utm_content), ''),
            nullIf(toString(person.properties.$initial_utm_content), ''),
            nullIf(toString(person.properties.utm_content), ''),
            'sin-atribucion'
          ) as ad,
          multiIf(
            toString(properties.$pathname) LIKE '%/rapido/%', 'quiz_corto',
            toString(properties.$pathname) LIKE '%/form/%', 'formulario_directo',
            toString(properties.$pathname) LIKE '/p/%' OR toString(properties.$pathname) = '/p', 'form_meta_directo',
            coalesce(
              nullIf(toString(properties.funnel_type), ''),
              nullIf(toString(person.properties.funnel_type), ''),
              'quiz_largo'
            )
          ) as landing,
          coalesce(
            nullIf(toString(properties.nicho), ''),
            nullIf(toString(person.properties.nicho), ''),
            'sin-nicho'
          ) as nicho,
          coalesce(
            nullIf(toString(properties.sexo), ''),
            nullIf(toString(person.properties.sexo), ''),
            'sin-dato'
          ) as sexo,
          coalesce(
            nullIf(toString(properties.payment_variant), ''),
            nullIf(toString(person.properties.payment_variant), ''),
            'sin-dato'
          ) as payment_variant,
          count(DISTINCT if(event = '$pageview', person_id, NULL)) as visits,
          countIf(
            event = 'short_quiz_started'
            OR (event = 'quiz_started' AND properties.$pathname NOT LIKE '%/rapido/%')
          ) as started,
          countIf(event IN ('quiz_completed', 'short_quiz_completed')) as completed,
          countIf(event IN ('form_submitted', 'direct_form_submitted', 'lead_form_submitted')) as leads,
          uniqIf(toString(properties.stripe_session_id),
                 event = 'payment_completed') as paid,
          uniqIf(toString(properties.opportunity_id),
                 event = 'appointment_booked' AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5')) as booked,
          uniqIf(toString(properties.opportunity_id),
                 event = 'appointment_attended' AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5')) as attended,
          uniqIf(toString(properties.opportunity_id),
                 event = 'appointment_no_show' AND (toString(properties.$insert_id) LIKE '%_v4' OR toString(properties.$insert_id) LIKE '%_v5')) as no_show
        FROM events
        WHERE event IN (
          '$pageview',
          'quiz_started', 'short_quiz_started',
          'quiz_completed', 'short_quiz_completed',
          'form_submitted', 'direct_form_submitted', 'lead_form_submitted',
          'payment_completed',
          'appointment_booked', 'appointment_attended', 'appointment_no_show'
        )
          ${dateFilter}
        GROUP BY ad, landing, nicho, sexo, payment_variant
        HAVING visits > 0 OR started > 0 OR leads > 0 OR paid > 0 OR booked > 0
        ORDER BY visits DESC, leads DESC
      `),

      // F3 — ad spend grouped by campaign (G4U-only: see filter note above).
      hogqlQuery(apiKey, `
        SELECT
          toString(properties.source) as ad_source,
          coalesce(nullIf(toString(properties.campaign_id), ''), 'unknown') as campaign_id,
          coalesce(nullIf(toString(properties.campaign_name), ''), '') as campaign_name,
          sum(toFloatOrZero(toString(properties.spend))) as spend,
          sum(toIntOrZero(toString(properties.clicks))) as clicks,
          sum(toIntOrZero(toString(properties.impressions))) as impressions
        FROM events
        WHERE event = 'ad_spend_daily'
          AND (
            properties.source = 'google_ads'
            OR (properties.source = 'meta_ads' AND toString(properties.campaign_name) LIKE '%G4U%')
          )
          ${adDateFilter}
        GROUP BY ad_source, campaign_id, campaign_name
        ORDER BY spend DESC
      `),
    ]);

    // Helper to extract single value
    const val = (result) => (result && result[0] && result[0][0]) || 0;

    // Merge leads/visits and bookings by traffic source
    const sourceMap = {};
    for (const row of leadsBySource) {
      const src = row[0];
      if (!sourceMap[src]) sourceMap[src] = { visits: 0, leads: 0, booked: 0, attended: 0, no_show: 0 };
      sourceMap[src].visits = row[1];
      sourceMap[src].leads = row[2];
    }
    for (const row of bookingsBySource) {
      const src = row[0];
      if (!sourceMap[src]) sourceMap[src] = { visits: 0, leads: 0, booked: 0, attended: 0, no_show: 0 };
      sourceMap[src].booked = row[1];
      sourceMap[src].attended = row[2];
      sourceMap[src].no_show = row[3];
    }
    const byTrafficSource = Object.entries(sourceMap)
      .map(([source, data]) => ({ source, ...data }))
      .sort((a, b) => b.leads - a.leads);

    const result = {
      days,
      start: effectiveStart,
      end: effectiveEnd,
      launch_date: LAUNCH_DATE,
      generated_at: new Date().toISOString(),
      kpis: {
        pageviews: val(kpiPageviews),
        quiz_started: val(kpiStarted),
        quiz_completed: val(kpiCompleted),
        form_submitted: val(kpiLeads),
        payment_completed: val(kpiPaid),
        appointment_booked: val(kpiBooked),
        appointment_attended: val(kpiAttended),
        appointment_no_show: val(kpiNoShow),
      },
      by_traffic_source: byTrafficSource,
      by_funnel_type: (() => {
        // Merge visits/leads (by URL path) with bookings (by GHL funnel_type)
        const fMap = {};
        for (const row of funnelVisitsLeads) {
          const f = row[0];
          if (!fMap[f]) fMap[f] = { visits: 0, started: 0, leads: 0, booked: 0 };
          fMap[f].visits = row[1];
          fMap[f].started = row[2];
          fMap[f].leads = row[3];
        }
        for (const row of funnelBookings) {
          const f = row[0];
          if (!fMap[f]) fMap[f] = { visits: 0, started: 0, leads: 0, booked: 0 };
          fMap[f].booked = row[1];
        }
        return Object.entries(fMap)
          .filter(([f]) => f && f !== 'null' && f !== 'None')
          .map(([funnel, d]) => ({ funnel, visits: d.visits, started: d.started, leads: d.leads, booked: d.booked }))
          .sort((a, b) => b.visits - a.visits);
      })(),
      by_nicho: byNicho.map(row => ({
        nicho: row[0],
        count: row[1],
      })),
      by_ecp: byEcp.map(row => ({
        ecp: row[0],
        count: row[1],
      })),
      daily_leads: dailyLeads.map(row => ({
        date: row[0],
        count: row[1],
      })),
      daily_leads_by_source: dailyLeadsBySource.map(row => ({
        date: row[0],
        source: row[1],
        count: row[2],
      })),
      attended_by_source: [],
      no_show_by_source: noShowBySource.map(row => ({
        source: row[0],
        count: row[1],
      })),
      ad_spend_by_source: adSpendBySource.map(row => ({
        source: row[0],
        spend: row[1],
        clicks: row[2],
        impressions: row[3],
        conversions: row[4],
      })),
      ad_spend_daily: adSpendDaily.map(row => ({
        date: row[0],
        source: row[1],
        spend: row[2],
      })),
      quiz_dropoff: quizDropoff.map(row => ({
        question_id: row[0],
        question_index: row[1],
        screen_type: row[2], // 'question' | 'social_proof' | 'contact_form' | 'results'
        users: row[3],
      })),
      by_sexo: bySexo.map(row => ({
        sexo: row[0],
        visits: row[1],
        started: row[2],
        leads: row[3],
        booked: row[4],
      })),
      by_funnel_dimensions: byFunnelDimensions.map(row => ({
        utm_content: row[0],
        landing: row[1],
        nicho: row[2],
        sexo: row[3],
        payment_variant: row[4],
        visits: row[5],
        started: row[6],
        completed: row[7],
        leads: row[8],
        paid: row[9],
        booked: row[10],
        attended: row[11],
        no_show: row[12],
      })),
      ad_spend_by_campaign: (() => {
        // Apply campaign name aliases and merge any duplicates that result.
        const merged = new Map();
        for (const row of adSpendByCampaign) {
          const aliasedName = aliasCampaignName(row[2]);
          const key = row[0] + '::' + aliasedName;
          const existing = merged.get(key);
          if (existing) {
            existing.spend       += Number(row[3]) || 0;
            existing.clicks      += Number(row[4]) || 0;
            existing.impressions += Number(row[5]) || 0;
          } else {
            merged.set(key, {
              source: row[0],
              campaign_id: row[1],
              campaign_name: aliasedName,
              spend: Number(row[3]) || 0,
              clicks: Number(row[4]) || 0,
              impressions: Number(row[5]) || 0,
            });
          }
        }
        return [...merged.values()].sort((a, b) => b.spend - a.spend);
      })(),
      executive_header: (() => {
        // Global funnel stages
        const p = val(kpiPageviews);
        const s = val(kpiStarted);
        const c = val(kpiCompleted);
        const l = val(kpiLeads);
        const pa = val(kpiPaid);
        const b = val(kpiBooked);
        const a = val(kpiAttended);
        const stages = [
          { from: 'Visitante',      to: 'Iniciado',   prev: p, curr: s },
          { from: 'Iniciado',       to: 'Finalizado', prev: s, curr: c },
          { from: 'Finalizado',     to: 'Lead',       prev: c, curr: l },
          { from: 'Lead',           to: 'Pago',       prev: l, curr: pa },
          { from: 'Pago',           to: 'Cita',       prev: pa, curr: b },
          { from: 'Cita',           to: 'Asiste',     prev: b, curr: a },
        ];
        const withDrop = stages
          .filter(st => st.prev > 0)
          .map(st => ({ ...st, drop_pct: 100 * (1 - st.curr / st.prev), retention_pct: 100 * st.curr / st.prev }));
        const bottleneck = withDrop.length
          ? withDrop.reduce((worst, cur) => (cur.drop_pct > worst.drop_pct ? cur : worst), withDrop[0])
          : null;

        // Top/Bottom funnels — compute ratio booked/visits per funnel line;
        // minimum traffic gate so we don't rank noise.
        const lines = (byFunnelDimensions || [])
          .map(row => ({
            utm_content: row[0],
            landing: row[1],
            nicho: row[2],
            sexo: row[3],
            payment_variant: row[4],
            visits: row[5],
            started: row[6],
            completed: row[7],
            leads: row[8],
            paid: row[9],
            booked: row[10],
          }))
          .filter(r => r.visits >= 30 || r.leads >= 3);
        const scored = lines
          .map(r => ({ ...r, conv_pct: r.visits > 0 ? 100 * r.booked / r.visits : 0 }))
          .filter(r => r.conv_pct > 0);
        scored.sort((x, y) => y.conv_pct - x.conv_pct);
        const top = scored.slice(0, 3);
        const bottom = scored.slice(-3).reverse();

        // Budget: Alfonso 2026-04-21 set 500€/semana × 2 semanas = 2.000€ total
        // for the 3-niche pilot. Overridable per-request via ?budget= later if needed.
        const totalSpend = (adSpendBySource || []).reduce((sum, row) => sum + (Number(row[1]) || 0), 0);
        const budgetAssigned = 2000;

        return {
          bottleneck: bottleneck
            ? {
                from: bottleneck.from,
                to: bottleneck.to,
                drop_pct: Number(bottleneck.drop_pct.toFixed(1)),
                retention_pct: Number(bottleneck.retention_pct.toFixed(1)),
                abs_lost: bottleneck.prev - bottleneck.curr,
              }
            : null,
          top_funnels: top,
          bottom_funnels: bottom,
          budget: {
            assigned: budgetAssigned,
            spent: Number(totalSpend.toFixed(2)),
            remaining: Number((budgetAssigned - totalSpend).toFixed(2)),
            pct_used: budgetAssigned > 0 ? Number((100 * totalSpend / budgetAssigned).toFixed(1)) : 0,
          },
          global_cpl: l > 0 && totalSpend > 0 ? Number((totalSpend / l).toFixed(2)) : null,
          global_cpa: b > 0 && totalSpend > 0 ? Number((totalSpend / b).toFixed(2)) : null,
        };
      })(),
    };

    // GHL-backed sections (source of truth for sexo, pipeline, payment tags).
    // Fetched once, used to derive both by_sexo and the master funnel table.
    try {
      const ghlRows = await fetchGhlOppsWithContacts(effectiveStart, effectiveEnd);
      if (ghlRows) {
        // by_sexo — leads/booked/paid from GHL (operational truth) + visits
        // from PostHog (only place we have $pageview by person.properties.sexo).
        const bySexoMap = {};
        for (const r of ghlRows) {
          if (!bySexoMap[r.sexo]) bySexoMap[r.sexo] = { sexo: r.sexo, visits: 0, started: 0, leads: 0, booked: 0, paid: 0 };
          bySexoMap[r.sexo].leads += r.leads;
          bySexoMap[r.sexo].booked += r.booked;
          bySexoMap[r.sexo].paid += r.paid;
        }
        // Merge in PostHog visits/started by sexo (the original by_sexo array).
        for (const ph of (result.by_sexo || [])) {
          const s = ph.sexo || 'sin-dato';
          if (!bySexoMap[s]) bySexoMap[s] = { sexo: s, visits: 0, started: 0, leads: 0, booked: 0, paid: 0 };
          bySexoMap[s].visits = ph.visits || 0;
          bySexoMap[s].started = ph.started || 0;
        }
        const bySexoArr = Object.values(bySexoMap).sort((a, b) => b.leads - a.leads);
        if (bySexoArr.length > 0) result.by_sexo = bySexoArr;

        // ─── SINGLE SOURCE OF TRUTH ───
        // GHL is the operational system. Override KPIs derived from PostHog
        // events so every widget tells the same story:
        //   leads      = unique opps in pipeline
        //   agendada   = currently scheduled (booked|reminder_sent)
        //   atendida   = attended|won
        //   no_show    = no_show stage
        //   cancelada  = lost stage (booked then cancelled)
        //   booked     = ever made it to a booking (sum of the 4 above)
        const ghlAgg = ghlRows.reduce((acc, r) => ({
          leads:     acc.leads + r.leads,
          agendada:  acc.agendada + (r.agendada || 0),
          atendida:  acc.atendida + (r.atendida || 0),
          no_show:   acc.no_show + (r.no_show || 0),
          cancelada: acc.cancelada + (r.cancelada || 0),
          paid:      acc.paid + r.paid,
        }), { leads: 0, agendada: 0, atendida: 0, no_show: 0, cancelada: 0, paid: 0 });
        const ghlBooked = ghlAgg.agendada + ghlAgg.atendida + ghlAgg.no_show + ghlAgg.cancelada;
        result.kpis = {
          ...result.kpis,
          leads_ghl: ghlAgg.leads,
          appointment_booked: ghlBooked,
          appointment_attended: ghlAgg.atendida,
          appointment_no_show: ghlAgg.no_show,
          appointment_cancelada: ghlAgg.cancelada,
          appointment_agendada: ghlAgg.agendada,
        };
        // Replace executive_header stages with GHL truth so the funnel adds up.
        if (result.executive_header) {
          result.executive_header.ghl_truth = {
            leads: ghlAgg.leads,
            agendada: ghlAgg.agendada,
            atendida: ghlAgg.atendida,
            no_show: ghlAgg.no_show,
            cancelada: ghlAgg.cancelada,
            paid: ghlAgg.paid,
          };
        }

        // Master funnel — one row per unique 9-dim combination, enriched
        // with upstream counts from the PostHog slice + Meta catalog so
        // utm_content → ad_id/adset_name/campaign_name reflect real Meta.
        const [metaCatalog, googleCatalog] = await Promise.all([
          fetchMetaAdCatalog(),
          fetchGoogleAdsCatalog(),
        ]);
        result.by_master_funnel = buildMasterFunnelFromGhl(ghlRows, result.by_funnel_dimensions, metaCatalog, googleCatalog);
        result.meta_ads_catalog_size = metaCatalog?.count || 0;
        result.google_ads_catalog_size = googleCatalog?.count || 0;

        // ─── Override by_funnel_type with GHL counts ───
        // Same drift as by_traffic_source: PostHog form events count differently
        // than GHL opps (mostly because lead_form_submitted from Meta Lead Form
        // creates GHL opps without firing the standard form_submitted event).
        // Using GHL keeps "Comparativa por funnel" aligned with everything else.
        // Normalize all funnel labels to one of 4 canonical buckets.
        const normalizeFunnelKey = (raw) => {
          const v = (raw || '').toLowerCase();
          if (v === 'quiz_largo' || v === 'quiz largo') return 'quiz_largo';
          if (v === 'quiz_corto' || v === 'quiz corto' || v === 'quiz_rapido' || /r[áa]pido/.test(v)) return 'quiz_corto';
          if (v === 'form_directo' || v === 'formulario_directo' || v === 'form') return 'form_directo';
          // form_meta_directo, sin-dato, anything unmatched → form_meta_directo
          return 'form_meta_directo';
        };
        const ghlFunnelMap = {};
        for (const r of ghlRows) {
          const f = normalizeFunnelKey(r.landing);
          if (!ghlFunnelMap[f]) ghlFunnelMap[f] = { funnel: f, visits: 0, started: 0, leads: 0, booked: 0 };
          ghlFunnelMap[f].leads  += r.leads || 0;
          ghlFunnelMap[f].booked += r.booked || 0;
        }
        // Merge PostHog visits/started (PostHog uses 'formulario_directo' which
        // we collapse into 'form_directo' so visits and leads land on the same row).
        for (const ph of (result.by_funnel_type || [])) {
          const f = normalizeFunnelKey(ph.funnel);
          if (!ghlFunnelMap[f]) ghlFunnelMap[f] = { funnel: f, visits: 0, started: 0, leads: 0, booked: 0 };
          ghlFunnelMap[f].visits  += ph.visits  || 0;
          ghlFunnelMap[f].started += ph.started || 0;
        }
        result.by_funnel_type = Object.values(ghlFunnelMap)
          .sort((a, b) => b.leads - a.leads);

        // ─── Override by_traffic_source with GHL counts ───
        // PostHog form_submitted events lose UTM attribution often (autocapture
        // only sets $utm_source on the landing pageview, not on later events).
        // GHL is operational truth — every contact has a resolved channel via
        // utm_source CF / source string. Overriding here makes "Leads y citas
        // por fuente" match the Camino tables row-for-row.
        const channelFromGhlRow = (r) => {
          // r.channel comes pre-normalized in fetchGhlOppsWithContacts.
          // Anything unmatched (Sin dato, empty, organic IG DM) → sin_tracking.
          // Pre-2026-05-04 we labelled this 'direct' which was misleading
          // because we only run paid Meta/Google — there is no organic
          // direct funnel. Renaming makes attribution honest.
          const ch = (r.channel || '').toLowerCase();
          if (ch === 'meta') return 'meta';
          if (ch === 'google') return 'google_ads';
          return 'sin_tracking';
        };
        const ghlChannelMap = {};
        for (const r of ghlRows) {
          const k = channelFromGhlRow(r);
          if (!ghlChannelMap[k]) ghlChannelMap[k] = { source: k, visits: 0, leads: 0, booked: 0, attended: 0, no_show: 0 };
          ghlChannelMap[k].leads    += r.leads || 0;
          ghlChannelMap[k].booked   += r.booked || 0;
          ghlChannelMap[k].attended += r.atendida || 0;
          ghlChannelMap[k].no_show  += r.no_show || 0;
        }
        // Preserve PostHog-derived visits per channel (visits aren't in GHL).
        for (const ph of (result.by_traffic_source || [])) {
          const k = (ph.source || '').toLowerCase();
          if (ghlChannelMap[k]) ghlChannelMap[k].visits = ph.visits || 0;
          else if (ph.visits > 0) ghlChannelMap[k] = { source: k, visits: ph.visits, leads: 0, booked: 0, attended: 0, no_show: 0 };
        }
        result.by_traffic_source = Object.values(ghlChannelMap).sort((a, b) => b.leads - a.leads);

        // Expose every ACTIVE G4U ad (Meta + Google) so the master table can
        // mirror Meta's structure 1:1 — even ads with 0 leads show up as
        // rows with all metrics at 0. This way the dashboard reflects the
        // marketer's reality (what's running) instead of just what produced
        // leads.
        result.meta_active_ads = [];
        if (metaCatalog?.byId) {
          for (const a of Object.values(metaCatalog.byId)) {
            if (a.is_g4u && a.status === 'ACTIVE') {
              result.meta_active_ads.push({
                ad_id: a.ad_id,
                ad_name: a.ad_name,
                campaign_id: a.campaign_id,
                campaign_name: a.campaign_name,
                adset_id: a.adset_id,
                adset_name: a.adset_name,
                adset_landing: a.adset_landing,
                video_id: a.video_id,
                video_label: metaCatalog.videoLabel?.[a.video_id] || '',
              });
            }
          }
        }
        result.google_active_ad_groups = [];
        if (googleCatalog?.byAdGroupId) {
          for (const g of Object.values(googleCatalog.byAdGroupId)) {
            result.google_active_ad_groups.push({
              ad_group_id: g.ad_group_id,
              ad_group_name: g.ad_group_name,
              campaign_id: g.campaign_id,
              campaign_name: g.campaign_name,
            });
          }
        }

        // ─── Comparativa Camino Pago vs Camino No-pago ───
        // Bucket every master row by its routing path. Pagos column is N/A
        // for the no-paywall branch since it doesn't apply.
        const caminoOf = (pago) => {
          if (pago === '125' || pago === '195')        return 'pago';
          if (pago === '0')                             return 'no_pago';
          if (pago === 'clinica' || pago === 'asesores') return 'clinica';
          return 'sin_dato';
        };
        const caminoBuckets = { pago: aggInit(), no_pago: aggInit(), clinica: aggInit(), sin_dato: aggInit() };
        function aggInit() { return { visits: 0, started: 0, completed: 0, leads: 0, paid: 0, booked: 0, agendada: 0, atendida: 0, no_show: 0, cancelada: 0 }; }
        for (const row of result.by_master_funnel) {
          const c = caminoOf(row.pago);
          const b = caminoBuckets[c];
          b.visits    += row.visits || 0;
          b.started   += row.started || 0;
          b.completed += row.completed || 0;
          b.leads     += row.leads || 0;
          b.paid      += row.paid || 0;
          b.booked    += row.booked || 0;
          b.agendada  += row.agendada || 0;
          b.atendida  += row.atendida || 0;
          b.no_show   += row.no_show || 0;
          b.cancelada += row.cancelada || 0;
        }
        result.by_camino = [
          { camino: 'pago',     label: 'Camino Pago',     pago_aplica: true,  ...caminoBuckets.pago },
          { camino: 'no_pago',  label: 'Camino No-Pago',  pago_aplica: false, ...caminoBuckets.no_pago },
          { camino: 'clinica',  label: 'Pago en Clínica', pago_aplica: false, ...caminoBuckets.clinica },
          { camino: 'sin_dato', label: 'Sin Dato',        pago_aplica: false, ...caminoBuckets.sin_dato },
        ];
        if (metaCatalog?._error) result.meta_ads_catalog_error = metaCatalog._error;
        if (googleCatalog?._error) result.google_ads_catalog_error = googleCatalog._error;
        // Expose the Video N → creative names mapping so the dashboard can
        // show the user what each video label corresponds to in Meta.
        if (metaCatalog?.videoLabel) {
          result.meta_videos = Object.entries(metaCatalog.videoLabel).map(([videoId, label]) => {
            const ads = metaCatalog.byVideoId[videoId] || [];
            const g4uAds = ads.filter(a => a.is_g4u);
            return {
              video_id: videoId,
              label,
              ad_count: ads.length,
              ads: g4uAds.map(a => ({
                ad_id: a.ad_id,
                ad_name: a.ad_name,
                campaign_name: a.campaign_name,
                adset_name: a.adset_name,
                status: a.status,
                thumbnail: a.thumbnail,
              })),
            };
          });
        }
      }
    } catch (e) {
      console.log('[Dashboard] GHL fetch failed, falling back to PostHog:', e.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error('Dashboard data error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

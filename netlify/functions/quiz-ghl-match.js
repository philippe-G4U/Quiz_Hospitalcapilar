// Matches a completed quiz submission to a GHL contact.
//
// The Meta Lead Form creates the GHL contact at submit time (via the native
// Meta→GHL integration). But Meta does NOT pass the lead's data to the quiz
// redirect URL (platform limitation — {{form.*}} macros don't substitute).
//
// So the quiz re-collects email/phone/name at the end and calls this function
// to:
//   1. Search GHL for the existing contact by email, then phone.
//   2. If found  → UPDATE it with sexo + protocolo + quiz answers.
//   3. If not    → CREATE a new contact with all the data.
//   4. Return the contactId so the quiz can pass it to the GHL calendar widget.

const GHL_BASE = 'https://services.leadconnectorhq.com';

// Custom field IDs (Contact level)
const CF = {
  sexo_lead_form:      'ySOJCraPl26CR161KFxW',
  preocupacion_caida:  'hLiD1jVS5UkzJUjLWo8g',
  protocolo:           '3gtJmZDpIBs1xA7WDAcV',
  quiz_respuestas:     'sm2O9sRwzQDAJwQAFp1J',
  door:                '2JYlfGk60lHbuyh9vcdV',
  utm_source:          'MisB9YJJAH7cnh8JOtQn',
  utm_medium:          'vykx7m6bcfbYMXRqToYP',
  utm_campaign:        '3fUI7GO9o7oZ7ddMNnFf',
  utm_content:         'dydSaUSYbb5R7nYOboLq',
  utm_term:            'eLdhsOthmyD38al527tG',
};

// Normalize a phone to digits + leading + (best effort). GHL stores E.164-ish.
function normalizePhone(raw) {
  if (!raw) return '';
  let p = String(raw).trim().replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (!p.startsWith('+') && p.length === 9) p = '+34' + p; // Spanish default
  return p;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.VITE_GHL_API_KEY;
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GHL API key not configured' }) };

  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const {
    nombre = '', email = '', telefono = '',
    sexo = '', protocolo = '', quizAnswers = null,
    utm_source = '', utm_medium = '', utm_campaign = '',
    utm_content = '', utm_term = '',
  } = body;

  const emailClean = String(email).trim().toLowerCase();
  const phoneClean = normalizePhone(telefono);

  if (!emailClean && !phoneClean) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Need email or phone to match' }) };
  }

  // 1. Search for existing contact — by email first, then phone.
  let contactId = null;
  let matched = false;
  try {
    const tryQueries = [emailClean, phoneClean].filter(Boolean);
    for (const q of tryQueries) {
      const sr = await fetch(`${GHL_BASE}/contacts/search`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({
          locationId,
          pageLimit: 5,
          filters: [{ field: q.includes('@') ? 'email' : 'phone', operator: 'eq', value: q }],
        }),
      });
      if (!sr.ok) continue;
      const sd = await sr.json();
      const found = (sd?.contacts || [])[0];
      if (found) { contactId = found.id; matched = true; break; }
    }
  } catch (e) {
    console.error('[quiz-ghl-match] search failed', e);
  }

  // Build custom fields payload (shared by update + create).
  const customFields = [
    { id: CF.door, field_value: 'quiz_videocall' },
  ];
  if (sexo) customFields.push({ id: CF.sexo_lead_form, field_value: sexo });
  if (protocolo) customFields.push({ id: CF.protocolo, field_value: protocolo });
  if (quizAnswers) customFields.push({ id: CF.quiz_respuestas, field_value: typeof quizAnswers === 'string' ? quizAnswers : JSON.stringify(quizAnswers) });
  if (utm_source) customFields.push({ id: CF.utm_source, field_value: utm_source });
  if (utm_medium) customFields.push({ id: CF.utm_medium, field_value: utm_medium });
  if (utm_campaign) customFields.push({ id: CF.utm_campaign, field_value: utm_campaign });
  if (utm_content) customFields.push({ id: CF.utm_content, field_value: utm_content });
  if (utm_term) customFields.push({ id: CF.utm_term, field_value: utm_term });

  const nameParts = String(nombre).trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // 2. Update if found, create if not.
  try {
    if (matched && contactId) {
      const ur = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
        method: 'PUT',
        headers: ghlHeaders,
        body: JSON.stringify({ customFields }),
      });
      if (!ur.ok) {
        const t = await ur.text();
        console.error('[quiz-ghl-match] update failed', ur.status, t);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'GHL update failed', detail: t }) };
      }
      console.log('[quiz-ghl-match] updated existing contact', contactId);
    } else {
      const cr = await fetch(`${GHL_BASE}/contacts/`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({
          locationId,
          firstName, lastName,
          email: emailClean || undefined,
          phone: phoneClean || undefined,
          gender: sexo === 'hombre' ? 'male' : sexo === 'mujer' ? 'female' : undefined,
          source: 'Quiz HC Videocall',
          tags: ['quiz_videocall', 'new_lead'],
          customFields,
        }),
      });
      const cd = await cr.json();
      if (!cr.ok) {
        console.error('[quiz-ghl-match] create failed', cr.status, JSON.stringify(cd));
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'GHL create failed', detail: cd }) };
      }
      contactId = cd?.contact?.id || cd?.id || null;
      console.log('[quiz-ghl-match] created new contact', contactId);
    }
  } catch (e) {
    console.error('[quiz-ghl-match] GHL write failed', e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'GHL write failed', detail: e.message }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, matched, contactId }),
  };
};

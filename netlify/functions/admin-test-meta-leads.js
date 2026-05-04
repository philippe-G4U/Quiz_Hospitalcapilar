// Diagnóstico read-only: verifica si META_ACCESS_TOKEN tiene los permisos
// que necesita el cron de enriquecimiento (leads_retrieval, ads_read,
// pages_show_list, pages_read_engagement).
//
// Uso: GET /.netlify/functions/admin-test-meta-leads?key=<DASHBOARD_SECRET>
// No modifica nada — solo lee.

const META_GRAPH = 'https://graph.facebook.com/v21.0';

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const secret = process.env.DASHBOARD_SECRET || 'hc-dashboard-2026';
  if (params.key !== secret) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Missing META_ACCESS_TOKEN or META_AD_ACCOUNT_ID env vars' }),
    };
  }

  const result = {
    timestamp: new Date().toISOString(),
    account,
    checks: {},
  };

  // 1) Inspect token: list scopes/permissions
  try {
    const r = await fetch(`${META_GRAPH}/me/permissions?access_token=${token}`);
    const d = await r.json();
    if (!r.ok) {
      result.checks.token_permissions = { ok: false, status: r.status, error: d.error?.message || 'unknown' };
    } else {
      const perms = (d.data || []).filter(p => p.status === 'granted').map(p => p.permission);
      result.checks.token_permissions = {
        ok: true,
        granted: perms,
        has_leads_retrieval: perms.includes('leads_retrieval'),
        has_ads_read: perms.includes('ads_read'),
        has_pages_show_list: perms.includes('pages_show_list'),
        has_pages_read_engagement: perms.includes('pages_read_engagement'),
        has_business_management: perms.includes('business_management'),
      };
    }
  } catch (e) {
    result.checks.token_permissions = { ok: false, error: e.message };
  }

  // 2) Can we list G4U lead forms via the ad account?
  try {
    const url = `${META_GRAPH}/${account}/leadgen_forms?fields=id,name,status,page&limit=50&access_token=${token}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok) {
      result.checks.list_lead_forms = { ok: false, status: r.status, error: d.error?.message || 'unknown' };
    } else {
      const forms = d.data || [];
      result.checks.list_lead_forms = {
        ok: true,
        total: forms.length,
        sample: forms.slice(0, 5).map(f => ({ id: f.id, name: f.name, status: f.status })),
      };
    }
  } catch (e) {
    result.checks.list_lead_forms = { ok: false, error: e.message };
  }

  // 3) Try to fetch a single lead from the first form (if we got any).
  // This is the actual permission we need: leads_retrieval on the page that owns the form.
  const firstFormId = result.checks.list_lead_forms?.sample?.[0]?.id;
  if (firstFormId) {
    try {
      const url = `${META_GRAPH}/${firstFormId}/leads?fields=id,created_time,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id,field_data&limit=3&access_token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) {
        result.checks.fetch_leads_from_form = {
          ok: false,
          form_id: firstFormId,
          status: r.status,
          error: d.error?.message || 'unknown',
          error_code: d.error?.code,
          error_subcode: d.error?.error_subcode,
        };
      } else {
        const leads = d.data || [];
        result.checks.fetch_leads_from_form = {
          ok: true,
          form_id: firstFormId,
          total_returned: leads.length,
          sample: leads.slice(0, 2).map(l => ({
            id: l.id,
            created_time: l.created_time,
            campaign_name: l.campaign_name || null,
            ad_name: l.ad_name || null,
            adset_name: l.adset_name || null,
            field_count: (l.field_data || []).length,
          })),
        };
      }
    } catch (e) {
      result.checks.fetch_leads_from_form = { ok: false, error: e.message };
    }
  }

  // 4) Final verdict
  const tp = result.checks.token_permissions;
  const lf = result.checks.list_lead_forms;
  const fl = result.checks.fetch_leads_from_form;
  result.verdict = {
    can_implement_enrich:
      tp?.ok && (tp.has_leads_retrieval || fl?.ok) && lf?.ok && fl?.ok,
    missing: [
      !tp?.has_leads_retrieval && 'leads_retrieval permission',
      !tp?.has_ads_read && 'ads_read permission',
      !tp?.has_pages_read_engagement && 'pages_read_engagement permission',
      !lf?.ok && 'access to leadgen_forms endpoint',
      !fl?.ok && 'access to /leads endpoint',
    ].filter(Boolean),
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result, null, 2),
  };
};

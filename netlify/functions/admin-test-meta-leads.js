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

  // 2) List Pages this token can access AND what tasks (permissions) it has
  // on each page. Lead forms require MANAGE_LEADS task — without it the form
  // list endpoint returns empty even with leads_retrieval scope.
  let pageIds = [];
  try {
    const r = await fetch(`${META_GRAPH}/me/accounts?fields=id,name,tasks,access_token&access_token=${token}`);
    const d = await r.json();
    if (!r.ok) {
      result.checks.list_pages = { ok: false, status: r.status, error: d.error?.message || 'unknown' };
    } else {
      pageIds = (d.data || []).map(p => p.id);
      result.checks.list_pages = {
        ok: true,
        total: (d.data || []).length,
        sample: (d.data || []).slice(0, 5).map(p => ({
          id: p.id,
          name: p.name,
          tasks: p.tasks || [],
          has_page_access_token: !!p.access_token,
        })),
      };
      // Try listing forms with the PAGE access token (different from user token)
      const firstPage = (d.data || [])[0];
      if (firstPage && firstPage.access_token) {
        try {
          const fr = await fetch(`${META_GRAPH}/${firstPage.id}/leadgen_forms?fields=id,name,status&limit=100&access_token=${firstPage.access_token}`);
          const fd = await fr.json();
          result.checks.list_forms_with_page_token = {
            ok: fr.ok,
            total: (fd.data || []).length,
            sample: (fd.data || []).slice(0, 5).map(f => ({ id: f.id, name: f.name, status: f.status })),
            error: fd.error?.message,
          };
          // If forms were found via page token, populate allForms here
          if (fr.ok && fd.data?.length) {
            for (const f of fd.data) allForms.push({ ...f, page_id: firstPage.id, page_token: firstPage.access_token });
          }
        } catch (e) {
          result.checks.list_forms_with_page_token = { ok: false, error: e.message };
        }
      }
    }
  } catch (e) {
    result.checks.list_pages = { ok: false, error: e.message };
  }

  // 3) For each Page, list its lead forms
  const allForms = [];
  for (const pageId of pageIds) {
    try {
      const url = `${META_GRAPH}/${pageId}/leadgen_forms?fields=id,name,status,created_time&limit=100&access_token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      if (r.ok) {
        for (const f of (d.data || [])) allForms.push({ ...f, page_id: pageId });
      }
    } catch (e) { /* skip */ }
  }
  result.checks.list_lead_forms = {
    ok: allForms.length > 0,
    total: allForms.length,
    sample: allForms.slice(0, 8).map(f => ({ id: f.id, name: f.name, status: f.status, page_id: f.page_id })),
  };

  // 3.4) Lead form ID lives on the AdSet's promoted_object, not the Ad's creative.
  // Inspect adsets to find which form_id each is using.
  if (account) {
    try {
      const url = `${META_GRAPH}/${account}/adsets?fields=id,name,campaign{name,objective},promoted_object,destination_type&limit=100&access_token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      const formIdsFromAdsets = new Set();
      const adsetSample = [];
      for (const a of (d.data || [])) {
        const fid = a.promoted_object?.lead_gen_form_id || a.promoted_object?.form_id;
        if (fid) formIdsFromAdsets.add(fid);
        if (adsetSample.length < 8) {
          adsetSample.push({
            adset_id: a.id,
            adset_name: (a.name || '').slice(0, 40),
            campaign: (a.campaign?.name || '').slice(0, 40),
            destination_type: a.destination_type,
            lead_gen_form_id: fid || null,
          });
        }
      }
      result.checks.adsets_inspect = {
        ok: true,
        total_adsets: (d.data || []).length,
        form_ids_found: formIdsFromAdsets.size,
        sample: adsetSample,
      };
      // Probe each form ID to find page owner
      const formProbesFromAdsets = [];
      for (const fid of [...formIdsFromAdsets].slice(0, 8)) {
        const fr = await fetch(`${META_GRAPH}/${fid}?fields=id,name,status,page,locale&access_token=${token}`);
        const fd = await fr.json();
        formProbesFromAdsets.push({
          form_id: fid,
          ok: fr.ok,
          name: fd.name,
          status: fd.status,
          page_id: fd.page?.id || fd.page_id,
          page_name: fd.page?.name,
          error: fd.error?.message,
        });
        if (fr.ok && fd.page?.id) {
          allForms.push({ id: fd.id, name: fd.name, status: fd.status, page_id: fd.page.id });
        }
      }
      result.checks.form_probes_from_adsets = formProbesFromAdsets;
    } catch (e) {
      result.checks.adsets_inspect = { ok: false, error: e.message };
    }
  }

  // 3.5) Inspect Lead-Ads from the ad account, broader search:
  //  - Try ALL ads (not filtered by active) to catch paused Lead Ad campaigns
  //  - Look in tracking_specs and creative.object_type for LEAD_GENERATION
  //  - Print ad sample to see what creative structure the account uses
  if (account) {
    try {
      const url = `${META_GRAPH}/${account}/ads?fields=id,name,effective_status,campaign{name,objective},creative{id,object_type,object_story_spec,asset_feed_spec},tracking_specs&limit=50&access_token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      const adSample = [];
      const formIdsFromAds = new Set();
      const objectives = new Set();
      for (const a of (d.data || [])) {
        objectives.add(a.campaign?.objective || '');
        const oss = a.creative?.object_story_spec || {};
        const fid = oss.link_data?.lead_gen_form_id
                 || oss.video_data?.lead_gen_form_id
                 || oss.lead_gen?.form_id
                 || a.creative?.lead_form_id
                 || a.creative?.asset_feed_spec?.call_to_action_types?.find(x => x.includes('LEAD'))?.lead_gen_form_id;
        if (fid) formIdsFromAds.add(fid);
        if (adSample.length < 5) {
          adSample.push({
            ad_id: a.id,
            ad_name: (a.name || '').slice(0, 40),
            campaign: (a.campaign?.name || '').slice(0, 40),
            objective: a.campaign?.objective,
            status: a.effective_status,
            creative_object_type: a.creative?.object_type,
            has_lead_gen_form_id: !!fid,
          });
        }
      }
      result.checks.ad_account_inspect = {
        ok: true,
        total_ads_inspected: (d.data || []).length,
        unique_objectives: [...objectives],
        form_ids_found: formIdsFromAds.size,
        sample_ads: adSample,
      };
      // Try to fetch each form ID directly to find its Page owner
      const formProbes = [];
      for (const fid of [...formIdsFromAds].slice(0, 5)) {
        const fr = await fetch(`${META_GRAPH}/${fid}?fields=id,name,status,page_id&access_token=${token}`);
        const fd = await fr.json();
        formProbes.push({ form_id: fid, ok: fr.ok, name: fd.name, page_id: fd.page_id, error: fd.error?.message });
        if (fr.ok) {
          allForms.push({ id: fd.id, name: fd.name, status: fd.status, page_id: fd.page_id });
        }
      }
      result.checks.form_probes = formProbes;
    } catch (e) {
      result.checks.ad_account_inspect = { ok: false, error: e.message };
    }
  }

  // 3.6) Also check all businesses + ad accounts the System User can see
  try {
    const r = await fetch(`${META_GRAPH}/me/businesses?fields=id,name&access_token=${token}`);
    const d = await r.json();
    result.checks.businesses_visible = {
      ok: r.ok,
      total: (d.data || []).length,
      sample: (d.data || []).map(b => ({ id: b.id, name: b.name })),
    };
  } catch (e) { result.checks.businesses_visible = { ok: false, error: e.message }; }
  try {
    const r = await fetch(`${META_GRAPH}/me/adaccounts?fields=id,name,account_status&access_token=${token}`);
    const d = await r.json();
    result.checks.ad_accounts_visible = {
      ok: r.ok,
      total: (d.data || []).length,
      sample: (d.data || []).map(a => ({ id: a.id, name: a.name, status: a.account_status })),
    };
  } catch (e) { result.checks.ad_accounts_visible = { ok: false, error: e.message }; }

  // 4) Try to fetch leads from the first form
  if (allForms.length > 0) {
    const firstForm = allForms[0];
    try {
      const url = `${META_GRAPH}/${firstForm.id}/leads?fields=id,created_time,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,form_id,field_data&limit=3&access_token=${token}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) {
        result.checks.fetch_leads_from_form = {
          ok: false,
          form_id: firstForm.id,
          form_name: firstForm.name,
          status: r.status,
          error: d.error?.message || 'unknown',
          error_code: d.error?.code,
        };
      } else {
        const leads = d.data || [];
        result.checks.fetch_leads_from_form = {
          ok: true,
          form_id: firstForm.id,
          form_name: firstForm.name,
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

  // 5) Final verdict
  const tp = result.checks.token_permissions;
  const lp = result.checks.list_pages;
  const lf = result.checks.list_lead_forms;
  const fl = result.checks.fetch_leads_from_form;
  result.verdict = {
    can_implement_enrich:
      tp?.has_leads_retrieval && lp?.ok && lf?.ok && fl?.ok,
    missing: [
      !tp?.has_leads_retrieval && 'leads_retrieval permission',
      !lp?.ok && 'pages_show_list permission (cannot list pages)',
      !lf?.ok && 'lead forms (no forms found across pages)',
      !fl?.ok && 'leads_retrieval on the page that owns the forms',
    ].filter(Boolean),
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result, null, 2),
  };
};

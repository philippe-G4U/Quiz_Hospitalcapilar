const { updateLeadByEmail, getLeadSourceByEmail, getLeadByEmail } = require('./lib/firebase-admin');
const { sendMetaEvent } = require('./lib/meta-capi');
const { sendAlert } = require('./lib/alert');

const KOIBOX_BASE = 'https://api.koibox.cloud/api';
const GHL_BASE = 'https://services.leadconnectorhq.com';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

// Koibox service IDs
const SERVICES = {
  primera_consulta_diagnostico: 103385,  // Primera Consulta Médica Diagnóstico (€0)
  lead_fresquito:               103413,  // LEAD FRESQUITO (€0)
  consulta_asesoria:            103373,  // Consulta de asesoría (ref interna 1063)
};

// Province IDs (Koibox uses numeric IDs)
const PROVINCIAS = {
  madrid:     680,
  murcia:     697,
  pontevedra: 718,
};

// ── Flow A: Trichometabolic (diagnóstico médico, con bono para mujeres) ──
// 30257 = hueco de agenda abierto para campaña quiz online (confirmado por María / Óscar, 2026-03-18)
// Horario L-V 09:30–14:00, bloques de 1h (confirmado 2026-04-22)
const DIAGNOSTICO = {
  employees: { madrid: [30257], pontevedra: [30257], murcia: [30257] },
  service: SERVICES.primera_consulta_diagnostico,
  hours: { madrid: { open: '09:30', close: '14:00' }, pontevedra: { open: '09:30', close: '14:00' }, murcia: { open: '09:30', close: '14:00' } },
  maxDaily: { madrid: 6, pontevedra: 6, murcia: 6 },
  titulo: 'Test Capilar con Analítica Hormonal',
};

// ── Flow B: Asesores (consulta de asesoría, sin bono) ──
// Asesores presenciales Madrid (confirmado por Bryan / HC, 2026-04-15)
// Sábados: 1 asesor de 10:00 a 14:00 (confirmado por María, 2026-04-15)
const ASESORIA = {
  employees: {
    madrid: [30592, 26954, 4577, 4583], // Alejandra Muñoz, Stefanía Peralta, Sandra Baeza, Alfonso López
  },
  service: SERVICES.consulta_asesoria,
  hours: { madrid: { open: '10:00', close: '20:00' } },         // L-V: bloques 1h, última asesoría 19:00
  hoursSaturday: { madrid: { open: '10:00', close: '14:00' } },  // Sáb: 1 asesor, 10:00-13:00 (última)
  maxDaily: { madrid: 40 },  // 4 asesores × 10 slots = generous limit
  titulo: 'Consulta de Asesoría Capilar',
  allowSaturday: true,
};

// Resolve config by tipo_consulta
function getFlowConfig(tipo) {
  return tipo === 'asesoria' ? ASESORIA : DIAGNOSTICO;
}

const SLOT_DURATION = 60; // minutes

// Koibox API paginates at 50 results max — fetch all pages for a date
async function fetchAllAppointments(fecha, koiboxHeaders) {
  const allResults = [];
  let url = `${KOIBOX_BASE}/agenda/?fecha__gte=${fecha}&fecha__lte=${fecha}&limit=50`;
  while (url) {
    const res = await fetch(url, { headers: koiboxHeaders });
    if (!res.ok) break;
    const data = await res.json();
    allResults.push(...(data.results || []));
    url = data.next || null;
    if (allResults.length >= 500) break; // safety cap
  }
  return allResults;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.KOIBOX_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Koibox API key not configured' }) };
  }

  const koiboxHeaders = {
    'X-Koibox-Key': apiKey,
    'Content-Type': 'application/json',
  };

  try {
    const body = JSON.parse(event.body);
    const { action } = body;

    // Route by action
    if (action === 'sync_lead') {
      return await syncLead(body, koiboxHeaders, headers);
    }

    if (action === 'search_client') {
      return await searchClient(body, koiboxHeaders, headers);
    }

    if (action === 'get_availability') {
      return await getAvailability(body, koiboxHeaders, headers);
    }

    if (action === 'create_appointment') {
      return await createAppointment(body, koiboxHeaders, headers);
    }

    if (action === 'cancel_appointment') {
      return await cancelAppointment(body, koiboxHeaders, headers);
    }

    if (action === 'reschedule_appointment') {
      return await rescheduleAppointment(body, koiboxHeaders, headers);
    }

    if (action === 'get_appointment') {
      return await getAppointment(body, koiboxHeaders, headers);
    }

    if (action === 'get_contact_appointment') {
      return await getContactAppointment(body, koiboxHeaders, headers);
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `Unknown action: ${action}. Supported: sync_lead, search_client, get_availability, create_appointment, cancel_appointment, reschedule_appointment, get_appointment, get_contact_appointment` }),
    };
  } catch (err) {
    console.log('[Koibox] Exception:', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

/**
 * Sync a lead from the quiz to Koibox as a client.
 * Checks for existing client by phone/email first to avoid duplicates.
 */
async function syncLead(body, koiboxHeaders, corsHeaders) {
  const { nombre, email, movil, ciudad, notas, sexo } = body;

  if (!nombre) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'nombre is required' }) };
  }

  // 1. Check for existing client by phone (Koibox filter params don't work —
  //    the API ignores ?movil= and ?email= and returns ALL clients.
  //    We must fetch and filter client-side.)
  let existingClient = null;
  const normalizePhone = (p) => (p || '').replace(/[^0-9]/g, '').slice(-9); // last 9 digits

  if (movil) {
    const needle = normalizePhone(movil);
    if (needle.length >= 9) {
      const searchRes = await fetch(`${KOIBOX_BASE}/clientes/?movil=${encodeURIComponent(movil)}&limit=100`, {
        headers: koiboxHeaders,
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        existingClient = (searchData.results || []).find(c => normalizePhone(c.movil) === needle) || null;
        if (existingClient) console.log('[Koibox] Found existing client by phone:', existingClient.id);
      }
    }
  }

  // 2. Check by email if not found by phone
  if (!existingClient && email) {
    const needleEmail = email.toLowerCase().trim();
    const searchRes = await fetch(`${KOIBOX_BASE}/clientes/?email=${encodeURIComponent(email)}&limit=100`, {
      headers: koiboxHeaders,
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      existingClient = (searchData.results || []).find(c => (c.email || '').toLowerCase().trim() === needleEmail) || null;
      if (existingClient) console.log('[Koibox] Found existing client by email:', existingClient.id);
    }
  }

  // 3. Create or update client
  const provinciaId = ciudad ? PROVINCIAS[ciudad.toLowerCase()] || null : null;

  // Split nombre into parts
  const nameParts = nombre.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

  const clientPayload = {
    nombre: firstName,
    apellido1: lastName,
    email: email || undefined,
    movil: movil || undefined,
    sexo: sexo === 'hombre' ? 'H' : sexo === 'mujer' ? 'M' : undefined,
    notas: notas || undefined,
    origen: 'w',  // w = web
  };
  if (provinciaId) clientPayload.provincia = provinciaId;

  let clientData;
  let clientId;
  let isNew;

  if (existingClient) {
    // Update existing client
    const updateRes = await fetch(`${KOIBOX_BASE}/clientes/${existingClient.id}/`, {
      method: 'PATCH',
      headers: koiboxHeaders,
      body: JSON.stringify({
        notas: notas
          ? `${existingClient.notas || ''}\n---\n[G4U Quiz] ${notas}`.trim()
          : undefined,
      }),
    });
    clientData = updateRes.ok ? await updateRes.json() : existingClient;
    clientId = existingClient.id;
    isNew = false;
    console.log('[Koibox] Updated existing client:', clientId);
  } else {
    // Create new client
    const createRes = await fetch(`${KOIBOX_BASE}/clientes/`, {
      method: 'POST',
      headers: koiboxHeaders,
      body: JSON.stringify(clientPayload),
    });
    clientData = await createRes.json();

    if (!createRes.ok) {
      console.log('[Koibox] Client creation failed:', JSON.stringify(clientData));
      return {
        statusCode: createRes.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Client creation failed', details: clientData }),
      };
    }
    clientId = clientData.id;
    isNew = true;
    console.log('[Koibox] Created new client:', clientId);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      clientId,
      isNew,
      client: clientData,
    }),
  };
}

/**
 * Get available time slots for a given date and clinic.
 * Queries existing appointments and calculates free slots.
 */
async function getAvailability(body, koiboxHeaders, corsHeaders) {
  const { fecha, clinica, tipo_consulta } = body;

  if (!fecha || !clinica) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fecha and clinica required' }) };
  }

  const flow = getFlowConfig(tipo_consulta);
  const employeeIds = flow.employees[clinica] || flow.employees.madrid;
  const maxDaily = (flow.maxDaily[clinica] || 6);

  // Determine hours based on day of week (Saturday has different hours for asesoria)
  const dayOfWeek = new Date(fecha + 'T00:00:00').getDay(); // 0=Sun, 6=Sat
  const isSaturday = dayOfWeek === 6;
  const hours = isSaturday && flow.hoursSaturday
    ? (flow.hoursSaturday[clinica] || flow.hoursSaturday.madrid || flow.hours[clinica] || flow.hours.madrid)
    : (flow.hours[clinica] || flow.hours.madrid);

  // Get all appointments for the given date (paginated — Koibox caps at 50/page)
  const allAppointments = await fetchAllAppointments(fecha, koiboxHeaders);

  // Filter to only this flow's employee appointments, excluding cancelled (estado=5)
  // Koibox returns user as object {value: id} or plain number
  const getUserId = (a) => typeof a.user === 'object' ? a.user.value : a.user;
  const getEstado = (a) => typeof a.estado === 'object' ? a.estado.value : a.estado;
  const appointments = allAppointments.filter(a => employeeIds.includes(getUserId(a)) && getEstado(a) !== 5);

  // Check daily appointment limit
  const confirmedCount = appointments.length;
  const dailyLimitReached = confirmedCount >= maxDaily;

  // For multiple employees (asesoria): a slot is available if ANY employee is free
  // For single employee (diagnostico): same logic, just one employee
  const occupiedByEmployee = {};
  for (const empId of employeeIds) {
    occupiedByEmployee[empId] = appointments
      .filter(a => getUserId(a) === empId)
      .map(a => ({ start: a.hora_inicio, end: a.hora_fin }));
  }

  // Generate all possible slots
  const slots = [];
  let [h, m] = hours.open.split(':').map(Number);
  const [closeH, closeM] = hours.close.split(':').map(Number);
  const closeMin = closeH * 60 + closeM;

  while (h * 60 + m + SLOT_DURATION <= closeMin) {
    const startStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const endM = m + SLOT_DURATION;
    const endH = h + Math.floor(endM / 60);
    const endMm = endM % 60;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endMm).padStart(2, '0')}`;

    // A slot is available if at least one employee has no overlap at this time
    const hasAvailableEmployee = employeeIds.some(empId => {
      const occ = occupiedByEmployee[empId] || [];
      return !occ.some(o => startStr < o.end && endStr > o.start);
    });

    slots.push({
      hora_inicio: startStr,
      hora_fin: endStr,
      disponible: hasAvailableEmployee && !dailyLimitReached,
    });

    // Advance to next slot
    m += SLOT_DURATION;
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
  }

  if (dailyLimitReached) {
    console.log(`[Koibox] Daily limit reached for ${clinica}/${tipo_consulta || 'diagnostico'} on ${fecha}: ${confirmedCount}/${maxDaily}`);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      fecha,
      clinica,
      tipo_consulta: tipo_consulta || 'diagnostico',
      horario: hours,
      total_slots: slots.length,
      disponibles: slots.filter(s => s.disponible).length,
      daily_limit: maxDaily,
      daily_confirmed: confirmedCount,
      daily_limit_reached: dailyLimitReached,
      slots,
    }),
  };
}

/**
 * Create an appointment in Koibox.
 */
async function createAppointment(body, koiboxHeaders, corsHeaders) {
  const { nombre, email, movil, fecha, hora_inicio, hora_fin, clinica, notas, ghl_contact_id, tipo_consulta } = body;

  if (!fecha || !hora_inicio || !hora_fin) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'fecha, hora_inicio, hora_fin required' }) };
  }

  const flow = getFlowConfig(tipo_consulta);
  const employeeIds = flow.employees[clinica] || flow.employees.madrid;

  // 0. Resolve a GHL contactId. The Meta→paywall direct flow doesn't carry one,
  // and the quiz flow can race past the contact creation — fall back to email
  // lookup so the bono gate doesn't block paid users.
  let resolvedContactId = ghl_contact_id || '';
  const ghlKey = process.env.VITE_GHL_API_KEY;
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  const ghlHeaders = ghlKey ? {
    'Authorization': `Bearer ${ghlKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  } : null;
  if (!resolvedContactId && ghlHeaders && email) {
    try {
      const searchRes = await fetch(`${GHL_BASE}/contacts/search`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({
          locationId,
          pageLimit: 1,
          filters: [{ field: 'email', operator: 'eq', value: email }],
        }),
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        resolvedContactId = data.contacts?.[0]?.id || '';
        if (resolvedContactId) console.log('[Koibox] Resolved contactId via email fallback:', resolvedContactId);
      }
    } catch (err) {
      console.log('[Koibox] email fallback search failed:', err.message);
    }
  }

  // 1. Check GHL for payment status + ECP + sexo + gender (to set notes, tags, and bono gate)
  let bonoPaid = false;
  let contactEcp = '';
  let contactSexo = '';
  let contactGender = '';
  if (resolvedContactId && ghlHeaders) {
    try {
      // Get contact to read ECP + sexo CF + standard gender
      const contactRes = await fetch(`${GHL_BASE}/contacts/${resolvedContactId}`, { headers: ghlHeaders });
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        const contact = contactData?.contact || {};
        const cfs = contact.customFields || [];
        const ecpField = cfs.find(f => f.id === 'cFIcdJlT9sfnC3KMSwDD');
        contactEcp = ecpField?.value || '';
        const sexoField = cfs.find(f => f.id === 'P7D2edjnOHwXLpglw9tB');
        contactSexo = (sexoField?.value || '').toLowerCase();
        contactGender = (contact.gender || '').toLowerCase();
      }
      // Search opportunity for payment status
      const oppSearchRes = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${resolvedContactId}&status=open`,
        { headers: ghlHeaders }
      );
      if (oppSearchRes.ok) {
        const oppData = await oppSearchRes.json();
        const opp = (oppData?.opportunities || [])[0];
        if (opp?.id) {
          const oppDetailRes = await fetch(`${GHL_BASE}/opportunities/${opp.id}`, { headers: ghlHeaders });
          if (oppDetailRes.ok) {
            const oppDetail = await oppDetailRes.json();
            const oppCfs = oppDetail?.opportunity?.customFields || [];
            const statusField = oppCfs.find(f => f.id === 'Hk81fRW2HaTqlry4I1L0');
            // Opportunity custom fields are returned as `fieldValue` (not `value`)
            // — accept either to stay robust if GHL changes the shape.
            const statusValue = statusField?.fieldValue || statusField?.value || '';
            bonoPaid = typeof statusValue === 'string' && statusValue.startsWith('paid');
          }
        }
      }
      console.log('[Koibox] GHL check — ECP:', contactEcp, 'sexo:', contactSexo, 'gender:', contactGender, 'bonoPaid:', bonoPaid);
    } catch (err) {
      console.log('[Koibox] GHL payment check failed:', err.message);
    }
  }

  // 0b. Block diagnostico flow without bono payment.
  // tipo=diagnostico is by design assigned only to women in ghl-proxy and the
  // Meta-direct enrich function. Gating purely on tipo avoids depending on the
  // sexo CF (deleted from the location) or the gender field (not API-writable
  // after contact creation, so empty for Meta-direct leads).
  const isAsesoria = tipo_consulta === 'asesoria';
  if (!isAsesoria && !bonoPaid) {
    console.log('[Koibox] BLOCKED — diagnostico flow without bono. ECP:', contactEcp, 'sexo:', contactSexo, 'gender:', contactGender);
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'bono_required', message: 'Para reservar tu test capilar, primero completa el pago de la reserva.' }),
    };
  }

  // 1. Sync client first (find or create)
  let clientId = body.koibox_client_id;
  if (!clientId && (email || movil)) {
    const syncResult = await syncLead(
      { nombre, email, movil, ciudad: clinica, notas: notas || (isAsesoria ? 'Consulta Asesoría' : 'Test Capilar 125€'), sexo: body.sexo },
      koiboxHeaders,
      corsHeaders,
    );
    const syncData = JSON.parse(syncResult.body);
    if (syncData.clientId) {
      clientId = syncData.clientId;
    }
  }

  // 2. Check daily appointment limit + find available employee
  const maxDaily = (flow.maxDaily[clinica] || 6);
  let assignedEmployeeId = employeeIds[0]; // default to first
  const getUserId = (a) => typeof a.user === 'object' ? a.user.value : a.user;
  const getEstado = (a) => typeof a.estado === 'object' ? a.estado.value : a.estado;
  try {
    const allAppointments = await fetchAllAppointments(fecha, koiboxHeaders);
    const flowAppointments = allAppointments.filter(a => employeeIds.includes(getUserId(a)) && getEstado(a) !== 5);
    const confirmedCount = flowAppointments.length;
    if (confirmedCount >= maxDaily) {
      console.log(`[Koibox] Daily limit blocked creation for ${clinica}/${tipo_consulta || 'diagnostico'} on ${fecha}: ${confirmedCount}/${maxDaily}`);
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'daily_limit_reached', message: `Límite diario alcanzado (${maxDaily} citas). Por favor selecciona otro día.`, confirmed: confirmedCount, max: maxDaily }),
      };
    }

    // For multiple employees: assign to first one free at this time slot
    if (employeeIds.length > 1) {
      for (const empId of employeeIds) {
        const empAppts = flowAppointments.filter(a => getUserId(a) === empId);
        const hasOverlap = empAppts.some(a => hora_inicio < a.hora_fin && hora_fin > a.hora_inicio);
        if (!hasOverlap) {
          assignedEmployeeId = empId;
          break;
        }
      }
      console.log(`[Koibox] Assigned employee ${assignedEmployeeId} for ${hora_inicio} on ${fecha}`);
    }
  } catch (err) {
    console.log('[Koibox] Daily limit check failed, proceeding:', err.message);
  }

  // 3. Create the appointment
  const appointmentTitle = `${flow.titulo} - ${nombre || 'Paciente'}`;
  const appointmentPayload = {
    titulo: appointmentTitle,
    fecha,
    hora_inicio,
    hora_fin,
    user: assignedEmployeeId,
    servicios: [flow.service],
    notas: notas || (isAsesoria
      ? 'Reserva desde quiz online — Consulta de Asesoría'
      : bonoPaid
        ? 'Reserva desde quiz online — ✅ TEST CAPILAR PAGADO'
        : 'Reserva desde quiz online — Test Capilar'),
  };
  if (clientId) {
    appointmentPayload.cliente = clientId;
  }

  console.log('[Koibox] Creating appointment:', JSON.stringify(appointmentPayload));

  const res = await fetch(`${KOIBOX_BASE}/agenda/`, {
    method: 'POST',
    headers: koiboxHeaders,
    body: JSON.stringify(appointmentPayload),
  });

  const appointmentData = await res.json();

  if (!res.ok) {
    console.log('[Koibox] Appointment creation failed:', res.status, JSON.stringify(appointmentData));
    return {
      statusCode: res.status,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Appointment creation failed', details: appointmentData }),
    };
  }

  console.log('[Koibox] Appointment created:', appointmentData.id);

  // 3. Sync to GHL, Firestore, PostHog, Salesforce — all non-blocking
  // If any of these fail, the Koibox appointment is already created, so we return success
  let ghlSync = { status: 'skipped' };
  try {
    ghlSync = await syncAppointmentToGHL({ nombre, email, movil, fecha, hora_inicio, clinica, koiboxId: String(appointmentData.id || ''), ghl_contact_id: resolvedContactId, bonoPaid, contactEcp, contactSexo, contactGender });
  } catch (err) {
    ghlSync = { status: 'error', error: err.message };
    console.log('[Koibox→GHL] Sync failed:', err.message);
  }

  // 4. Update Firestore lead with appointment info
  try {
    await updateLeadByEmail(email, {
      appointmentStatus: 'booked',
      appointmentClinica: clinica || '',
      appointmentFecha: fecha || '',
      appointmentHora: hora_inicio || '',
      appointmentKoiboxId: String(appointmentData.id || ''),
      appointmentBookedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.log('[Koibox] Firestore update failed:', err.message);
  }

  // 5. Track in PostHog server-side + Meta CAPI (enrich with lead attribution)
  let leadSource = {};
  try {
    leadSource = await getLeadSourceByEmail(email);
    await trackServerEvent('appointment_booked', {
      clinica,
      fecha,
      hora_inicio,
      hora_fin,
      has_email: !!email,
      has_phone: !!movil,
      koibox_appointment_id: appointmentData.id,
      koibox_client_id: clientId,
      ...leadSource,
    }, email);
  } catch (err) {
    console.log('[Koibox] PostHog tracking failed:', err.message);
  }

  // 5b. Send Schedule event to Meta CAPI (fire-and-forget, server-side)
  sendMetaEvent('Schedule', {
    email,
    phone: movil,
    fbclid: leadSource.fbclid,
    eventSourceUrl: leadSource.landing_url,
    eventId: `schedule_${appointmentData.id}`,
    customData: {
      content_name: isAsesoria ? 'asesoria' : 'diagnostico',
      content_category: leadSource.nicho || 'general',
      appointment_date: fecha,
      clinica: clinica || '',
    },
  });

  // 6. Send to Salesforce with full G4U mapping (fire-and-forget)
  sendBookingToSalesforce({
    email,
    nombre,
    phone: movil,
    clinica,
    fecha,
    hora_inicio,
    ghl_contact_id: resolvedContactId,
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: true,
      appointmentId: appointmentData.id,
      fecha,
      hora_inicio,
      hora_fin,
      clinica,
      clientId,
      ghlSync,
    }),
  };
}

/**
 * Cancel an appointment in Koibox and update GHL accordingly.
 * Called when patient confirms they can't attend (48h reminder flow).
 * - PATCH Koibox appointment estado=5 (cancelled)
 * - Update GHL opportunity: tratamiento_status → cancelled, stage → cancelled
 * - Clear contact fecha_cita/hora_cita
 * - Add cancellation note
 */
async function cancelAppointment(body, koiboxHeaders, corsHeaders) {
  const { koibox_id, ghl_contact_id, email, phone, reason } = body;

  if (!koibox_id && !ghl_contact_id && !email && !phone) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'koibox_id, ghl_contact_id, email, or phone required' }) };
  }

  // 1. Cancel in Koibox (estado 5 = cancelled)
  let koiboxResult = { status: 'skipped' };
  if (koibox_id) {
    try {
      const cancelRes = await fetch(`${KOIBOX_BASE}/agenda/${koibox_id}/`, {
        method: 'PATCH',
        headers: koiboxHeaders,
        body: JSON.stringify({ estado: 5 }),
      });
      if (cancelRes.ok) {
        koiboxResult = { status: 'cancelled' };
        console.log('[Koibox] Appointment cancelled:', koibox_id);
      } else {
        const errData = await cancelRes.json().catch(() => ({}));
        koiboxResult = { status: 'error', code: cancelRes.status, details: errData };
        console.log('[Koibox] Cancel failed:', cancelRes.status, JSON.stringify(errData));
      }
    } catch (err) {
      koiboxResult = { status: 'error', error: err.message };
      console.log('[Koibox] Cancel exception:', err.message);
    }
  } else {
    console.log('[Koibox] No koibox_id provided, skipping Koibox cancellation (GHL-only cancel)');
  }

  // 2. Resolve GHL contact ID (fallback to email/phone if needed)
  let resolvedContactId = ghl_contact_id || '';
  const ghlKey = process.env.VITE_GHL_API_KEY;
  if (ghlKey && resolvedContactId) {
    // Verify the contact ID is valid
    try {
      const checkRes = await fetch(`${GHL_BASE}/contacts/${resolvedContactId}`, {
        headers: { 'Authorization': `Bearer ${ghlKey}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' },
      });
      if (!checkRes.ok) {
        console.log('[Cancel] Contact ID invalid, will try email/phone fallback');
        resolvedContactId = '';
      }
    } catch { resolvedContactId = ''; }
  }

  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';
  if (!resolvedContactId && ghlKey && email) {
    try {
      const r = await fetch(`${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`,
        { headers: { 'Authorization': `Bearer ${ghlKey}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' } });
      if (r.ok) { resolvedContactId = (await r.json())?.contact?.id || ''; }
    } catch {}
  }
  if (!resolvedContactId && ghlKey && phone) {
    try {
      const r = await fetch(`${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&phone=${encodeURIComponent(phone)}`,
        { headers: { 'Authorization': `Bearer ${ghlKey}`, 'Content-Type': 'application/json', 'Version': '2021-07-28' } });
      if (r.ok) { resolvedContactId = (await r.json())?.contact?.id || ''; }
    } catch {}
  }

  // 3. Update GHL: opportunity + contact + note
  let ghlResult = { status: 'skipped' };
  if (resolvedContactId && ghlKey) {
    try {
      ghlResult = await syncCancellationToGHL(resolvedContactId, ghlKey, koibox_id, reason);
    } catch (err) {
      ghlResult = { status: 'error', error: err.message };
      console.log('[Koibox→GHL] Cancel sync failed:', err.message);
    }
  }

  // 3. Track in PostHog
  await trackServerEvent('appointment_cancelled', {
    koibox_id,
    reason: reason || 'patient_cancelled',
    ghl_contact_id: ghl_contact_id || '',
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      success: koibox_id ? koiboxResult.status === 'cancelled' : ghlResult.status !== 'error',
      koibox: koiboxResult,
      ghl: ghlResult,
    }),
  };
}

/**
 * Sync cancellation to GHL:
 * - Update opportunity: tratamiento_status → cancelled, move to Cancelled stage
 * - Clear contact fecha_cita/hora_cita fields
 * - Add cancellation note
 * - Add tag cita_cancelada
 */
async function syncCancellationToGHL(contactId, apiKey, koiboxId, reason) {
  const ghlHeaders = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';

  const PIPELINE_STAGE_CANCELLED = 'c961b576-b14d-43a6-ac75-a26695886d58'; // Lost/Cancelled

  // Contact custom field IDs
  const APPOINTMENT_CF = {
    fecha_cita:   'yEjha5MpjAeDrrUfFmur',
    hora_cita:    'KX7eyTmYQKbi0937Wj9I',
    clinica_cita: 'upGgK5yc0bSDwqC99DkZ',
  };

  // 1. Find and update opportunity
  try {
    const searchRes = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${contactId}&status=open`,
      { headers: ghlHeaders }
    );
    const searchData = await searchRes.json();
    const opp = (searchData?.opportunities || [])[0];

    if (opp) {
      await fetch(`${GHL_BASE}/opportunities/${opp.id}`, {
        method: 'PUT',
        headers: ghlHeaders,
        // Note: tratamiento_status is NOT changed — it preserves payment state (not_paid/paid_125)
        // Cancellation is tracked via pipelineStageId only
        body: JSON.stringify({
          pipelineStageId: PIPELINE_STAGE_CANCELLED,
          customFields: [
            { id: 'RXAkzlyYHnz4MjYuYaml', field_value: '' },  // fecha_cita_opp
            { id: 'age1q0r6Ek0PQztGZ4FJ', field_value: '' },   // hora_cita_opp
            { id: 'x1MAP0Om3rUW3a10ZiUe', field_value: '' },   // koibox_id
          ],
        }),
      });
      console.log('[Cancel→GHL] Opportunity updated to cancelled:', opp.id);
    }
  } catch (err) {
    console.log('[Cancel→GHL] Opportunity update failed:', err.message);
  }

  // 2. Clear contact appointment fields
  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: ghlHeaders,
      body: JSON.stringify({
        customFields: [
          { id: APPOINTMENT_CF.fecha_cita, field_value: '' },
          { id: APPOINTMENT_CF.hora_cita, field_value: '' },
          { id: APPOINTMENT_CF.clinica_cita, field_value: '' },
        ],
      }),
    });
    console.log('[Cancel→GHL] Contact appointment fields cleared');
  } catch (err) {
    console.log('[Cancel→GHL] Contact update failed:', err.message);
  }

  // 3. Add cancellation note
  const reasonText = reason || 'El paciente no puede asistir';
  const noteBody = `❌ CITA CANCELADA\nMotivo: ${reasonText}\nKoibox ID: ${koiboxId}\nFecha de cancelación: ${new Date().toISOString()}\nHueco liberado en la agenda.`;

  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ body: noteBody }),
    });
    console.log('[Cancel→GHL] Cancellation note added');
  } catch (err) {
    console.log('[Cancel→GHL] Note creation failed:', err.message);
  }

  // 4. Add tag for workflow trigger (Ramiro configures notification to commercial)
  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ tags: ['cita_cancelada'] }),
    });
    console.log('[Cancel→GHL] Tag cita_cancelada added');
  } catch (err) {
    console.log('[Cancel→GHL] Tag addition failed:', err.message);
  }

  // 5. Cancel GHL calendar appointments
  await cancelGHLAppointments(contactId, ghlHeaders);

  return { status: 'ok', contactId };
}

/**
 * Get appointment details from Koibox by ID.
 * Used by the reagendar page to show current appointment info.
 */
async function getAppointment(body, koiboxHeaders, corsHeaders) {
  const { koibox_id } = body;

  if (!koibox_id) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'koibox_id required' }) };
  }

  try {
    const res = await fetch(`${KOIBOX_BASE}/agenda/${koibox_id}/`, { headers: koiboxHeaders });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify({ error: 'Appointment not found', details: errData }) };
    }
    const data = await res.json();
    // Return only the fields the frontend needs
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        id: data.id,
        fecha: data.fecha,
        hora_inicio: data.hora_inicio,
        hora_fin: data.hora_fin,
        estado: data.estado, // 1=pending, 2=confirmed, 5=cancelled
        titulo: data.titulo,
        cliente: data.cliente ? { nombre: data.cliente_nombre || data.cliente?.nombre, id: data.cliente } : null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
}

/**
 * Look up a contact's active appointment via GHL opportunity → Koibox.
 * Used by /mi-cita page: pass ghl_contact_id, get back appointment details + clinica.
 */
async function getContactAppointment(body, koiboxHeaders, corsHeaders) {
  const { ghl_contact_id, email, phone } = body;

  if (!ghl_contact_id && !email && !phone) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'ghl_contact_id, email, or phone required' }) };
  }

  const ghlKey = process.env.VITE_GHL_API_KEY;
  if (!ghlKey) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'GHL API key not configured' }) };
  }

  const ghlHeaders = {
    'Authorization': `Bearer ${ghlKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';

  // 1. Resolve GHL contact ID — try direct lookup, fallback to email/phone search
  let resolvedContactId = ghl_contact_id || '';
  let contactName = '';
  let contactEmail = '';
  let contactPhone = '';
  let _debug = {};

  // Try direct contact ID lookup
  if (resolvedContactId) {
    try {
      const contactRes = await fetch(`${GHL_BASE}/contacts/${resolvedContactId}`, { headers: ghlHeaders });
      _debug.contactStatus = contactRes.status;
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        contactName = contactData?.contact?.firstName || contactData?.contact?.name || '';
        contactEmail = contactData?.contact?.email || '';
        contactPhone = contactData?.contact?.phone || '';
      } else {
        console.log('[GetContactAppt] Contact ID lookup failed (status', contactRes.status, '), will try email/phone fallback');
        resolvedContactId = ''; // clear to trigger fallback
      }
    } catch (err) {
      console.log('[GetContactAppt] Contact fetch failed:', err.message);
      resolvedContactId = '';
    }
  }

  // Fallback: search by email, then phone
  if (!resolvedContactId && email) {
    try {
      const searchRes = await fetch(
        `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`,
        { headers: ghlHeaders }
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        resolvedContactId = data?.contact?.id || '';
        if (resolvedContactId) {
          contactName = data?.contact?.firstName || data?.contact?.name || '';
          contactEmail = data?.contact?.email || '';
          contactPhone = data?.contact?.phone || '';
          _debug.resolvedVia = 'email';
          console.log('[GetContactAppt] Resolved contact via email:', resolvedContactId);
        }
      }
    } catch (err) {
      console.log('[GetContactAppt] Email search failed:', err.message);
    }
  }

  if (!resolvedContactId && phone) {
    try {
      const searchRes = await fetch(
        `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&phone=${encodeURIComponent(phone)}`,
        { headers: ghlHeaders }
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        resolvedContactId = data?.contact?.id || '';
        if (resolvedContactId) {
          contactName = data?.contact?.firstName || data?.contact?.name || '';
          contactEmail = data?.contact?.email || '';
          contactPhone = data?.contact?.phone || '';
          _debug.resolvedVia = 'phone';
          console.log('[GetContactAppt] Resolved contact via phone:', resolvedContactId);
        }
      }
    } catch (err) {
      console.log('[GetContactAppt] Phone search failed:', err.message);
    }
  }

  if (!resolvedContactId) {
    console.log('[GetContactAppt] Could not resolve GHL contact for:', ghl_contact_id, email, phone);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ hasAppointment: false, contactName, contactEmail, contactPhone, _debug }),
    };
  }

  // 1b. Read ECP + sexo CF + standard gender from contact
  let contactEcp = '';
  let contactSexo = '';
  let contactGender = '';
  let bonoPaid = false;
  if (resolvedContactId) {
    try {
      const contactEcpRes = await fetch(`${GHL_BASE}/contacts/${resolvedContactId}`, { headers: ghlHeaders });
      if (contactEcpRes.ok) {
        const ecpData = await contactEcpRes.json();
        const ecpContact = ecpData?.contact || {};
        const ecpCfs = ecpContact.customFields || [];
        const ecpField = ecpCfs.find(f => f.id === 'cFIcdJlT9sfnC3KMSwDD');
        contactEcp = ecpField?.value || '';
        const sexoField = ecpCfs.find(f => f.id === 'P7D2edjnOHwXLpglw9tB');
        contactSexo = (sexoField?.value || '').toLowerCase();
        contactGender = (ecpContact.gender || '').toLowerCase();
      }
    } catch (err) {
      console.log('[GetContactAppt] ECP fetch failed:', err.message);
    }
  }

  // 2. Find opportunity with koibox_id (try open first, fallback to all statuses)
  let koiboxId = '';
  let clinica = '';
  try {
    let opportunities = [];
    const searchRes = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${resolvedContactId}&status=open`,
      { headers: ghlHeaders }
    );
    const searchData = await searchRes.json();
    _debug.oppSearchStatus = searchRes.status;
    opportunities = searchData?.opportunities || [];
    _debug.openOppCount = opportunities.length;
    console.log('[GetContactAppt] Open opportunities found:', opportunities.length);

    // Fallback: search all statuses if no open opportunity found
    if (opportunities.length === 0) {
      const searchRes2 = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${resolvedContactId}`,
        { headers: ghlHeaders }
      );
      const searchData2 = await searchRes2.json();
      opportunities = searchData2?.opportunities || [];
      console.log('[GetContactAppt] All-status opportunities found:', opportunities.length);
    }

    const opp = opportunities[0];

    if (opp?.id) {
      _debug.oppId = opp.id;
      const oppDetailRes = await fetch(`${GHL_BASE}/opportunities/${opp.id}`, { headers: ghlHeaders });
      _debug.oppDetailStatus = oppDetailRes.status;
      if (oppDetailRes.ok) {
        const oppDetail = await oppDetailRes.json();
        const cfs = oppDetail?.opportunity?.customFields || [];
        _debug.customFieldCount = cfs.length;
        _debug.customFieldIds = cfs.map(f => ({ id: f.id, key: f.key, value: (f.fieldValue || f.value || '').toString().substring(0, 50) }));
        const koiboxField = cfs.find(f => f.id === 'x1MAP0Om3rUW3a10ZiUe');
        _debug.koiboxFieldRaw = koiboxField || null;
        koiboxId = koiboxField?.fieldValue || koiboxField?.value || '';
        console.log('[GetContactAppt] Opportunity:', opp.id, 'koibox_id:', koiboxId);

        // Check payment status on opportunity
        const statusField = cfs.find(f => f.id === 'Hk81fRW2HaTqlry4I1L0');
        bonoPaid = !!(statusField?.value?.startsWith('paid') || statusField?.fieldValue?.startsWith('paid'));
        console.log('[GetContactAppt] Payment status:', statusField?.value || statusField?.fieldValue, 'bonoPaid:', bonoPaid);

        // Get clinica from contact custom fields
        const contactRes2 = await fetch(`${GHL_BASE}/contacts/${resolvedContactId}`, { headers: ghlHeaders });
        if (contactRes2.ok) {
          const cData = await contactRes2.json();
          const contactCfs = cData?.contact?.customFields || [];
          const clinicaField = contactCfs.find(f => f.id === 'upGgK5yc0bSDwqC99DkZ');
          clinica = (clinicaField?.value || '').toLowerCase();
        }
      }
    } else {
      console.log('[GetContactAppt] No opportunities found for contact:', resolvedContactId);
    }
  } catch (err) {
    console.log('[GetContactAppt] Opportunity search failed:', err.message);
  }

  if (!koiboxId) {
    console.log('[GetContactAppt] No koibox_id on opportunity, checking contact custom fields...');

    // Fallback: check contact's fecha_cita/hora_cita/clinica_cita custom fields
    try {
      const cfRes = await fetch(`${GHL_BASE}/contacts/${resolvedContactId}`, { headers: ghlHeaders });
      if (cfRes.ok) {
        const cfData = await cfRes.json();
        const cfs = cfData?.contact?.customFields || [];
        const fechaCita = (cfs.find(f => f.id === 'yEjha5MpjAeDrrUfFmur')?.value || '').substring(0, 10); // DATE → YYYY-MM-DD
        const horaCita = cfs.find(f => f.id === 'KX7eyTmYQKbi0937Wj9I')?.value || '';
        const clinicaCita = (cfs.find(f => f.id === 'upGgK5yc0bSDwqC99DkZ')?.value || '').toLowerCase();

        if (fechaCita && new Date(fechaCita) >= new Date(new Date().toISOString().substring(0, 10))) {
          console.log('[GetContactAppt] Found future appointment via contact custom fields:', fechaCita, horaCita);
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              hasAppointment: true,
              resolvedContactId,
              contactName,
              contactEmail,
              contactPhone,
              contactEcp,
              contactSexo,
              contactGender,
              bonoPaid,
              clinica: clinicaCita,
              appointment: {
                fecha: fechaCita,
                hora_inicio: horaCita,
              },
              _debug: { ..._debug, resolvedVia: _debug.resolvedVia || 'contactId', appointmentSource: 'contact_custom_fields' },
            }),
          };
        }
      }
    } catch (err) {
      console.log('[GetContactAppt] Contact custom fields check failed:', err.message);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ hasAppointment: false, contactName, contactEmail, contactPhone, contactEcp, contactSexo, contactGender, bonoPaid, _debug }),
    };
  }

  // 3. Get appointment from Koibox
  try {
    const res = await fetch(`${KOIBOX_BASE}/agenda/${koiboxId}/`, { headers: koiboxHeaders });
    if (!res.ok) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ hasAppointment: false, contactName, contactEmail, contactPhone, contactEcp, contactSexo, contactGender, bonoPaid }),
      };
    }
    const data = await res.json();

    // estado 5 = cancelled
    if (data.estado === 5) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ hasAppointment: false, contactName, contactEmail, contactPhone, contactEcp, contactSexo, contactGender, bonoPaid, previouslyCancelled: true }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        hasAppointment: true,
        resolvedContactId,
        contactName,
        contactEmail,
        contactPhone,
        koibox_id: koiboxId,
        contactEcp,
        contactSexo,
        contactGender,
        bonoPaid,
        clinica: clinica || '',
        appointment: {
          id: data.id,
          fecha: data.fecha,
          hora_inicio: data.hora_inicio,
          hora_fin: data.hora_fin,
          estado: data.estado,
        },
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
}

/**
 * Reschedule: cancel old appointment + create new one + update GHL.
 * Expects: koibox_id (old), ghl_contact_id, clinica, fecha, hora_inicio, hora_fin, nombre, email, movil
 */
async function rescheduleAppointment(body, koiboxHeaders, corsHeaders) {
  const { koibox_id, ghl_contact_id, clinica, fecha, hora_inicio, email } = body;

  if (!koibox_id || !fecha || !hora_inicio) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'koibox_id, fecha, hora_inicio required' }) };
  }

  // 1. Cancel old appointment in Koibox (estado 5)
  let cancelResult = { status: 'skipped' };
  try {
    const cancelRes = await fetch(`${KOIBOX_BASE}/agenda/${koibox_id}/`, {
      method: 'PATCH',
      headers: koiboxHeaders,
      body: JSON.stringify({ estado: 5 }),
    });
    cancelResult = cancelRes.ok ? { status: 'cancelled' } : { status: 'error', code: cancelRes.status };
    console.log('[Reschedule] Old appointment cancelled:', koibox_id, cancelResult.status);
  } catch (err) {
    cancelResult = { status: 'error', error: err.message };
    console.log('[Reschedule] Cancel failed:', err.message);
  }

  // 1b. Cancel old GHL calendar appointments before creating new one
  if (ghl_contact_id) {
    const ghlKey = process.env.VITE_GHL_API_KEY;
    if (ghlKey) {
      await cancelGHLAppointments(ghl_contact_id, {
        'Authorization': `Bearer ${ghlKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      });
    }
  }

  // 2. Create new appointment via the existing flow (also creates new GHL calendar event)
  const createResult = await createAppointment(
    { ...body, action: 'create_appointment' },
    koiboxHeaders,
    corsHeaders,
  );

  const createData = JSON.parse(createResult.body);

  // 3. Track reschedule event
  await trackServerEvent('appointment_rescheduled', {
    old_koibox_id: koibox_id,
    new_koibox_id: createData.appointmentId || '',
    clinica,
    fecha,
    hora_inicio,
    ghl_contact_id: ghl_contact_id || '',
  }, email);

  // 4. Add reschedule note to GHL
  const ghlKey = process.env.VITE_GHL_API_KEY;
  if (ghl_contact_id && ghlKey && createData.success) {
    try {
      const ghlHeaders = {
        'Authorization': `Bearer ${ghlKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
      };
      const noteBody = `🔄 CITA REAGENDADA\nCita anterior (Koibox #${koibox_id}) cancelada.\nNueva cita: ${fecha} a las ${hora_inicio} — ${clinica || ''}\nNuevo Koibox ID: ${createData.appointmentId}\nReagendado por el paciente: ${new Date().toISOString()}`;
      await fetch(`${GHL_BASE}/contacts/${ghl_contact_id}/notes`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({ body: noteBody }),
      });
      console.log('[Reschedule→GHL] Reschedule note added');
    } catch (err) {
      console.log('[Reschedule→GHL] Note failed:', err.message);
    }
  }

  return {
    statusCode: createResult.statusCode,
    headers: corsHeaders,
    body: JSON.stringify({
      success: createData.success,
      rescheduled: true,
      oldAppointmentId: koibox_id,
      oldCancelStatus: cancelResult.status,
      newAppointmentId: createData.appointmentId,
      fecha,
      hora_inicio,
      clinica,
      ghlSync: createData.ghlSync,
    }),
  };
}

/**
 * Cancel all active GHL calendar appointments for a contact.
 * Used during cancellation and reschedule flows.
 */
async function cancelGHLAppointments(contactId, ghlHeaders) {
  try {
    const res = await fetch(`${GHL_BASE}/contacts/${contactId}/appointments`, { headers: ghlHeaders });
    if (!res.ok) {
      console.log('[GHL] Failed to fetch appointments:', res.status);
      return [];
    }
    const data = await res.json();
    const active = (data.events || []).filter(e => e.appointmentStatus !== 'cancelled' && !e.deleted);
    const cancelled = [];

    for (const event of active) {
      try {
        const cancelRes = await fetch(`${GHL_BASE}/calendars/events/appointments/${event.id}`, {
          method: 'PUT',
          headers: ghlHeaders,
          body: JSON.stringify({ appointmentStatus: 'cancelled' }),
        });
        if (cancelRes.ok) {
          cancelled.push(event.id);
          console.log('[GHL] Appointment cancelled:', event.id);
        } else {
          console.log('[GHL] Failed to cancel appointment:', event.id, cancelRes.status);
        }
      } catch (err) {
        console.log('[GHL] Cancel appointment error:', event.id, err.message);
      }
    }
    return cancelled;
  } catch (err) {
    console.log('[GHL] Fetch appointments error:', err.message);
    return [];
  }
}

/**
 * After creating a Koibox appointment, sync status to GHL:
 * - Find contact by email/phone (or use provided ghl_contact_id)
 * - Update contact custom fields (fecha_cita, hora_cita, clinica_cita)
 * - Add note with appointment details
 * - Update opportunity: stage → Booked, tratamiento_status → booked, koibox_id, fecha, hora
 */
async function syncAppointmentToGHL({ nombre, email, movil, fecha, hora_inicio, clinica, koiboxId, ghl_contact_id, bonoPaid, contactEcp, contactSexo, contactGender }) {
  const ghlKey = process.env.VITE_GHL_API_KEY;
  if (!ghlKey) {
    console.log('[Koibox→GHL] No GHL API key, skipping sync');
    return { status: 'skipped', reason: 'no_api_key' };
  }

  const ghlHeaders = {
    'Authorization': `Bearer ${ghlKey}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  // 1. Use provided GHL contact ID, or find by email/phone
  let contactId = ghl_contact_id || null;
  const locationId = process.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';

  if (!contactId && email) {
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`,
      { headers: ghlHeaders }
    );
    if (searchRes.ok) {
      const data = await searchRes.json();
      contactId = data?.contact?.id;
    }
  }

  if (!contactId && movil) {
    const searchRes = await fetch(
      `${GHL_BASE}/contacts/search/duplicate?locationId=${locationId}&phone=${encodeURIComponent(movil)}`,
      { headers: ghlHeaders }
    );
    if (searchRes.ok) {
      const data = await searchRes.json();
      contactId = data?.contact?.id;
    }
  }

  if (!contactId) {
    console.log('[Koibox→GHL] Contact not found for:', email || movil);
    return { status: 'error', reason: 'contact_not_found' };
  }

  console.log('[Koibox→GHL] Found contact:', contactId);

  // 2. Read contact_score to derive lead_priority for the opportunity
  let leadPriority = 'WARM';
  try {
    const contactRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders });
    if (contactRes.ok) {
      const contactData = await contactRes.json();
      const scoreCf = (contactData?.contact?.customFields || []).find(f => f.id === 'SGT17lKk7bZgkInBTtrT');
      const scoreNum = parseInt(scoreCf?.value, 10) || 50;
      if (scoreNum >= 70) leadPriority = 'HOT';
      else if (scoreNum < 30) leadPriority = 'COLD';
      console.log('[Koibox→GHL] contact_score:', scoreCf?.value, '→ lead_priority:', leadPriority);
    }
  } catch (err) {
    console.log('[Koibox→GHL] Contact score read failed:', err.message);
  }

  const clinicaName = clinica ? clinica.charAt(0).toUpperCase() + clinica.slice(1) : '';

  // 3. Save appointment date/time as contact custom fields (for workflow triggers)
  // Custom field IDs created via GHL API:
  const APPOINTMENT_CF = {
    fecha_cita:   'yEjha5MpjAeDrrUfFmur',  // DATE
    hora_cita:    'KX7eyTmYQKbi0937Wj9I',  // TEXT
    clinica_cita: 'upGgK5yc0bSDwqC99DkZ',  // TEXT
  };

  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}`, {
      method: 'PUT',
      headers: ghlHeaders,
      body: JSON.stringify({
        customFields: [
          { id: APPOINTMENT_CF.fecha_cita, field_value: fecha || '' },
          { id: APPOINTMENT_CF.hora_cita, field_value: hora_inicio || '' },
          { id: APPOINTMENT_CF.clinica_cita, field_value: clinicaName || '' },
        ],
      }),
    });
    console.log('[Koibox→GHL] Contact custom fields updated (fecha_cita, hora_cita, clinica_cita)');
  } catch (err) {
    console.log('[Koibox→GHL] Contact custom fields update failed:', err.message);
  }

  // 4. Add note with appointment details
  const fechaDisplay = fecha || 'sin fecha';
  const horaDisplay = hora_inicio || 'sin hora';
  const noteBody = `📅 CITA AGENDADA — Diagnóstico Capilar\nClínica: Hospital Capilar ${clinicaName}\nFecha: ${fechaDisplay}\nHora: ${horaDisplay}\nReservado desde: Quiz online\nFecha de reserva: ${new Date().toISOString()}`;

  try {
    await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify({ body: noteBody }),
    });
    console.log('[Koibox→GHL] Note added to contact');
  } catch (err) {
    console.log('[Koibox→GHL] Note creation failed:', err.message);
  }

  // 5a. Cancel any existing GHL calendar appointments before creating new one
  try {
    await cancelGHLAppointments(contactId, ghlHeaders);
    console.log('[Koibox→GHL] Old calendar appointments cancelled');
  } catch (err) {
    console.log('[Koibox→GHL] Cancel old appointments failed:', err.message);
  }

  // 5b. Create appointment in GHL native calendar (need appointmentId for opportunity)
  const GHL_CALENDAR_ID = 'sMbNt8SyzfjroMbZvB74'; // Calendario HC (producción)
  // Primary team member configured on that calendar. Without assignedUserId,
  // GHL rejects the create with 422 (or with 400 "slot not available" if
  // ignoreFreeSlotValidation is also missing — the slot check uses the
  // assigned user's availability).
  const GHL_CALENDAR_ASSIGNED_USER = 'mUXWEKpsLkMbJSVg96Ft';
  let ghlAppointmentId = null;
  try {
    // Build ISO datetime from fecha (YYYY-MM-DD) + hora_inicio (HH:MM)
    // Use Intl to determine current Spain offset (CET +01:00 or CEST +02:00)
    const probeDate = new Date(`${fecha}T${hora_inicio}:00Z`);
    const madridStr = probeDate.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
    const madridDate = new Date(madridStr + ' UTC');
    const offsetMs = madridDate - probeDate;
    const offsetHours = Math.round(offsetMs / 3600000);
    const offsetStr = `${offsetHours >= 0 ? '+' : '-'}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;

    const startLocal = `${fecha}T${hora_inicio}:00${offsetStr}`;
    const startDate = new Date(startLocal);
    const endDate = new Date(startDate.getTime() + 30 * 60000); // 30min slot
    // GHL expects ISO strings in UTC
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const calPayload = {
      calendarId: GHL_CALENDAR_ID,
      locationId,
      contactId,
      assignedUserId: GHL_CALENDAR_ASSIGNED_USER,
      startTime: startISO,
      endTime: endISO,
      title: `Diagnóstico Capilar - ${nombre || 'Paciente'}`,
      appointmentStatus: 'confirmed',
      toNotify: true,
      selectedTimezone: 'Europe/Madrid',
      // We've already validated the slot in Koibox (the source of truth for
      // staff availability). GHL's slot check uses its own calendar config,
      // which would reject any time outside its narrow availability window.
      ignoreFreeSlotValidation: true,
    };
    console.log('[Koibox→GHL] Creating calendar event, payload:', JSON.stringify(calPayload));

    const calRes = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
      method: 'POST',
      headers: ghlHeaders,
      body: JSON.stringify(calPayload),
    });
    const calData = await calRes.json();
    if (calRes.ok) {
      ghlAppointmentId = calData?.id || calData?.event?.id || null;
      console.log('[Koibox→GHL] Calendar appointment created:', ghlAppointmentId);
    } else {
      console.log('[Koibox→GHL] Calendar appointment failed:', calRes.status, JSON.stringify(calData));
      // The Koibox booking already succeeded — failing here means the GHL UI's
      // Appointments tab won't show the cita. Alert so we notice instead of
      // discovering it via a confused user.
      sendAlert(
        'koibox-proxy',
        `GHL calendar event creation failed for ${nombre || email || 'paciente'} (${fecha} ${hora_inicio})`,
        {
          severity: 'warning',
          contactId,
          koiboxId,
          fecha,
          hora_inicio,
          ghl_status: calRes.status,
          ghl_response: typeof calData === 'object' ? JSON.stringify(calData).slice(0, 500) : String(calData).slice(0, 500),
        }
      ).catch(() => {});
    }
  } catch (err) {
    console.log('[Koibox→GHL] Calendar appointment error:', err.message);
  }

  // 5b. Update opportunity: move to "Booked" stage + link appointment + update custom fields
  const PIPELINE_STAGE_BOOKED = 'f9e5c1cf-7701-4883-ac96-f16b3d78c0d5';
  // Opportunity custom field IDs
  const OPP_CF_BOOKING = {
    tratamiento_status: 'Hk81fRW2HaTqlry4I1L0',  // Tratamiento Status (SINGLE_OPTIONS)
    koibox_id:          'x1MAP0Om3rUW3a10ZiUe',  // koibox_id (TEXT)
    appointment_date:   'UTUymkHREIxPmmMzx5N1',  // appointment_date (DATE)
    appointment_hour:   'ftEDr8jnG1GEe5dObXCl',  // Appointment hour (TEXT)
    fecha_cita_opp:     'RXAkzlyYHnz4MjYuYaml',  // fecha_cita_opp (DATE) - mirrors contact.fecha_cita
    hora_cita_opp:      'age1q0r6Ek0PQztGZ4FJ',   // hora_cita_opp (TEXT) - mirrors contact.hora_cita
    link_reagendar:     'FuAgIVjPvnlMyIybL8fX',  // link_reagendar (TEXT) - patient self-service reschedule/cancel
  };

  try {
    // Search open opportunities first, fallback to all statuses (reschedule may have moved it)
    let opportunities = [];
    const searchRes = await fetch(
      `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${contactId}&status=open`,
      { headers: ghlHeaders }
    );
    const searchData = await searchRes.json();
    opportunities = searchData?.opportunities || [];

    if (opportunities.length === 0) {
      const searchRes2 = await fetch(
        `${GHL_BASE}/opportunities/search?location_id=${locationId}&contact_id=${contactId}`,
        { headers: ghlHeaders }
      );
      const searchData2 = await searchRes2.json();
      opportunities = searchData2?.opportunities || [];
      if (opportunities.length > 0) {
        console.log('[Koibox→GHL] Found opportunity in non-open status, will reopen:', opportunities[0].id);
      }
    }

    if (opportunities.length > 0) {
      const opp = opportunities[0];
      const SITE_BASE = process.env.SITE_URL || 'https://diagnostico.hospitalcapilar.com';
      const linkReagendar = `${SITE_BASE}/mi-cita?c=${contactId}`;

      const customFields = [
        { id: OPP_CF_BOOKING.koibox_id, field_value: koiboxId || '' },
        { id: OPP_CF_BOOKING.fecha_cita_opp, field_value: fecha || '' },
        { id: OPP_CF_BOOKING.hora_cita_opp, field_value: hora_inicio || '' },
        { id: OPP_CF_BOOKING.link_reagendar, field_value: linkReagendar },
        { id: 'l99Opesqh9cJBLxSPs4z', field_value: leadPriority },
      ];

      const oppUpdate = {
        pipelineStageId: PIPELINE_STAGE_BOOKED,
        status: 'open',
        customFields,
      };

      await fetch(`${GHL_BASE}/opportunities/${opp.id}`, {
        method: 'PUT',
        headers: ghlHeaders,
        body: JSON.stringify(oppUpdate),
      });
      console.log('[Koibox→GHL] Opportunity moved to Booked stage:', opp.id, 'calendarEvent:', ghlAppointmentId, 'koiboxId:', koiboxId);
    }
  } catch (err) {
    console.log('[Koibox→GHL] Opportunity update failed:', err.message);
  }

  // 6. Tag bono_pendiente/pagado for women who haven't/have paid yet.
  // Gate on sexo CF OR standard GHL gender (ECP may be 'Ciudad sin clinica' out of pilot).
  const isWoman = (contactSexo || '').toLowerCase() === 'mujer'
    || (contactGender || '').toLowerCase() === 'female';

  if (isWoman && !bonoPaid) {
    try {
      await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({ tags: ['bono_pendiente'] }),
      });
      console.log('[Koibox→GHL] Tag bono_pendiente added (sexo mujer, no payment yet)');
    } catch (err) {
      console.log('[Koibox→GHL] Tag bono_pendiente failed:', err.message);
    }
  } else if (isWoman && bonoPaid) {
    try {
      await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
        method: 'POST',
        headers: ghlHeaders,
        body: JSON.stringify({ tags: ['bono_pagado'] }),
      });
      console.log('[Koibox→GHL] Tag bono_pagado added (sexo mujer, already paid)');
    } catch (err) {
      console.log('[Koibox→GHL] Tag bono_pagado failed:', err.message);
    }
  }

  return { status: 'ok', contactId };
}

// ─── Salesforce Web-To-Lead sync on booking ────────────────────────────────
const SALESFORCE_URL = 'https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8&orgId=00D090000047Cb3';

const SF = {
  oid:                     '00D090000047Cb3',
  // Booking-specific fields (from HC Salesforce admin)
  cita_asesoria:           '00NIV00001XhtqX',   // Fecha y hora de cita
  interesado_en:           '00N0900000CPq2Y',   // Campo libre — perfil clínico
  tipo_proceso_venta:      '00N0900000CPq2U',   // "Presencial"
  // Estado + Propietario: managed by Salesforce Flow (Origen=GU4 → estado + owner by clínica)
  // G4U fields
  clinica_pck:             '00NbE000006pqPJ',
  lopd_firmada:            '00N0900000CPq2F',
  acepta_comunicaciones:   '00N0900000CPq1v',
  g4u_id:                  '00NbE000006ougH',
  g4u_perfil_clinico:      '00NbE000006pt3p',
  g4u_score:               '00NbE000006psAz',
  g4u_door:                '00NbE000006pqXP',
  genero:                  '00N0900000CPq2O',
  g4u_edad:                '00NbE000006pvbt',
  g4u_problema:            '00NbE000006pvwr',
  g4u_tiempo:              '00NbE000006pvvF',
  g4u_probado:             '00NbE000006pvyT',
  g4u_motivacion:          '00NbE000006ptJx',
  g4u_formato:             '00NbE000006ptOn',
  g4u_condicion:           '00NbE000006ptTd',
  g4u_mensaje_comercial:   '00NbE000006ptWr',
  g4u_utm_source:          '00NbE000006ptYT',
  g4u_utm_medium:          '00NbE000006pta5',
  g4u_utm_campaign:        '00NbE000006ptjl',
  g4u_utm_content:         '00NbE000006ptob',
  g4u_utm_term:            '00NbE000006pt8g',
  g4u_fbclid:              '00NbE000006ptqD',
  g4u_gclid:               '00NbE000006pttR',
  g4u_referrer:            '00NbE000006ptv3',
  g4u_landing_url:         '00NbE000006ptwf',
};

/**
 * Send lead to Salesforce via Web-To-Lead when appointment is booked.
 * Gathers full data from GHL contact + Firestore lead record.
 * Fire-and-forget: does not block the booking response.
 *
 * Mapping per Hospital Capilar Salesforce spec:
 * - Estado de candidato: "Cita agendada con asesor"
 * - Propietario: "Noemí Díez" (via lead assignment rules in SF)
 * - Tipo proceso de venta: "Presencial"
 * - Origen del candidato: "GU4"
 * - All G4U custom fields from quiz data
 */
async function sendBookingToSalesforce({ email, nombre, phone, clinica, fecha, hora_inicio, ghl_contact_id }) {
  try {
    // 1. Get full lead data from Firestore (quiz answers, consent, source)
    const lead = await getLeadByEmail(email);

    // 2. Get G4U custom fields from GHL contact
    let ghlCustomFields = {};
    if (ghl_contact_id) {
      const ghlKey = process.env.VITE_GHL_API_KEY;
      if (ghlKey) {
        try {
          const ghlHeaders = {
            'Authorization': `Bearer ${ghlKey}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28',
          };
          const contactRes = await fetch(`${GHL_BASE}/contacts/${ghl_contact_id}`, { headers: ghlHeaders });
          if (contactRes.ok) {
            const contactData = await contactRes.json();
            const cfs = contactData?.contact?.customFields || [];
            // Map GHL custom field IDs to readable keys
            const cfMap = {
              'cFIcdJlT9sfnC3KMSwDD': 'ecp',
              'SGT17lKk7bZgkInBTtrT': 'score',
              '2JYlfGk60lHbuyh9vcdV': 'door',
              'P7D2edjnOHwXLpglw9tB': 'sexo',
              'o4I4AG3ZK07nEzAMLTlK': 'nicho',
              'liIshAFJMngl2BV9MtVw': 'funnel_type',
              '5voFSSQP0yBFa8VdLuzY': 'agent_message',
            };
            for (const cf of cfs) {
              const key = cfMap[cf.id];
              if (key) ghlCustomFields[key] = cf.value || '';
            }
          }
        } catch (err) {
          console.log('[SF-Booking] GHL contact fetch failed:', err.message);
        }
      }
    }

    // 3. Merge data sources (Firestore lead > GHL custom fields > defaults)
    const source = lead?.source || {};
    const firstName = (nombre || '').split(' ')[0] || '';
    const lastName = (nombre || '').split(' ').slice(1).join(' ') || '';
    const clinicaMap = { madrid: 'Madrid', murcia: 'Murcia', pontevedra: 'Pontevedra' };
    const generoMap = { hombre: 'Masculino', mujer: 'Femenino' };
    const formatoMap = { presencial: 'Presencial', online: 'Online', llamada: 'Llamada' };

    // Build Salesforce Web-To-Lead payload
    const params = new URLSearchParams();
    params.append('oid', SF.oid);
    params.append('retURL', 'http://');

    // Standard fields
    params.append('first_name', firstName);
    params.append('last_name', lastName);
    params.append('email', email || '');
    params.append('phone', phone || '');
    params.append('lead_source', 'GU4');
    // Estado + Propietario: managed by Salesforce Flow (trigger: Origen = GU4, assigns by Clínica)

    // Booking-specific fields
    const citaDateTime = fecha && hora_inicio ? `${fecha}T${hora_inicio}:00` : '';
    params.append(SF.cita_asesoria, citaDateTime);
    params.append(SF.interesado_en, ghlCustomFields.ecp || lead?.ecp || '');
    params.append(SF.tipo_proceso_venta, 'Presencial');
    params.append(SF.clinica_pck, clinicaMap[clinica] || '');

    // G4U custom fields — from Firestore lead (quiz answers)
    params.append(SF.g4u_id, ghl_contact_id || '');
    params.append(SF.g4u_perfil_clinico, ghlCustomFields.ecp || lead?.ecp || '');
    params.append(SF.g4u_score, String(ghlCustomFields.score || lead?.score || ''));
    params.append(SF.g4u_door, ghlCustomFields.door || source.door || '');
    params.append(SF.genero, generoMap[lead?.answersRaw?.sexo] || '');
    params.append(SF.g4u_edad, lead?.answersRaw?.edad || '');
    params.append(SF.g4u_problema, lead?.answersRaw?.problema || '');
    params.append(SF.g4u_tiempo, lead?.answersRaw?.tiempo || '');
    params.append(SF.g4u_probado, Array.isArray(lead?.answersRaw?.probado) ? lead.answersRaw.probado.join(', ') : (lead?.answersRaw?.probado || ''));
    params.append(SF.g4u_motivacion, lead?.answersRaw?.motivacion || '');
    params.append(SF.g4u_formato, formatoMap[lead?.answersRaw?.formato] || '');
    params.append(SF.g4u_condicion, Array.isArray(lead?.answersRaw?.condicion) ? lead.answersRaw.condicion.join(', ') : (lead?.answersRaw?.condicion || ''));
    params.append(SF.g4u_mensaje_comercial, ghlCustomFields.agent_message || lead?.agentMessage || '');

    // Consent (LOPD)
    params.append(SF.lopd_firmada, lead?.answersRaw?.consentPrivacidad ? 'Sí' : 'No');
    params.append(SF.acepta_comunicaciones, lead?.answersRaw?.consentComunicaciones ? '1' : '0');

    // UTM & attribution
    params.append(SF.g4u_utm_source, source.utm_source || '');
    params.append(SF.g4u_utm_medium, source.utm_medium || '');
    params.append(SF.g4u_utm_campaign, source.utm_campaign || '');
    params.append(SF.g4u_utm_content, source.utm_content || '');
    params.append(SF.g4u_utm_term, source.utm_term || '');
    params.append(SF.g4u_fbclid, source.fbclid || '');
    params.append(SF.g4u_gclid, source.gclid || '');
    params.append(SF.g4u_referrer, source.referrer || '');
    params.append(SF.g4u_landing_url, source.landing_url || '');

    // 4. Send to Salesforce
    const res = await fetch(SALESFORCE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    console.log('[SF-Booking] Web-To-Lead sent for', email, '— status:', res.status, '— clinica:', clinica, '— fecha:', fecha);
  } catch (err) {
    console.log('[SF-Booking] Failed:', err.message);
  }
}

/**
 * Track an event server-side to PostHog.
 * Fire-and-forget: does not block the response.
 */
async function trackServerEvent(eventName, properties = {}, distinctId = null) {
  const posthogKey = process.env.VITE_POSTHOG_KEY;
  if (!posthogKey) return;

  const payload = {
    api_key: posthogKey,
    event: eventName,
    timestamp: new Date().toISOString(),
    properties: {
      ...properties,
      distinct_id: distinctId || 'server-anonymous',
      $lib: 'server-netlify',
    },
  };

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log('[PostHog] Server capture failed:', err.message);
  }
}

/**
 * Search for a client by phone or email.
 */
async function searchClient(body, koiboxHeaders, corsHeaders) {
  const { movil, email } = body;

  if (!movil && !email) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'movil or email required' }) };
  }

  const param = movil
    ? `movil=${encodeURIComponent(movil)}`
    : `email=${encodeURIComponent(email)}`;

  const res = await fetch(`${KOIBOX_BASE}/clientes/?${param}`, {
    headers: koiboxHeaders,
  });

  if (!res.ok) {
    return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify({ error: 'Search failed' }) };
  }

  const data = await res.json();
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      count: data.count,
      results: data.results.map(c => ({
        id: c.id,
        nombre: c.nombre,
        apellido1: c.apellido1,
        email: c.email,
        movil: c.movil,
        provincia: c.provincia,
      })),
    }),
  };
}

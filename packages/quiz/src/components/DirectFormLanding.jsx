import React, { useState } from 'react';
import { Phone, CheckCircle2, Loader2, Clock, ShieldCheck } from 'lucide-react';
import PhoneInput from './PhoneInput';
import { useAnalytics, getUTMParams, classifyTrafficSource } from '@hospital-capilar/shared/analytics';
import { db } from '@hospital-capilar/shared/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { safeFetch } from '../utils/safeFetch';
import { NICHOS } from './nichoConfig';
import {
  TopBar,
  StatsSection,
  PainPointsSection,
  SolutionSection,
  ClinicGallerySection,
  TestimonialsSection,
  CEOSection,
  FAQSection,
  Footer,
} from './LandingSections';

const WhatsAppIcon = ({ size = 24, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const UbicacionSelect = ({ value, onChange, className }) => (
  <select name="provincia" value={value} onChange={onChange} className={className}>
    <option value="" disabled>Selecciona una ubicación...</option>
    <optgroup label="Clínicas Operativas">
      <option value="madrid">Madrid</option>
      <option value="murcia">Murcia</option>
      <option value="pontevedra">Pontevedra</option>
    </optgroup>
    <optgroup label="Próximas aperturas (Lista Prioritaria)">
      <option value="acoruna">A Coruña (2026)</option>
      <option value="mostoles">Móstoles (2026)</option>
      <option value="albacete">Albacete (2026)</option>
      <option value="valladolid">Valladolid (2026)</option>
      <option value="burgos">Burgos (2026)</option>
      <option value="valencia">Valencia (2026)</option>
    </optgroup>
    <option value="otra">Otra ciudad</option>
  </select>
);

const DirectFormLanding = ({ nicho = 'que-me-pasa' }) => {
  const config = NICHOS[nicho] || NICHOS['que-me-pasa'];
  const analytics = useAnalytics();
  const [utmParams] = useState(() => getUTMParams());

  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', provincia: '', consentPrivacidad: false, consentComunicaciones: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre || !form.telefono) return;
    if (submitting) return; // Prevent double-submit

    setSubmitting(true);

    analytics.trackEvent('direct_form_submitted', {
      nicho,
      door: config.door,
      ecp: config.ecp,
      provincia: form.provincia,
      utm_source: utmParams.utm_source || 'direct',
    });
    analytics.trackEvent('lead_classified', { ecp: config.ecp, traffic_source: classifyTrafficSource(utmParams), funnel_type: 'formulario_directo', nicho });

    const nameParts = form.nombre.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const sourceChannel = utmParams.utm_source
      ? `${utmParams.utm_source}/${utmParams.utm_medium || 'unknown'}`
      : document.referrer ? 'organic/referral' : 'direct';

    // GHL Custom Field IDs — Contact level (definitivo)
    const CF = {
      door:                    '2JYlfGk60lHbuyh9vcdV',
      ecp:                     'cFIcdJlT9sfnC3KMSwDD',
      agent_message_contact:   '5voFSSQP0yBFa8VdLuzY',
      contact_score:           'SGT17lKk7bZgkInBTtrT',
      consent:                 'x2QNuqJqst8Oy8H6pV0G',
      ubicacion_clinica:       'LygjPVQnLbqqdL4eqQwT',
      utm_source:              'MisB9YJJAH7cnh8JOtQn',
      utm_medium:              'vykx7m6bcfbYMXRqToYP',
      utm_campaign:            '3fUI7GO9o7oZ7ddMNnFf',
      utm_content:             'dydSaUSYbb5R7nYOboLq',
      utm_term:                'eLdhsOthmyD38al527tG',
      nicho:                   'o4I4AG3ZK07nEzAMLTlK',
      funnel_type:             'liIshAFJMngl2BV9MtVw',
      traffic_source:          'miu6E3oxZowYahYGjX1A',
    };

    // contact_score: NUMERICAL 0-100 (form tiene menos peso que quiz)
    const clinicasOperativas = ['madrid', 'murcia', 'pontevedra'];
    const isOperativa = clinicasOperativas.includes(form.provincia);
    let contactScore = 50; // NORMAL — form + operativa o próximas aperturas
    if (!isOperativa && (form.provincia === 'otra' || !form.provincia)) contactScore = 20; // OUT

    // Ubicación legible para city nativo
    const ubicacionMap = {
      madrid: 'Madrid', murcia: 'Murcia', pontevedra: 'Pontevedra',
      acoruna: 'A Coruña', mostoles: 'Móstoles', albacete: 'Albacete',
      valladolid: 'Valladolid', burgos: 'Burgos', valencia: 'Valencia', otra: 'Otra ciudad',
    };

    const agentMsg = `Lead desde formulario directo (${nicho}). ECP: ${config.ecp}. Ciudad: ${ubicacionMap[form.provincia] || form.provincia}. Canal: ${sourceChannel}.`;

    const customFields = [
      { id: CF.door, field_value: 'form' },
      { id: CF.ecp, field_value: config.ecp },
      { id: CF.agent_message_contact, field_value: agentMsg },
      { id: CF.contact_score, field_value: contactScore },
      { id: CF.ubicacion_clinica, field_value: form.provincia || '' },
      { id: CF.consent, field_value: (() => {
        const opts = [];
        if (form.consentPrivacidad) opts.push('He leído y acepto la Política de Privacidad');
        if (form.consentComunicaciones) opts.push('Acepto recibir comunicaciones comerciales por email, Whatsapp y/o teléfono sobre tratamientos, promociones y novedades.');
        return opts;
      })() },
      { id: CF.nicho, field_value: nicho || 'general' },
      { id: CF.funnel_type, field_value: 'formulario_directo' },
      { id: CF.traffic_source, field_value: classifyTrafficSource(utmParams) || 'direct' },
    ];

    // UTMs
    if (utmParams.utm_source) customFields.push({ id: CF.utm_source, field_value: utmParams.utm_source });
    if (utmParams.utm_medium) customFields.push({ id: CF.utm_medium, field_value: utmParams.utm_medium });
    if (utmParams.utm_campaign) customFields.push({ id: CF.utm_campaign, field_value: utmParams.utm_campaign });
    if (utmParams.utm_content) customFields.push({ id: CF.utm_content, field_value: utmParams.utm_content });
    if (utmParams.utm_term) customFields.push({ id: CF.utm_term, field_value: utmParams.utm_term });
    // TODO: Add GHL custom field IDs for fbclid and gclid when created in GHL

    const payload = {
      locationId: import.meta.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf',
      firstName,
      lastName,
      email: form.email || '',
      phone: form.telefono,
      city: ubicacionMap[form.provincia] || form.provincia || '',
      country: 'Spain',
      tags: ['new_lead'],
      source: utmParams.utm_source
        ? `Form HC - ${utmParams.utm_source}/${utmParams.utm_medium || ''}`
        : `Form Hospital Capilar - ${nicho}`,
      customFields,
      _agentMessage: agentMsg,
      _quizAnswers: '',
      _contactScore: contactScore,
      _salesforceData: {
        door: 'form',
        ecp: config.ecp,
        ubicacion: form.provincia || '',
        consentPrivacidad: !!form.consentPrivacidad,
        consentComunicaciones: !!form.consentComunicaciones,
        utm_source: utmParams.utm_source || '',
        utm_medium: utmParams.utm_medium || '',
        utm_campaign: utmParams.utm_campaign || '',
        utm_content: utmParams.utm_content || '',
        utm_term: utmParams.utm_term || '',
        fbclid: utmParams.fbclid || '',
        gclid: utmParams.gclid || '',
        referrer: document.referrer || '',
        landing_url: window.location.href || '',
      },
    };

    let ghlResult = { status: 'pending' };

    try {
      const response = await safeFetch('/.netlify/functions/ghl-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { timeoutMs: 20000, retries: 1, label: 'GHL-Form' });
      const data = await response.json();
      ghlResult = {
        status: response.ok ? 'ok' : 'error',
        httpStatus: response.status,
        contactId: data.contactId || null,
        oppError: data.oppError || null,
      };
    } catch (err) {
      ghlResult = { status: 'error', error: err.message };
    }

    try {
      await addDoc(collection(db, 'quiz_leads'), {
        nombre: form.nombre,
        email: form.email || '',
        telefono: form.telefono,
        ubicacion: form.provincia,
        nicho,
        ecp: config.ecp,
        score: 50,
        frame: 'FORM_DIRECT',
        answersRaw: {},
        answersReadable: {},
        agentMessage: payload._agentMessage,
        behavior: { sessionId: analytics.sessionId || null },
        source: {
          channel: sourceChannel,
          traffic_source: classifyTrafficSource(utmParams),
          funnel_type: 'formulario_directo',
          nicho,
          utm_source: utmParams.utm_source || null,
          utm_medium: utmParams.utm_medium || null,
          utm_campaign: utmParams.utm_campaign || null,
          utm_content: utmParams.utm_content || null,
          utm_term: utmParams.utm_term || null,
          fbclid: utmParams.fbclid || null,
          gclid: utmParams.gclid || null,
          referrer: document.referrer || 'direct',
          landing_url: window.location.href,
          door: 'form',
        },
        ghl: ghlResult,
        status: 'new',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Firestore save error:', err);
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    const WA_PHONE = '34623457218';
    const waText = encodeURIComponent(
      `Hola, soy ${form.nombre.split(' ')[0]}. Acabo de solicitar una valoración en Hospital Capilar desde la web. Me gustaría recibir más información.`
    );
    const waUrl = `https://wa.me/${WA_PHONE}?text=${waText}`;

    return (
      <div className="min-h-screen bg-white font-sans">
        {/* Top bar */}
        <div className="h-1.5 w-full bg-[#4CA994]" />

        <div className="max-w-2xl mx-auto px-6 py-16">
          {/* Logo */}
          <div className="text-center mb-10">
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-12 mx-auto" />
          </div>

          {/* Success card */}
          <div className="bg-[#F0F7F6] rounded-3xl p-8 md:p-12 text-center mb-8">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <CheckCircle2 size={40} className="text-[#4CA994]" />
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">
              ¡Solicitud recibida, {form.nombre.split(' ')[0]}!
            </h1>
            <p className="text-lg text-gray-600 max-w-md mx-auto">
              Un asesor médico de Hospital Capilar te contactará en menos de 24 horas.
            </p>
          </div>

          {/* WhatsApp CTA — primary */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => analytics.trackEvent('thankyou_whatsapp_clicked', { nicho })}
            className="w-full py-4 rounded-2xl bg-[#25D366] hover:bg-[#1da851] text-white font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition-all hover:-translate-y-0.5 mb-4"
          >
            <WhatsAppIcon size={24} className="text-white" />
            Escríbenos por WhatsApp
          </a>

          {/* Phone CTA — secondary */}
          <a
            href="tel:+34623457218"
            className="w-full py-4 rounded-2xl border-2 border-gray-200 text-gray-700 font-bold text-lg flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors mb-10"
          >
            <Phone size={20} />
            Llamar al 623 457 218
          </a>

          {/* What happens next */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900 text-center mb-6">¿Qué pasa ahora?</h3>
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-[#4CA994] rounded-full flex items-center justify-center shrink-0 text-white font-bold">1</div>
              <div>
                <p className="font-bold text-gray-900">Te llamamos en menos de 24h</p>
                <p className="text-sm text-gray-500">Un asesor médico revisará tu caso y te contactará.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-[#4CA994] rounded-full flex items-center justify-center shrink-0 text-white font-bold">2</div>
              <div>
                <p className="font-bold text-gray-900">Resolvemos tus dudas</p>
                <p className="text-sm text-gray-500">Te explicamos el proceso, respondemos todas tus preguntas y evaluamos tu caso.</p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-[#4CA994] rounded-full flex items-center justify-center shrink-0 text-white font-bold">3</div>
              <div>
                <p className="font-bold text-gray-900">Agendamos tu valoración</p>
                <p className="text-sm text-gray-500">Si decides dar el paso, coordinamos una cita presencial en la clínica más cercana.</p>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-4 mt-10 text-center">
            <div>
              <ShieldCheck size={24} className="text-[#4CA994] mx-auto mb-2" />
              <p className="text-xs text-gray-500 font-medium">Centro médico especializado</p>
            </div>
            <div>
              <Clock size={24} className="text-[#4CA994] mx-auto mb-2" />
              <p className="text-xs text-gray-500 font-medium">Respuesta en menos de 24h</p>
            </div>
            <div>
              <CheckCircle2 size={24} className="text-[#4CA994] mx-auto mb-2" />
              <p className="text-xs text-gray-500 font-medium">+50.000 pacientes tratados</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const formFields = (
    <>
      <h2 className="text-white text-xl font-bold text-center mb-2">SOLICITA TU VALORACIÓN</h2>
      <a href="tel:+34623457218" className="flex items-center justify-center gap-2 text-[#4CA994] font-bold mb-6">
        <Phone size={18} /> 623 457 218
      </a>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            name="nombre"
            placeholder="Nombre y Apellido"
            value={form.nombre}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 rounded-xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4CA994]"
          />
          <input
            type="email"
            name="email"
            placeholder="Correo electrónico"
            value={form.email}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-xl bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4CA994]"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PhoneInput
            value={form.telefono}
            onChange={(phone) => setForm(prev => ({ ...prev, telefono: phone }))}
            required
            inputClassName="px-4 py-3 bg-white text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-[#4CA994]"
            placeholder="612 345 678"
          />
          <UbicacionSelect
            value={form.provincia}
            onChange={handleChange}
            className="w-full px-4 py-3 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4CA994]"
          />
        </div>

        <div className="space-y-2 mt-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.consentPrivacidad} onChange={e => setForm({ ...form, consentPrivacidad: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#4CA994] focus:ring-[#4CA994]" />
            <span className="text-xs text-gray-400">Acepto la <a href="https://hospitalcapilar.com/politica-de-privacidad" target="_blank" rel="noopener noreferrer" className="underline text-[#4CA994]">política de privacidad</a> <span className="text-red-400">*</span></span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.consentComunicaciones} onChange={e => setForm({ ...form, consentComunicaciones: e.target.checked })}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#4CA994] focus:ring-[#4CA994]" />
            <span className="text-xs text-gray-400">Acepto recibir comunicaciones sobre tratamientos capilares</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting || !form.consentPrivacidad}
          className="w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-[#4CA994]"
        >
          {submitting ? <><Loader2 size={20} className="animate-spin" /> Enviando...</> : config.ctaForm}
        </button>
      </form>
    </>
  );

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">
      <TopBar />

      {/* Hero + Form side by side on desktop */}
      <div className="relative bg-[#2C3E50] text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <img src="/logo-hc-white.png" alt="Hospital Capilar" className="h-10" />
            </div>
            <p className="text-[#4CA994] text-sm font-bold tracking-widest uppercase mb-4">{config.badge}</p>
            <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">{config.headline}</h1>
            <p className="text-lg text-gray-300 max-w-xl">{config.subheadline}</p>
          </div>
          <div className="hidden lg:block">
            <div className="bg-[#2C3E50] rounded-2xl p-8 shadow-2xl">{formFields}</div>
          </div>
        </div>
      </div>

      {/* Form (mobile) */}
      <div className="lg:hidden max-w-2xl mx-auto px-6 -mt-6 relative z-10">
        <div className="bg-[#2C3E50] rounded-2xl p-8 shadow-2xl">{formFields}</div>
      </div>

      <StatsSection stats={config.stats} />
      <PainPointsSection painPoints={config.painPoints} />
      <SolutionSection solution={config.solution} />
      <ClinicGallerySection />
      <TestimonialsSection testimonials={config.testimonials} videoTestimonial={config.videoTestimonial} />
      <CEOSection />
      <FAQSection faqs={config.faqs} />

      {/* Final CTA */}
      <section className="bg-[#2C3E50] py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Da el primer paso hoy
          </h2>
          <p className="text-lg text-gray-300 mb-8">
            Déjanos tus datos y un asesor médico te contactará en menos de 24h. Sin compromiso.
          </p>
          <a
            href="#form-top"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-bold text-lg shadow-xl hover:-translate-y-1 hover:shadow-2xl transition-all bg-[#4CA994]"
          >
            {config.ctaForm}
          </a>
          <p className="text-gray-400 mt-6">
            O llámanos: <a href="tel:+34623457218" className="text-[#4CA994] font-bold">623 457 218</a>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default DirectFormLanding;

import React, { useState, useRef } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, Loader2, Phone, ShieldCheck, Stethoscope, Clock, Check, X, Star, ChevronDown } from 'lucide-react';
import PhoneInput from './PhoneInput';
import { useAnalytics, getUTMParams, classifyTrafficSource } from '@hospital-capilar/shared/analytics';
import { db } from '@hospital-capilar/shared/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { safeFetch } from '../utils/safeFetch';
import { NICHOS } from './nichoConfig';
import { OBJECTIONS_BY_ECP, TESTIMONIALS_BY_ECP, INCLUDED_BY_CTA, FAQS_BY_CTA } from './resultContent';
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

// ECP mapping from situacion answer
const SITUACION_ECP = {
  'caida-sin-diagnostico': '¿Qué Me Pasa?',
  'entradas-coronilla': '¿Qué Me Pasa?',
  'joven-perdida': 'El Espejo',
  'postparto': 'Lo Que Vino Con el Bebé',
  'hormonal': 'Es Normal',
  'post-cirugia': 'La Inversión',
  'mala-experiencia': 'Ya Me Engañaron',
  'no-se-que-tengo': '¿Qué Me Pasa?',
  'otc-frustrado': 'La Farmacia',
  'cuero-cabelludo': 'No candidato',
};

// ECP result messages (short version)
const ECP_MESSAGES = {
  '¿Qué Me Pasa?': {
    title: 'Tu caída necesita un test capilar profesional',
    body: 'Sin una tricoscopía y analítica, cualquier tratamiento es una apuesta. En 30 minutos sabrás exactamente qué tienes.',
  },
  'El Espejo': {
    title: 'Actuar temprano es la mejor decisión',
    body: 'Cuanto antes se diagnostica, más opciones tienes. La caída no se frena sola — pero con un test capilar a tiempo, los resultados son excelentes.',
  },
  'Es Normal': {
    title: 'Tu caída puede estar conectada a un desbalance hormonal',
    body: 'Necesitas una analítica hormonal cruzada con estudio capilar. Es la pieza que falta entre tu pelo y tu salud.',
  },
  'Lo Que Vino Con el Bebé': {
    title: 'Necesitas saber si es temporal o algo más',
    body: 'El efluvio postparto es temporal en la mayoría de casos. Pero a veces revela una alopecia subyacente. Un test capilar te saca de dudas.',
  },
  'La Inversión': {
    title: 'Tu trasplante necesita un plan de mantenimiento',
    body: 'El pelo trasplantado no se cae, pero el nativo sí. Un test capilar evalúa tu situación actual y protege tu inversión.',
  },
  'Ya Me Engañaron': {
    title: 'Entendemos que tengas dudas',
    body: 'Hospital Capilar es un centro médico, no estético. Médicos que diagnostican con datos y te dicen la verdad. Sin presión.',
  },
  'La Farmacia': {
    title: 'No es que los productos no sirvan — es que necesitas un test capilar',
    body: 'El 60% de personas no responden a minoxidil porque nunca les diagnosticaron correctamente. Un test capilar cambia todo.',
  },
  'No candidato': {
    title: 'Tu caso requiere atención especializada',
    body: 'Lo que describes parece un problema del cuero cabelludo que requiere atención dermatológica especializada.',
  },
  'Ciudad sin clinica': {
    title: 'Todavía no estamos en tu zona',
    body: 'Estamos abriendo nuevas clínicas en 2026. Te avisaremos en cuanto tengamos fecha para tu ciudad.',
  },
};

const ShortQuizLanding = ({ nicho = 'que-me-pasa' }) => {
  const config = NICHOS[nicho] || NICHOS['que-me-pasa'];
  const analytics = useAnalytics();
  const [utmParams] = useState(() => getUTMParams());

  // Phases: landing → quiz → analyzing → results
  const [phase, setPhase] = useState('landing');
  const [step, setStep] = useState(0); // 0=sexo, 1=situacion, 2=tiempo, 3=urgencia, 4=form
  const [answers, setAnswers] = useState({ sexo: '', situacion: '', tiempo: '', urgencia: '' });
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', provincia: '', consentPrivacidad: false, consentComunicaciones: false });
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const quizRef = useRef(null);

  const handleStartQuiz = () => {
    analytics.trackEvent('short_quiz_started', { nicho });
    window.scrollTo(0, 0);
    setPhase('quiz');
  };

  const handleSelect = (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
    // Auto-advance after selection
    setTimeout(() => setStep(s => s + 1), 300);
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
    else setPhase('landing');
  };

  const handleSubmit = async () => {
    if (!form.nombre || !form.email || !form.telefono || !form.provincia || !form.consentPrivacidad) return;
    if (submitting) return; // Prevent double-submit
    setSubmitting(true);
    setPhase('analyzing');

    const ecp = SITUACION_ECP[answers.situacion] || config.ecp;
    const nameParts = form.nombre.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const sourceChannel = utmParams.utm_source
      ? `${utmParams.utm_source}/${utmParams.utm_medium || 'unknown'}`
      : document.referrer ? 'organic/referral' : 'direct';

    // contact_score: DYNAMIC 0-100 based on quiz answers
    const clinicasOperativas = ['madrid', 'murcia', 'pontevedra'];
    const isOperativa = clinicasOperativas.includes(form.provincia);
    let contactScore = 40; // Base score

    // Urgency signal (strongest intent indicator)
    if (answers.urgencia === 'alta') contactScore += 25;
    else if (answers.urgencia === 'media') contactScore += 10;
    else if (answers.urgencia === 'baja') contactScore -= 15;

    // Time with problem (longer = more committed to solving)
    if (answers.tiempo === '3a+') contactScore += 20;
    else if (answers.tiempo === '1-3a') contactScore += 10;
    else if (answers.tiempo === '<3m') contactScore -= 10;

    // Location
    if (isOperativa) contactScore += 15;
    else if (form.provincia === 'otra' || !form.provincia) contactScore -= 20;
    else contactScore += 5; // próximas aperturas

    // ECP: surgical-adjacent profiles score higher
    const highIntentECPs = ['El Espejo', 'La Inversión', 'Ya Me Engañaron'];
    if (highIntentECPs.includes(ecp)) contactScore += 10;

    // Clamp to 0-100
    contactScore = Math.max(0, Math.min(100, contactScore));

    const ubicacionMap = {
      madrid: 'Madrid', murcia: 'Murcia', pontevedra: 'Pontevedra',
      acoruna: 'A Coruña', mostoles: 'Móstoles', albacete: 'Albacete',
      valladolid: 'Valladolid', burgos: 'Burgos', valencia: 'Valencia', otra: 'Otra ciudad',
    };

    const tiempoMap = { '<3m': 'menos de 3 meses', '3-12m': '3-12 meses', '1-3a': '1-3 años', '3a+': 'más de 3 años' };
    const urgenciaMap = { alta: 'alta (quiere actuar ya)', media: 'media (quiere entender opciones)', baja: 'baja (solo se informa)' };

    const agentMsg = `Lead quiz corto (${nicho}). Sexo: ${answers.sexo || 'N/A'}. ECP: ${ecp}. Tiempo con el problema: ${tiempoMap[answers.tiempo] || answers.tiempo}. Urgencia: ${urgenciaMap[answers.urgencia] || answers.urgencia}. Ciudad: ${ubicacionMap[form.provincia] || form.provincia}. Canal: ${sourceChannel}.`;

    // GHL Custom Field IDs
    const CF = {
      door:                    '2JYlfGk60lHbuyh9vcdV',
      sexo:                    'P7D2edjnOHwXLpglw9tB',
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

    const customFields = [
      { id: CF.door, field_value: 'quiz_corto' },
      { id: CF.sexo, field_value: answers.sexo || '' },
      { id: CF.ecp, field_value: ecp },
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
      { id: CF.funnel_type, field_value: 'quiz_corto' },
      { id: CF.traffic_source, field_value: classifyTrafficSource(utmParams) || 'direct' },
    ];
    if (utmParams.utm_source) customFields.push({ id: CF.utm_source, field_value: utmParams.utm_source });
    if (utmParams.utm_medium) customFields.push({ id: CF.utm_medium, field_value: utmParams.utm_medium });
    if (utmParams.utm_campaign) customFields.push({ id: CF.utm_campaign, field_value: utmParams.utm_campaign });
    if (utmParams.utm_content) customFields.push({ id: CF.utm_content, field_value: utmParams.utm_content });
    if (utmParams.utm_term) customFields.push({ id: CF.utm_term, field_value: utmParams.utm_term });
    // TODO: Add GHL custom field IDs for fbclid and gclid when created in GHL

    const payload = {
      locationId: import.meta.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf',
      firstName, lastName,
      email: form.email || '',
      phone: form.telefono,
      gender: answers.sexo === 'hombre' ? 'male' : answers.sexo === 'mujer' ? 'female' : '',
      city: ubicacionMap[form.provincia] || form.provincia || '',
      country: 'Spain',
      tags: ['new_lead'],
      source: utmParams.utm_source
        ? `Quiz Corto HC - ${utmParams.utm_source}/${utmParams.utm_medium || ''}`
        : `Quiz Corto Hospital Capilar - ${nicho}`,
      customFields,
      _agentMessage: agentMsg,
      _quizAnswers: JSON.stringify(answers),
      _contactScore: contactScore,
      _salesforceData: {
        door: 'quiz_corto',
        ecp,
        sexo: answers.sexo || '',
        tiempo: answers.tiempo || '',
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
      }, { timeoutMs: 20000, retries: 1, label: 'GHL-ShortQuiz' });
      const data = await response.json();
      ghlResult = { status: response.ok ? 'ok' : 'error', contactId: data.contactId || null };
    } catch (err) {
      ghlResult = { status: 'error', error: err.message };
    }

    try {
      await addDoc(collection(db, 'quiz_leads'), {
        nombre: form.nombre, email: form.email, telefono: form.telefono,
        ubicacion: form.provincia, sexo: answers.sexo, nicho, ecp,
        door: 'quiz_corto', score: contactScore,
        answersRaw: answers,
        agentMessage: agentMsg,
        source: {
          channel: sourceChannel,
          traffic_source: classifyTrafficSource(utmParams),
          funnel_type: 'quiz_corto',
          nicho,
          utm_source: utmParams.utm_source || null, utm_medium: utmParams.utm_medium || null,
          utm_campaign: utmParams.utm_campaign || null,
          fbclid: utmParams.fbclid || null, gclid: utmParams.gclid || null,
          referrer: document.referrer || 'direct',
          landing_url: window.location.href, door: 'quiz_corto',
        },
        ghl: ghlResult, status: 'new', createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Firestore save error:', err);
    }

    analytics.trackQuizCompleted(answers);
    analytics.trackFormSubmitted({ name: form.nombre, email: form.email, phone: form.telefono }, answers);
    analytics.trackEvent('short_quiz_completed', { nicho, ecp, contactScore, sexo: answers.sexo || null });
    analytics.trackEvent('lead_classified', { ecp, traffic_source: classifyTrafficSource(utmParams), funnel_type: 'quiz_corto', nicho, sexo: answers.sexo || null });

    // Fake analysis delay
    setTimeout(() => {
      setPhase('results');
      setSubmitting(false);
    }, 2500);
  };

  // ==========================================
  // ANALYZING SCREEN
  // ==========================================
  if (phase === 'analyzing') {
    return (
      <div className="min-h-screen bg-white font-sans flex items-center justify-center">
        <div className="text-center px-6">
          <Loader2 size={48} className="text-[#4CA994] animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Analizando tus respuestas...</h2>
          <p className="text-gray-500">Nuestro sistema está preparando tu pre-análisis.</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // RESULTS SCREEN
  // ==========================================
  if (phase === 'results') {
    const ecp = SITUACION_ECP[answers.situacion] || config.ecp;
    const ecpMsg = ECP_MESSAGES[ecp] || ECP_MESSAGES['¿Qué Me Pasa?'];
    const isDerivacion = ecp === 'No candidato';
    const WA_PHONE = '34623457218';
    const waText = encodeURIComponent(
      `Hola, soy ${form.nombre.split(' ')[0]}. Acabo de completar el test capilar rápido en Hospital Capilar. Me gustaría recibir más información.`
    );
    const waUrl = `https://wa.me/${WA_PHONE}?text=${waText}`;

    // Readable labels for what the user answered
    const situacionLabels = {
      'no-se-que-tengo': 'No sé qué me pasa',
      'caida-sin-diagnostico': answers.sexo === 'mujer' ? 'Pierdo densidad / se me cae mucho' : 'Caída sin diagnóstico',
      'entradas-coronilla': 'Entradas / coronilla',
      'joven-perdida': 'Pérdida temprana de pelo',
      'postparto': 'Caída desde embarazo/parto',
      'hormonal': 'Caída hormonal',
      'otc-frustrado': 'Productos sin resultado',
      'post-cirugia': 'Post-trasplante',
      'mala-experiencia': 'Mala experiencia previa',
      'cuero-cabelludo': 'Problema de cuero cabelludo',
    };
    const tiempoLabels = { '<3m': 'Menos de 3 meses', '3-12m': '3-12 meses', '1-3a': '1-3 años', '3a+': 'Más de 3 años' };
    const urgenciaLabels = { alta: 'Quiere actuar ya', media: 'Quiere entender opciones', baja: 'Solo se informa' };

    // Contextual recommendation based on urgency + time
    const getRecommendation = () => {
      if (isDerivacion) return null;
      if (answers.urgencia === 'alta' && (answers.tiempo === '1-3a' || answers.tiempo === '3a+')) {
        return 'Llevas tiempo con este problema y estás listo para actuar. Es el momento perfecto para un test capilar profesional que te dé respuestas concretas.';
      }
      if (answers.urgencia === 'alta') {
        return 'Tu disposición a actuar es clave. Un test capilar profesional ahora puede ahorrarte meses de tratamientos que no funcionan.';
      }
      if (answers.tiempo === '3a+') {
        return 'Llevas más de 3 años con este problema. Cuanto más tiempo pasa, menos opciones hay. Un test capilar a tiempo marca la diferencia.';
      }
      if (answers.tiempo === '1-3a') {
        return 'Con 1-3 años de evolución, estás a tiempo de frenar la progresión. Un test capilar profesional es el primer paso.';
      }
      return 'Un test capilar profesional es el mejor primer paso. Te permite entender exactamente qué ocurre y qué opciones tienes.';
    };

    return (
      <div className="min-h-screen bg-[#F7F8FA] font-sans">
        {/* Top banner */}
        <div className="bg-[#4CA994] text-white text-center py-3 px-4 text-sm font-semibold sticky top-0 z-10">
          Tu pre-análisis personalizado está listo
        </div>

        <div className="max-w-lg mx-auto px-4 pb-40">
          {/* Header */}
          <div className="text-center py-6">
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-7 mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">
              {form.nombre.split(' ')[0]}, aquí tienes tu resultado
            </h2>
            <p className="text-gray-500 text-sm">Basado en tus respuestas, este es nuestro análisis.</p>
          </div>

          {/* Summary of answers */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 grid grid-cols-3 gap-3 text-center shadow-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Situación</p>
              <p className="text-gray-900 text-xs font-semibold">{situacionLabels[answers.situacion] || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Tiempo</p>
              <p className="text-gray-900 text-xs font-semibold">{tiempoLabels[answers.tiempo] || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Urgencia</p>
              <p className="text-gray-900 text-xs font-semibold">{urgenciaLabels[answers.urgencia] || '—'}</p>
            </div>
          </div>

          {/* Profile card */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6 shadow-sm">
            <div className="px-5 py-3 flex items-center gap-2.5 border-b border-gray-100">
              <div className="w-8 h-8 bg-[#F0F7F6] rounded-full flex items-center justify-center">
                <Stethoscope size={16} className="text-[#4CA994]" />
              </div>
              <div>
                <h3 className="text-gray-900 font-bold text-sm">Tu Perfil Capilar</h3>
                <p className="text-gray-400 text-xs">{situacionLabels[answers.situacion] || 'Pre-análisis'}</p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <h4 className="font-bold text-gray-900">{ecpMsg.title}</h4>
              <p className="text-gray-600 text-sm leading-relaxed">{ecpMsg.body}</p>
              {getRecommendation() && (
                <div className="bg-[#F0F7F6] border border-[#4CA994]/20 rounded-xl p-3 mt-2">
                  <p className="text-[#2C3E50] text-sm font-medium leading-relaxed">{getRecommendation()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Objections */}
          {(() => {
            const objections = OBJECTIONS_BY_ECP[ecp] || [];
            if (objections.length === 0) return null;
            return (
              <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  ¿Te sientes así? <span className="text-[#4CA994]">Tenemos la respuesta.</span>
                </h3>
                <div className="space-y-4 mt-4">
                  {objections.map((obj, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="w-6 h-6 bg-red-50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <X size={14} className="text-red-400" />
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm line-through">"{obj.myth}"</p>
                        <p className="text-gray-800 text-sm font-medium mt-0.5">{obj.truth}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* What's included */}
          {!isDerivacion && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Lo que haremos por ti</h3>
              <div className="space-y-2">
                {(INCLUDED_BY_CTA['solicitar_llamada']).map((text, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
                    <div className="w-8 h-8 bg-[#F0F7F6] rounded-lg flex items-center justify-center shrink-0">
                      <Check size={18} className="text-[#4CA994]" />
                    </div>
                    <span className="text-gray-800 text-sm font-medium">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA info card */}
          {!isDerivacion ? (
            <div className="bg-white rounded-2xl border-2 border-[#4CA994] p-5 mb-6 shadow-sm relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#4CA994] text-white text-xs font-bold px-4 py-1 rounded-full">
                SIGUIENTE PASO
              </div>
              <div className="pt-2">
                <h4 className="font-bold text-lg text-gray-900 mb-1">Te contactamos en menos de 24h</h4>
                <p className="text-sm text-gray-600">Un asesor médico revisará tu caso y te llamará para orientarte. Sin compromiso.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border-2 border-amber-300 p-5 mb-6 shadow-sm">
              <h4 className="font-bold text-lg text-amber-900 mb-1">Tu caso requiere atención especializada</h4>
              <p className="text-sm text-amber-800">Los problemas de cuero cabelludo requieren atención dermatológica especializada.</p>
            </div>
          )}

          {/* Testimonials */}
          {(() => {
            const testimonials = TESTIMONIALS_BY_ECP[ecp] || [];
            if (testimonials.length === 0) return null;
            return (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">Historias reales</h3>
                <div className="space-y-3">
                  {testimonials.map((t, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-sm text-gray-900">{t.name}</span>
                        <span className="text-gray-400 text-xs">{t.age} años</span>
                        <div className="flex gap-0.5 ml-auto">
                          {Array.from({ length: t.stars }).map((_, j) => (
                            <Star key={j} size={14} className="text-yellow-400 fill-yellow-400" />
                          ))}
                        </div>
                      </div>
                      <p className="text-gray-600 text-sm italic leading-relaxed">"{t.text}"</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* FAQ */}
          {(() => {
            const faqs = FAQS_BY_CTA['solicitar_llamada'] || [];
            return (
              <div className="mb-8">
                <h3 className="text-base font-bold text-gray-900 text-center mb-4">Preguntas frecuentes</h3>
                <div className="space-y-2">
                  {faqs.map((faq, i) => (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <button
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 text-left"
                      >
                        <span className="text-sm font-medium text-gray-800 pr-4">{faq.q}</span>
                        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                      </button>
                      {openFaq === i && (
                        <div className="px-4 pb-4">
                          <p className="text-sm text-gray-600 leading-relaxed">{faq.a}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Trust badges */}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-2"><ShieldCheck size={16} /><span>100% confidencial</span></div>
              <div className="flex items-center gap-2"><Stethoscope size={16} /><span>Centro médico</span></div>
            </div>
          </div>
        </div>

        {/* Sticky CTA — fixed at bottom */}
        {!isDerivacion ? (
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-3 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="max-w-lg mx-auto">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => analytics.trackEvent('short_quiz_whatsapp_clicked', { nicho, ecp })}
                className="w-full py-4 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-colors"
              >
                <WhatsAppIcon size={20} className="text-white" /> Escríbenos por WhatsApp
              </a>
              <a
                href="tel:+34623457218"
                className="w-full text-center text-sm text-gray-500 mt-2 py-1 hover:text-[#4CA994] transition-colors flex items-center justify-center gap-1"
              >
                <Phone size={14} /> Llamar al 623 457 218
              </a>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ==========================================
  // QUIZ PHASE (4 steps)
  // ==========================================
  if (phase === 'quiz') {
    const totalSteps = 5;
    const progress = ((step + 1) / totalSteps) * 100;

    return (
      <div className="min-h-screen bg-white font-sans flex flex-col">
        {/* Progress bar */}
        <div className="h-1.5 w-full bg-gray-100 fixed top-0 z-40">
          <div className="h-full transition-all duration-500 ease-out bg-[#4CA994]" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex-1 max-w-2xl mx-auto w-full px-5 pt-8 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 p-1.5 -ml-1.5 rounded-full hover:bg-gray-50">
              <ArrowLeft size={20} />
            </button>
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-6" />
            <div className="w-8" />
          </div>

          {/* Step 0: Sexo */}
          {step === 0 && (
            <>
              <div className="mb-5">
                <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">Paso 1 de {totalSteps}</span>
                <h2 className="text-xl font-bold text-gray-900 mb-1 leading-tight">¿Cuál es tu sexo biológico?</h2>
                <p className="text-gray-500 text-sm">La caída capilar tiene causas hormonales distintas en hombres y mujeres. Necesitamos saberlo para un test capilar preciso.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Hombre', value: 'hombre', icon: '👨' },
                  { label: 'Mujer', value: 'mujer', icon: '👩' },
                ].map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect('sexo', opt.value)}
                    className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${
                      answers.sexo === opt.value ? 'border-[#4CA994] bg-[#F0F7F6]' : 'border-gray-100 hover:border-[#4CA994]/50'
                    }`}
                  >
                    <span className="text-3xl">{opt.icon}</span>
                    <span className={`font-semibold text-[15px] ${answers.sexo === opt.value ? 'text-[#2C3E50]' : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 1: Situación */}
          {step === 1 && (
            <>
              <div className="mb-5">
                <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">Paso 2 de {totalSteps}</span>
                <h2 className="text-xl font-bold text-gray-900 mb-1 leading-tight">¿Qué describe mejor tu situación?</h2>
              </div>
              <div className="grid gap-2">
                {(answers.sexo === 'mujer' ? [
                  { label: 'Se me cae y no sé por qué', value: 'no-se-que-tengo' },
                  { label: 'Pierdo densidad / caída hormonal (menopausia, SOP, tiroides)', value: 'hormonal' },
                  { label: 'Pierdo pelo desde el embarazo/parto', value: 'postparto' },
                  { label: 'Llevo años con productos y nada funciona', value: 'otc-frustrado' },
                  { label: 'Tuve mala experiencia en otra clínica', value: 'mala-experiencia' },
                  { label: 'Ya me operé pero sigo perdiendo', value: 'post-cirugia' },
                  { label: 'Problemas en el cuero cabelludo', value: 'cuero-cabelludo' },
                ] : [
                  { label: 'Se me cae y no sé por qué', value: 'no-se-que-tengo' },
                  { label: 'Noto las entradas / la coronilla', value: 'entradas-coronilla' },
                  { label: 'Soy joven y ya estoy perdiendo pelo', value: 'joven-perdida' },
                  { label: 'Llevo años con productos y nada funciona', value: 'otc-frustrado' },
                  { label: 'Ya me operé pero sigo perdiendo', value: 'post-cirugia' },
                  { label: 'Tuve mala experiencia en otra clínica', value: 'mala-experiencia' },
                  { label: 'Problemas en el cuero cabelludo', value: 'cuero-cabelludo' },
                ]).map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect('situacion', opt.value)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                      answers.situacion === opt.value ? 'border-[#4CA994] bg-[#F0F7F6]' : 'border-gray-100 hover:border-[#4CA994]/50'
                    }`}
                  >
                    <span className={`flex-1 font-semibold text-[15px] ${answers.situacion === opt.value ? 'text-[#2C3E50]' : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      answers.situacion === opt.value ? 'border-[#4CA994] bg-[#4CA994]' : 'border-gray-300'
                    }`}>
                      {answers.situacion === opt.value && <CheckCircle2 size={13} className="text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2: Tiempo */}
          {step === 2 && (
            <>
              <div className="mb-5">
                <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">Paso 3 de {totalSteps}</span>
                <h2 className="text-xl font-bold text-gray-900 mb-1 leading-tight">¿Hace cuánto notas este problema?</h2>
              </div>
              <div className="grid gap-2">
                {[
                  { label: 'Menos de 3 meses', value: '<3m' },
                  { label: '3 - 12 meses', value: '3-12m' },
                  { label: '1 - 3 años', value: '1-3a' },
                  { label: 'Más de 3 años', value: '3a+' },
                ].map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect('tiempo', opt.value)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                      answers.tiempo === opt.value ? 'border-[#4CA994] bg-[#F0F7F6]' : 'border-gray-100 hover:border-[#4CA994]/50'
                    }`}
                  >
                    <span className={`flex-1 font-semibold text-[15px] ${answers.tiempo === opt.value ? 'text-[#2C3E50]' : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      answers.tiempo === opt.value ? 'border-[#4CA994] bg-[#4CA994]' : 'border-gray-300'
                    }`}>
                      {answers.tiempo === opt.value && <CheckCircle2 size={13} className="text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 3: Urgencia */}
          {step === 3 && (
            <>
              <div className="mb-5">
                <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">Paso 4 de {totalSteps}</span>
                <h2 className="text-xl font-bold text-gray-900 mb-1 leading-tight">¿Cómo de urgente es para ti resolver esto?</h2>
              </div>
              <div className="grid gap-2">
                {[
                  { label: 'Quiero solución ya, estoy listo/a para actuar', value: 'alta' },
                  { label: 'Me preocupa pero quiero entender mis opciones', value: 'media' },
                  { label: 'Solo quiero informarme por ahora', value: 'baja' },
                ].map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect('urgencia', opt.value)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${
                      answers.urgencia === opt.value ? 'border-[#4CA994] bg-[#F0F7F6]' : 'border-gray-100 hover:border-[#4CA994]/50'
                    }`}
                  >
                    <span className={`flex-1 font-semibold text-[15px] ${answers.urgencia === opt.value ? 'text-[#2C3E50]' : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      answers.urgencia === opt.value ? 'border-[#4CA994] bg-[#4CA994]' : 'border-gray-300'
                    }`}>
                      {answers.urgencia === opt.value && <CheckCircle2 size={13} className="text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 4: Form */}
          {step === 4 && (
            <div>
              <div className="mb-5">
                <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">Paso 5 de {totalSteps}</span>
                <h2 className="text-xl font-bold text-gray-900 mb-1 leading-tight">¡Ya casi está!</h2>
                <p className="text-gray-500 text-sm">Para preparar tu pre-análisis, necesitamos tus datos:</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre completo <span className="text-red-500">*</span></label>
                  <input type="text" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#4CA994] outline-none text-sm" placeholder="Ej: Carlos García" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#4CA994] outline-none text-sm" placeholder="correo@ejemplo.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Teléfono <span className="text-red-500">*</span></label>
                  <PhoneInput
                    value={form.telefono}
                    onChange={(phone) => setForm({ ...form, telefono: phone })}
                    required
                    inputClassName="p-3 focus:border-[#4CA994]"
                    placeholder="612 345 678"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">¿Cerca de qué clínica te queda mejor? <span className="text-red-500">*</span></label>
                  <UbicacionSelect
                    value={form.provincia}
                    onChange={e => setForm({ ...form, provincia: e.target.value })}
                    className="w-full p-3 border-2 border-gray-200 rounded-xl bg-white focus:border-[#4CA994] outline-none text-sm font-medium"
                  />
                </div>
                <div className="space-y-2 mt-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.consentPrivacidad} onChange={e => setForm({ ...form, consentPrivacidad: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#4CA994] focus:ring-[#4CA994]" />
                    <span className="text-xs text-gray-500">Acepto la <a href="https://hospitalcapilar.com/politica-de-privacidad" target="_blank" rel="noopener noreferrer" className="underline text-[#4CA994]">política de privacidad</a> <span className="text-red-500">*</span></span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.consentComunicaciones} onChange={e => setForm({ ...form, consentComunicaciones: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#4CA994] focus:ring-[#4CA994]" />
                    <span className="text-xs text-gray-500">Acepto recibir comunicaciones sobre tratamientos capilares</span>
                  </label>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={!form.nombre || !form.email || !form.telefono || !form.provincia || !form.consentPrivacidad || submitting}
                  className="w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all bg-[#4CA994] hover:-translate-y-0.5"
                >
                  {submitting ? <Loader2 size={20} className="animate-spin" /> : <>Ver mi pre-análisis <ArrowRight size={18} /></>}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 text-center border-t border-gray-100 bg-gray-50 flex justify-center gap-6">
          <p className="text-xs text-gray-400 font-medium flex items-center gap-1"><ShieldCheck size={14} /> 100% Confidencial</p>
          <p className="text-xs text-gray-400 font-medium flex items-center gap-1"><Clock size={14} /> 1 minuto</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // LANDING PHASE
  // ==========================================
  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">
      <TopBar />

      {/* Hero */}
      <div className="relative bg-[#2C3E50] text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo-hc-white.png" alt="Hospital Capilar" className="h-10" />
          </div>
          <p className="text-[#4CA994] text-sm font-bold tracking-widest uppercase mb-4">{config.badge}</p>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4 max-w-3xl">{config.headline}</h1>
          <p className="text-lg text-gray-300 max-w-2xl mb-10">{config.subheadline}</p>

          <button
            onClick={handleStartQuiz}
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-bold text-lg shadow-xl hover:-translate-y-1 hover:shadow-2xl transition-all bg-[#4CA994]"
          >
            Test capilar rápido (1 min)
            <ArrowRight size={22} />
          </button>
          <p className="text-sm text-gray-400 mt-4">5 preguntas | 100% confidencial | Sin compromiso</p>
        </div>
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
            El primer paso es saber dónde estás
          </h2>
          <p className="text-lg text-gray-300 mb-8">
            Responde 4 preguntas y recibe un pre-análisis personalizado en 1 minuto.
          </p>
          <button
            onClick={handleStartQuiz}
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-bold text-lg shadow-xl hover:-translate-y-1 hover:shadow-2xl transition-all bg-[#4CA994]"
          >
            Test capilar rápido (1 min)
            <ArrowRight size={22} />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ShortQuizLanding;

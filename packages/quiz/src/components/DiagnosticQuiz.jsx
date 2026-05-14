import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle2, Loader2, ShieldCheck, Stethoscope, Clock, Sparkles, AlertCircle } from 'lucide-react';

const WhatsAppIcon = ({ size = 18, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);
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

// ============================================
// QUIZ QUESTIONS — MUJER (5 preguntas, scoring CRT/HRT)
// ============================================
// Clinical framework (per dirección médica 2026-05-07):
//   CRT (PRP) → efluvios telógenos, cuadros transitorios/inflamatorios, soporte biológico
//   HRT (dutasterida intradérmica) → perfiles con sospecha androgenética real
//   Hair Pro → booster del cuero cabelludo, combinable con CRT o HRT
//
// P4 (tratamientos previos) does NOT score — only contextual data for asesor.
// Flags trigger medical review: P1=difuso/parches, P2=menopausia/hormonal-dx
const MUJER_QUESTIONS = [
  {
    id: 'tiempo',
    title: '¿Hace cuánto pierdes pelo?',
    options: [
      { value: '<3m', label: 'Menos de 3 meses', score: { crt: 2 } },
      { value: '3-12m', label: '3 - 12 meses', score: { crt: 1 } },
      { value: '1-3a', label: '1 - 3 años', score: { hrt: 2 } },
      { value: '>3a', label: 'Más de 3 años', score: { hrt: 3 } },
    ],
  },
  {
    id: 'patron',
    title: '¿Dónde notas más la pérdida de pelo?',
    options: [
      { value: 'raya-central', label: 'Raya central / parte superior se ensancha', score: { hrt: 3 } },
      { value: 'sienes-frontal', label: 'Sienes y línea frontal', score: { crt: 3 } },
      { value: 'difuso', label: 'Por toda la cabeza, difuso', score: { hrt: 3 }, flag: true },
      { value: 'parches', label: 'En zonas localizadas (parches)', score: { hrt: 2 }, flag: true },
      { value: 'no-claro', label: 'No lo tengo claro', score: {} },
    ],
  },
  {
    id: 'origen',
    title: '¿Identificas alguna causa? ¿Por qué crees que se te cae?',
    options: [
      { value: 'embarazo-postparto', label: 'Embarazo o postparto (último año o dos)', score: { crt: 3 } },
      { value: 'menopausia', label: 'Menopausia o perimenopausia', score: { hrt: 3 }, flag: true },
      { value: 'hormonal-dx', label: 'Problema hormonal diagnosticado (tiroides, SOP, andrógenos)', score: { hrt: 3 }, flag: true },
      { value: 'estres-dieta', label: 'Estrés intenso, dieta o enfermedad reciente', score: { crt: 3 } },
      { value: 'familiares', label: 'Antecedentes familiares de calvicie / pérdida de pelo', score: { hrt: 3 } },
      { value: 'no-causa', label: 'No identifico ninguna causa clara', score: {} },
    ],
  },
  {
    // Contextual only — no scoring (per dirección médica feedback 2026-05-07).
    // Question stays as commercial/clinical context for the asesor.
    id: 'tratamientos',
    title: '¿Has probado algo para tu pelo?',
    options: [
      { value: 'minoxidil-fina', label: 'Minoxidil o finasterida sin resultado' },
      { value: 'prp-otra', label: 'PRP o mesoterapia en otra clínica' },
      { value: 'productos-casa', label: 'Champús, vitaminas o productos en casa, sin éxito' },
      { value: 'hormonal-tx', label: 'Tratamiento hormonal (anticonceptivos, tiroides)' },
      { value: 'nada', label: 'Nada todavía' },
    ],
  },
  {
    id: 'objetivo',
    title: '¿Qué buscas conseguir?',
    options: [
      { value: 'frenar', label: 'Frenar la caída cuanto antes' },
      { value: 'densidad', label: 'Recuperar densidad' },
      { value: 'entender', label: 'Entender qué me pasa antes de decidir nada' },
    ],
  },
];

// ============================================
// QUIZ QUESTIONS — HOMBRE (3 preguntas, sin scoring)
// ============================================
const HOMBRE_QUESTIONS = [
  {
    id: 'tiempo',
    title: '¿Hace cuánto pierdes pelo?',
    options: [
      { value: '<3m', label: 'Menos de 3 meses' },
      { value: '3-12m', label: '3 - 12 meses' },
      { value: '1-3a', label: '1 - 3 años' },
      { value: '>3a', label: 'Más de 3 años' },
    ],
  },
  {
    id: 'patron',
    title: '¿Cómo describes tu pérdida?',
    options: [
      { value: 'norwood-1-2', label: 'Entradas leves' },
      { value: 'norwood-3', label: 'Entradas marcadas' },
      { value: 'norwood-4-5', label: 'Coronilla afectada' },
      { value: 'norwood-6-7', label: 'Avanzado' },
    ],
  },
  {
    id: 'tratamientos',
    title: '¿Has probado algo antes?',
    options: [
      { value: 'minoxidil', label: 'Minoxidil' },
      { value: 'finasterida', label: 'Finasterida' },
      { value: 'prp-otra', label: 'PRP / mesoterapia en otra clínica' },
      { value: 'trasplante', label: 'Trasplante previo' },
      { value: 'productos-casa', label: 'Productos en casa' },
      { value: 'nada', label: 'Nada todavía' },
    ],
  },
];

// ============================================
// SCORING LOGIC — MUJER → CRT vs HRT
// ============================================
function calculateProtocol(answers) {
  let crt = 0, hrt = 0;
  let flag = false;

  for (const q of MUJER_QUESTIONS) {
    const ans = answers[q.id];
    if (!ans) continue;
    const opt = q.options.find(o => o.value === ans);
    if (!opt) continue;
    if (opt.score?.crt) crt += opt.score.crt;
    if (opt.score?.hrt) hrt += opt.score.hrt;
    if (opt.flag) flag = true;
  }

  // Decision: diff ≥ 2 → winner; otherwise HRT default (entry-level)
  const protocol = Math.abs(crt - hrt) < 2 || hrt > crt ? 'HRT' : 'CRT';
  return { protocol, flag, scores: { crt, hrt } };
}

// ============================================
// RESULT CONTENT
// ============================================
const PROTOCOL_CONTENT = {
  CRT: {
    name: 'Protocolo CRT',
    subtitle: 'Capillary Regeneration Treatment',
    description: 'Plasma Rico en Plaquetas adaptado a tu caso',
    bullets: [
      { label: 'Qué hace', text: 'Aporta soporte biológico con factores de crecimiento de tu propio plasma para acompañar la recuperación capilar.' },
      { label: 'Indicado para ti porque', text: 'Tu pérdida sugiere un cuadro transitorio o reactivo: efluvio telogénico, postparto, estrés o cambios recientes.' },
      { label: 'Resultado esperado', text: 'Mejora visible a partir de 3-4 sesiones, mientras el folículo retoma su ciclo normal.' },
    ],
  },
  HRT: {
    name: 'Protocolo HRT',
    subtitle: 'Hair Redensification Treatment',
    description: 'Dutasterida intradérmica personalizada',
    bullets: [
      { label: 'Qué hace', text: 'Redensifica el pelo aplicando dutasterida directamente en el folículo, frenando la miniaturización androgenética.' },
      { label: 'Indicado para ti porque', text: 'Tu perfil sugiere componente androgenético: patrón Ludwig, antecedentes familiares o evolución prolongada.' },
      { label: 'Resultado esperado', text: 'Redensificación progresiva sin cirugía.' },
    ],
  },
};

// ============================================
// COMPONENT
// ============================================
const DiagnosticQuiz = ({ nicho = 'quiz-hospitalcapilar' }) => {
  const config = NICHOS[nicho] || NICHOS['quiz-hospitalcapilar'];
  const analytics = useAnalytics();
  const [utmParams] = useState(() => getUTMParams());

  // URL params (prefill from Meta form via /router)
  const [prefill, setPrefill] = useState({});

  // Phases
  const [phase, setPhase] = useState('landing'); // landing | sex-select | quiz | contact-form | analyzing | results
  const [sexo, setSexo] = useState(null); // 'mujer' | 'hombre'
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Contact data — re-collected at the end of the quiz because Meta does NOT
  // pass form data to the redirect URL. We match this back to the GHL contact
  // by email/phone in quiz-ghl-match.
  const [pendingAnswers, setPendingAnswers] = useState(null);
  const [contactForm, setContactForm] = useState({ nombre: '', email: '', telefono: '' });
  const [contactId, setContactId] = useState(null);
  const [contactError, setContactError] = useState('');

  // Read URL params on mount
  // Note: we always show the landing first, even for Meta leads. This lets us
  // iterate on the hero/landing copy independently of routing logic. The `v=`
  // param is still used to pre-select sex so the quiz skips the sex-select step.
  //
  // Defensive: in Meta's "Vista previa" mode the macros come through unsubstituted
  // as literal strings like "{{form.full_name}}". Strip those so we don't show
  // template syntax to users.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    const clean = (value) => {
      if (!value) return '';
      if (value.startsWith('{{') || value.includes('{{form.') || value.includes('{{lead_id') || value.includes('{{ad.')) return '';
      return value;
    };

    const v = clean(params.get('v')); // mujer | hombre — preselects sex but doesn't skip landing

    setPrefill({
      leadId: clean(params.get('leadId')),
      nombre: clean(params.get('nombre')),
      email: clean(params.get('email')),
      telefono: clean(params.get('telefono')),
      ciudad: clean(params.get('ciudad')),
      caida: clean(params.get('caida')),
    });

    if (v === 'mujer' || v === 'hombre') {
      setSexo(v);
      analytics.trackEvent('diagnostic_quiz_prefilled_sex', { sexo: v });
    }
  }, []);

  const questions = sexo === 'mujer' ? MUJER_QUESTIONS : HOMBRE_QUESTIONS;
  const totalSteps = questions.length;
  const progress = sexo ? ((step + 1) / totalSteps) * 100 : 0;

  const handleStartQuiz = () => {
    analytics.trackEvent('diagnostic_quiz_started', { nicho, sexo });
    window.scrollTo(0, 0);
    if (sexo) {
      setPhase('quiz');
    } else {
      setPhase('sex-select');
    }
  };

  const handleSexSelect = (s) => {
    setSexo(s);
    analytics.trackEvent('diagnostic_quiz_sex_selected', { sexo: s });
    window.scrollTo(0, 0);
    setPhase('quiz');
  };

  const handleSelect = (qid, value) => {
    setAnswers(prev => ({ ...prev, [qid]: value }));
    setTimeout(() => {
      if (step < totalSteps - 1) {
        setStep(s => s + 1);
      } else {
        // Last question answered → collect contact data before showing result.
        setPendingAnswers({ ...answers, [qid]: value });
        // Prefill from URL params if present (organic / future flows).
        setContactForm({
          nombre: prefill.nombre || '',
          email: prefill.email || '',
          telefono: prefill.telefono || '',
        });
        analytics.trackEvent('diagnostic_quiz_questions_done', { nicho, sexo });
        window.scrollTo(0, 0);
        setPhase('contact-form');
      }
    }, 300);
  };

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1);
    else setPhase('landing');
  };

  const handleContactSubmit = () => {
    const { nombre, email, telefono } = contactForm;
    if (!nombre.trim() || !email.trim() || !telefono.trim()) {
      setContactError('Por favor completa todos los campos.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setContactError('El email no parece válido.');
      return;
    }
    setContactError('');
    finalize(pendingAnswers, contactForm);
  };

  const finalize = async (finalAnswers, contactData) => {
    setSubmitting(true);
    window.scrollTo(0, 0);
    setPhase('analyzing');

    let resultData;
    if (sexo === 'mujer') {
      resultData = calculateProtocol(finalAnswers);
    } else {
      resultData = { recommendation: 'presencial' };
    }
    setResult(resultData);

    const protocolo = sexo === 'mujer' ? resultData.protocol : 'presencial';

    // Match/create the GHL contact by email/phone. Meta created the contact at
    // form-submit time but didn't pass its data to us — so we re-match here.
    let ghlContactId = null;
    try {
      const res = await safeFetch('/.netlify/functions/quiz-ghl-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: contactData.nombre,
          email: contactData.email,
          telefono: contactData.telefono,
          sexo,
          protocolo,
          quizAnswers: finalAnswers,
          utm_source: utmParams.utm_source || '',
          utm_medium: utmParams.utm_medium || '',
          utm_campaign: utmParams.utm_campaign || '',
          utm_content: utmParams.utm_content || '',
          utm_term: utmParams.utm_term || '',
        }),
      }, { timeoutMs: 15000, retries: 1, label: 'quiz-ghl-match' });
      const data = await res.json();
      ghlContactId = data.contactId || null;
      analytics.trackEvent('diagnostic_quiz_ghl_matched', { matched: !!data.matched, hasContactId: !!ghlContactId });
    } catch (err) {
      console.error('GHL match error:', err);
    }
    setContactId(ghlContactId);

    // Save to Firestore for analytics.
    try {
      await addDoc(collection(db, 'quiz_leads'), {
        nombre: contactData.nombre,
        email: contactData.email,
        telefono: contactData.telefono,
        ubicacion: prefill.ciudad || '',
        sexo,
        nicho,
        ghl_contact_id: ghlContactId,
        door: 'quiz_videocall',
        funnel_type: 'diagnostic_quiz_v2',
        answersRaw: finalAnswers,
        result: resultData,
        source: {
          channel: utmParams.utm_source ? `${utmParams.utm_source}/${utmParams.utm_medium || 'unknown'}` : 'direct',
          traffic_source: classifyTrafficSource(utmParams),
          funnel_type: 'diagnostic_quiz_v2',
          utm_source: utmParams.utm_source || null,
          utm_medium: utmParams.utm_medium || null,
          utm_campaign: utmParams.utm_campaign || null,
          utm_content: utmParams.utm_content || null,
          utm_term: utmParams.utm_term || null,
          fbclid: utmParams.fbclid || null,
          gclid: utmParams.gclid || null,
          referrer: typeof document !== 'undefined' ? document.referrer || 'direct' : 'direct',
          landing_url: typeof window !== 'undefined' ? window.location.href : '',
        },
        status: 'new',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Firestore save error:', err);
    }

    analytics.trackEvent('diagnostic_quiz_completed', { nicho, sexo, result: resultData });

    // Fake analysis delay
    setTimeout(() => {
      setPhase('results');
      setSubmitting(false);
    }, 2200);
  };

  // ==========================================
  // CONTACT FORM — re-collect contact data before showing the result.
  // Meta doesn't pass form data to the redirect URL, so we ask again here
  // and match back to the GHL contact by email/phone.
  // ==========================================
  if (phase === 'contact-form') {
    return (
      <div className="min-h-screen bg-white font-sans flex flex-col">
        <TopBar />
        <div className="max-w-lg w-full mx-auto px-6 pt-8 pb-12 flex-1">
          <div className="flex items-center justify-center mb-6">
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-6" />
          </div>

          <div className="mb-6">
            <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">Último paso</span>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2 leading-tight">¿A dónde te enviamos tu pre-diagnóstico?</h2>
            <p className="text-gray-500 text-sm">Déjanos tus datos para enviarte tu resultado y que una asesora pueda contactarte para tu videollamada gratuita.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre completo <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={contactForm.nombre}
                onChange={e => setContactForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#4CA994] outline-none text-sm"
                placeholder="Ej: María García"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={contactForm.email}
                onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#4CA994] outline-none text-sm"
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Teléfono <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={contactForm.telefono}
                onChange={e => setContactForm(f => ({ ...f, telefono: e.target.value }))}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#4CA994] outline-none text-sm"
                placeholder="612 345 678"
              />
            </div>

            {contactError && (
              <p className="text-sm text-red-500 font-medium">{contactError}</p>
            )}

            <button
              onClick={handleContactSubmit}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg mt-4 flex items-center justify-center gap-2 disabled:opacity-50 transition-all bg-[#4CA994] hover:-translate-y-0.5"
            >
              {submitting ? <Loader2 size={20} className="animate-spin" /> : <>Ver mi pre-diagnóstico <ArrowRight size={18} /></>}
            </button>

            <p className="text-xs text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
              <ShieldCheck size={13} /> 100% confidencial · Sin compromiso
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // ANALYZING SCREEN
  // ==========================================
  if (phase === 'analyzing') {
    return (
      <div className="min-h-screen bg-white font-sans flex items-center justify-center">
        <div className="text-center px-6">
          <Loader2 size={48} className="text-[#4CA994] animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Preparando tu pre-diagnóstico...</h2>
          <p className="text-gray-500">Estamos analizando tus respuestas.</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // RESULTS — MUJER (CRT or HRT)
  // ==========================================
  if (phase === 'results' && sexo === 'mujer' && result) {
    const protocol = result.protocol;
    const content = PROTOCOL_CONTENT[protocol];
    // Contact data comes from the contact-form step the user just filled.
    const fullName = (contactForm.nombre || '').trim();
    const firstName = fullName.split(' ')[0];
    const lastName = fullName.split(' ').slice(1).join(' ');
    // GHL Calendar widget — "Calendario HC Videollamadas" (kZbXjtt6kmjj1phXdoqP).
    // Pass contactId so the booking links to the matched GHL contact, plus
    // prefill params (both snake_case and camelCase — widget version varies).
    const calendarParams = new URLSearchParams();
    if (contactId) calendarParams.set('contact_id', contactId);
    if (firstName) {
      calendarParams.set('first_name', firstName);
      calendarParams.set('firstName', firstName);
    }
    if (lastName) {
      calendarParams.set('last_name', lastName);
      calendarParams.set('lastName', lastName);
    }
    if (fullName) calendarParams.set('name', fullName);
    if (contactForm.email) calendarParams.set('email', contactForm.email);
    if (contactForm.telefono) calendarParams.set('phone', contactForm.telefono);
    const calendarUrl = `https://api.leadconnectorhq.com/widget/booking/kZbXjtt6kmjj1phXdoqP${calendarParams.toString() ? '?' + calendarParams.toString() : ''}`;

    // Secondary CTA — WhatsApp directo (para quien prefiere no agendar online)
    const WA_PHONE = '34623457218';
    const waText = encodeURIComponent(
      `Hola, soy ${firstName || 'una paciente'}. Acabo de completar el diagnóstico online en Hospital Capilar. Mi pre-recomendación es Protocolo ${protocol}. Quiero hablar con una asesora.`
    );
    const waUrl = `https://wa.me/${WA_PHONE}?text=${waText}`;

    return (
      <div className="min-h-screen bg-[#F7F8FA] font-sans">
        <div className="bg-[#4CA994] text-white text-center py-3 px-4 text-sm font-semibold sticky top-0 z-10">
          Tu pre-diagnóstico personalizado está listo
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 pb-32">
          <div className="text-center mb-6">
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-7 mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">
              {firstName ? `${firstName}, aquí tienes tu resultado` : 'Aquí tienes tu resultado'}
            </h2>
            <p className="text-gray-500 text-sm">Pre-recomendación basada en tus respuestas</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5 shadow-sm">
            <div className="bg-[#F0F7F6] px-5 py-4 border-b border-[#4CA994]/10 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#4CA994] rounded-full flex items-center justify-center shrink-0">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#4CA994] font-bold">Pre-recomendación</p>
                <h3 className="text-lg font-extrabold text-gray-900 leading-tight">{content.name}</h3>
                <p className="text-xs text-gray-500">{content.subtitle}</p>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 italic mb-4">{content.description}</p>
              <div className="space-y-3">
                {content.bullets.map((b, i) => (
                  <div key={i} className="flex gap-3">
                    <CheckCircle2 size={20} className="text-[#4CA994] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{b.label}</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{b.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {result.flag && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex gap-3">
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900 leading-relaxed">
                Tu caso necesita atención especializada. La asesora médica te indicará el siguiente paso.
              </p>
            </div>
          )}

          <div className="bg-[#F0F7F6] border border-[#4CA994]/20 rounded-xl p-4 mb-5">
            <div className="flex gap-3">
              <Sparkles size={20} className="text-[#4CA994] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">Combinable con Hair Pro</p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Booster del cuero cabelludo (como vitaminas) que potencia los resultados de cualquier protocolo. La asesora te explica si te conviene combinarlo con tu {protocol}.
                </p>
              </div>
            </div>
          </div>


          <div className="bg-white border-2 border-[#4CA994]/20 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <ShieldCheck size={20} className="text-[#4CA994] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-gray-900 mb-1">Importante</p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Esta es una orientación inicial basada en tus respuestas. Para confirmarlo, nuestro equipo médico realiza un <strong>Examen Analítico Tricometabólico</strong> en la primera asesoría.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#2C3E50] rounded-2xl p-6 text-white text-center">
            <h3 className="text-xl font-extrabold mb-2">¿Lista para el siguiente paso?</h3>
            <p className="text-sm text-gray-300 mb-5">
              Agenda una videollamada gratuita con nuestro equipo médico. Te explicarán el protocolo y resolverán todas tus dudas.
            </p>
            <a
              href={calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => analytics.trackEvent('diagnostic_quiz_cta_clicked', { sexo: 'mujer', protocol, channel: 'ghl_calendar' })}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-[#4CA994] hover:bg-[#3d9583] text-white font-bold text-base shadow-lg transition-all w-full justify-center"
            >
              Agenda una videollamada con nuestro equipo médico
              <ArrowRight size={20} />
            </a>
            <p className="text-xs text-gray-400 mt-3 mb-4">100% gratuita · Sin compromiso · Lunes a domingo</p>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">o</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => analytics.trackEvent('diagnostic_quiz_cta_clicked', { sexo: 'mujer', protocol, channel: 'whatsapp' })}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm transition-all w-full justify-center"
            >
              <WhatsAppIcon size={18} className="text-white" />
              Hablar por WhatsApp con una asesora
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RESULTS — HOMBRE (presencial)
  // ==========================================
  if (phase === 'results' && sexo === 'hombre') {
    const firstName = (contactForm.nombre || '').split(' ')[0];
    // Redirect to existing /agendar Koibox-backed booking page.
    // tipo=asesoria bypasses the bono gate (which is women-only).
    const agendarParams = new URLSearchParams();
    if (contactForm.nombre) agendarParams.set('nombre', contactForm.nombre);
    if (contactForm.email) agendarParams.set('email', contactForm.email);
    if (contactForm.telefono) agendarParams.set('phone', contactForm.telefono);
    if (prefill.ciudad) agendarParams.set('clinica', prefill.ciudad);
    if (contactId) agendarParams.set('contactId', contactId);
    agendarParams.set('tipo', 'asesoria');
    const agendarUrl = `/agendar?${agendarParams.toString()}`;

    // Secondary CTA — WhatsApp (para quien prefiere no agendar online)
    const WA_PHONE = '34623457218';
    const waText = encodeURIComponent(
      `Hola, soy ${firstName || 'un paciente'}. Acabo de completar el diagnóstico online en Hospital Capilar. Quiero agendar mi asesoría presencial gratuita.`
    );
    const waUrl = `https://wa.me/${WA_PHONE}?text=${waText}`;

    return (
      <div className="min-h-screen bg-[#F7F8FA] font-sans">
        <div className="bg-[#4CA994] text-white text-center py-3 px-4 text-sm font-semibold sticky top-0 z-10">
          Tu pre-diagnóstico personalizado está listo
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 pb-32">
          <div className="text-center mb-6">
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-7 mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">
              {firstName ? `${firstName}, este es tu siguiente paso` : 'Este es tu siguiente paso'}
            </h2>
            <p className="text-gray-500 text-sm">Basado en tus respuestas</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-5 shadow-sm">
            <div className="bg-[#F0F7F6] px-5 py-4 border-b border-[#4CA994]/10 flex items-center gap-3">
              <div className="w-10 h-10 bg-[#4CA994] rounded-full flex items-center justify-center shrink-0">
                <Stethoscope size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#4CA994] font-bold">Recomendación</p>
                <h3 className="text-lg font-extrabold text-gray-900 leading-tight">Asesoría presencial gratuita</h3>
                <p className="text-xs text-gray-500">Con nuestro equipo médico</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-3">
                <CheckCircle2 size={20} className="text-[#4CA994] shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">Diagnóstico personalizado por el equipo médico</p>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 size={20} className="text-[#4CA994] shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">Evaluación de tratamientos disponibles (médicos, regenerativos, trasplante)</p>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 size={20} className="text-[#4CA994] shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">Sin compromiso, completamente gratuita</p>
              </div>
            </div>
          </div>

          <div className="bg-[#2C3E50] rounded-2xl p-6 text-white text-center">
            <h3 className="text-xl font-extrabold mb-2">Agenda tu cita en clínica</h3>
            <p className="text-sm text-gray-300 mb-5">
              Elige la clínica más cercana y un horario que te venga bien.
            </p>
            <a
              href={agendarUrl}
              onClick={() => analytics.trackEvent('diagnostic_quiz_cta_clicked', { sexo: 'hombre', channel: 'koibox_agendar' })}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-[#4CA994] hover:bg-[#3d9583] text-white font-bold text-base shadow-lg transition-all w-full justify-center"
            >
              Agenda tu asesoría presencial gratuita
              <ArrowRight size={20} />
            </a>
            <p className="text-xs text-gray-400 mt-3 mb-4">100% gratuita · Sin compromiso · Madrid · Murcia · Pontevedra</p>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">o</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>

            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => analytics.trackEvent('diagnostic_quiz_cta_clicked', { sexo: 'hombre', channel: 'whatsapp' })}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-sm transition-all w-full justify-center"
            >
              <WhatsAppIcon size={18} className="text-white" />
              Hablar por WhatsApp con una asesora
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // SEX SELECT (when arriving without ?v= param)
  // ==========================================
  if (phase === 'sex-select') {
    return (
      <div className="min-h-screen bg-white font-sans flex flex-col">
        <TopBar />
        <div className="max-w-lg w-full mx-auto px-6 pt-10 pb-12 flex-1">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setPhase('landing')} className="text-gray-400 hover:text-gray-600 p-1">
              <ArrowLeft size={20} />
            </button>
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-6" />
            <div className="w-8" />
          </div>

          <div className="mb-8">
            <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">Empecemos</span>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2 leading-tight">¿Cuál es tu sexo biológico?</h2>
            <p className="text-gray-500 text-sm">La caída capilar tiene causas distintas en hombres y mujeres. Necesitamos saberlo para darte un diagnóstico preciso.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Hombre', value: 'hombre', icon: '👨' },
              { label: 'Mujer', value: 'mujer', icon: '👩' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSexSelect(opt.value)}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-100 hover:border-[#4CA994] hover:bg-[#F0F7F6] transition-all"
              >
                <span className="text-4xl">{opt.icon}</span>
                <span className="font-bold text-base text-gray-700">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // QUIZ STEPS
  // ==========================================
  if (phase === 'quiz') {
    const currentQ = questions[step];
    return (
      <div className="min-h-screen bg-white font-sans flex flex-col">
        <TopBar />
        <div className="h-1 bg-gray-100 w-full">
          <div className="h-full bg-[#4CA994] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="max-w-lg w-full mx-auto px-6 pt-6 pb-12 flex-1">
          <div className="flex items-center justify-between mb-6">
            <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 p-1">
              <ArrowLeft size={20} />
            </button>
            <img src="/logo-hc.png" alt="Hospital Capilar" className="h-6" />
            <div className="w-8" />
          </div>

          <div className="mb-5">
            <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">
              Paso {step + 1} de {totalSteps}
            </span>
            <h2 className="text-xl font-extrabold text-gray-900 mb-1 leading-tight">{currentQ.title}</h2>
          </div>

          <div className="grid gap-2.5">
            {currentQ.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSelect(currentQ.id, opt.value)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  answers[currentQ.id] === opt.value
                    ? 'border-[#4CA994] bg-[#F0F7F6]'
                    : 'border-gray-100 hover:border-[#4CA994]/50'
                }`}
              >
                <span className={`flex-1 font-semibold text-[15px] ${
                  answers[currentQ.id] === opt.value ? 'text-[#2C3E50]' : 'text-gray-700'
                }`}>
                  {opt.label}
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  answers[currentQ.id] === opt.value ? 'border-[#4CA994] bg-[#4CA994]' : 'border-gray-300'
                }`}>
                  {answers[currentQ.id] === opt.value && <CheckCircle2 size={13} className="text-white" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 text-center border-t border-gray-100 bg-gray-50 flex justify-center gap-6">
          <p className="text-xs text-gray-400 font-medium flex items-center gap-1"><ShieldCheck size={14} /> 100% Confidencial</p>
          <p className="text-xs text-gray-400 font-medium flex items-center gap-1"><Clock size={14} /> 1 minuto</p>
        </div>
      </div>
    );
  }

  // ==========================================
  // LANDING PHASE (organic / SEO entry)
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
            {config.ctaQuiz}
            <ArrowRight size={22} />
          </button>
          <p className="text-sm text-gray-400 mt-4">5 preguntas · 100% confidencial · Sin compromiso</p>
        </div>
      </div>

      <StatsSection stats={config.stats} />
      <PainPointsSection painPoints={config.painPoints} />
      <SolutionSection solution={config.solution} />
      <ClinicGallerySection />
      <TestimonialsSection testimonials={config.testimonials} videoTestimonial={config.videoTestimonial} />
      <CEOSection />
      <FAQSection faqs={config.faqs} />

      <section className="bg-[#2C3E50] py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            El primer paso es saber qué necesita tu pelo
          </h2>
          <p className="text-lg text-gray-300 mb-8">
            Responde 5 preguntas y recibe tu pre-diagnóstico al momento.
          </p>
          <button
            onClick={handleStartQuiz}
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-bold text-lg shadow-xl hover:-translate-y-1 hover:shadow-2xl transition-all bg-[#4CA994]"
          >
            {config.ctaQuiz}
            <ArrowRight size={22} />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default DiagnosticQuiz;

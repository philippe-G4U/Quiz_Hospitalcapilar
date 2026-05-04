import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronRight, CheckCircle2, ArrowLeft, ShieldCheck, Stethoscope,
  Sparkles, Dna, MapPin, Info, PhoneCall, Calendar, Download, FileText,
  Check, X, Star, ChevronDown, Lock, Phone, Users, Heart, Clock
} from 'lucide-react';
import { useAnalytics } from '@hospital-capilar/shared/analytics';
import { getUTMParams, classifyTrafficSource, detectFunnelType } from '@hospital-capilar/shared/analytics';
import { db } from '@hospital-capilar/shared/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';
import { safeFetch } from '../utils/safeFetch';
import PaymentConfirmation from './PaymentConfirmation';
import PhoneInput from './PhoneInput';
import { OBJECTIONS_BY_ECP, TESTIMONIALS_BY_ECP, INCLUDED_BY_CTA, FAQS_BY_CTA } from './resultContent';

const WhatsAppIcon = ({ size = 24, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// ============================================
// GENERATE AGENT MESSAGE
// ============================================
function generateAgentMessage(answers, result, labels, bonoPrice = 125) {
  const { ecp, score, frame } = result;
  const nombre = (answers.nombre || 'Paciente').split(' ')[0];
  const sexo = answers.sexo === 'hombre' ? 'el paciente' : 'la paciente';
  const pronombre = answers.sexo === 'hombre' ? 'El' : 'Ella';

  const problemLabel = labels.problema || answers.problema;
  const tiempoLabel = labels.tiempo || answers.tiempo;
  const probadoLabels = (answers.probado || []).map(v => labels[`probado_${v}`] || v).join(', ') || 'nada';
  const impactoLabel = labels.impacto || answers.impacto;
  const inversionLabel = labels.inversion || answers.inversion;
  const formatoLabel = labels.formato || answers.formato;
  const edadLabel = labels.edad || answers.edad;
  const ubicacionLabel = labels.ubicacion || answers.ubicacion || 'no indicada';

  let urgencia = 'media';
  if (frame === 'FRAME_A' || score >= 60) urgencia = 'ALTA';
  else if (frame === 'FRAME_D' || score < 30) urgencia = 'baja';

  let intro = '';
  if (ecp === '¿Qué Me Pasa?') intro = `${nombre} es un hombre que lleva ${tiempoLabel} con caída capilar. Ya probó ${probadoLabels} sin resultado. No tiene diagnóstico formal.`;
  else if (ecp === 'Es Normal') intro = `${nombre} es una mujer con caída probablemente hormonal. Lleva ${tiempoLabel} con el problema.`;
  else if (ecp === 'El Espejo') intro = `${nombre} es un joven (${edadLabel}) que está empezando a notar caída. Tiene poco o ningún tratamiento previo.`;
  else if (ecp === 'Ya Me Engañaron') intro = `${nombre} tuvo mala experiencia en ${labels.clinica_previa || 'otra clínica'}. Viene con desconfianza.`;
  else if (ecp === 'La Inversión') intro = `${nombre} ya se hizo un trasplante (${labels.cirugia_lugar || 'no especificado'}) y necesita mantenimiento.`;
  else if (ecp === 'Lo Que Vino Con el Bebé') intro = `${nombre} tiene caída desde el embarazo/parto. Lleva ${tiempoLabel} con el problema.`;
  else if (ecp === '¿Qué Me Pasa?') intro = `${nombre} nota caída capilar y no sabe la causa. No tiene diagnóstico. Lleva ${tiempoLabel} preocupado/a. Gateway — clasificar tras diagnóstico.`;
  else if (ecp === 'La Farmacia') intro = `${nombre} lleva ${tiempoLabel} usando productos OTC (champús, suplementos, minoxidil) sin resultado. Punto de inflexión: necesita diagnóstico real.`;
  else intro = `${nombre} tiene problemas de cuero cabelludo (caspa, irritación). NO es candidato/a — derivar a dermatología.`;

  const factoresText = (answers.factores_recientes || []).length > 0 && !(answers.factores_recientes || []).includes('ninguno')
    ? `\nFactores recientes: ${answers.factores_recientes.map(v => labels[`factores_recientes_${v}`] || v).join(', ')}.`
    : '';

  const patronLabel = labels.patron_perdida || answers.patron_perdida || 'no indicado';
  const inicioLabel = labels.inicio_caida || answers.inicio_caida || 'no indicado';
  const antecedentesLabel = labels.antecedentes || answers.antecedentes || 'no indicado';
  const diagnosticoPrevioLabel = labels.diagnostico_previo || answers.diagnostico_previo || 'no';
  const motivacionLabel = labels.motivacion || answers.motivacion;

  // Source info
  const sourceInfo = labels._utm_source
    ? `${labels._utm_source}/${labels._utm_medium || ''}${labels._utm_campaign ? ` (${labels._utm_campaign})` : ''}`
    : 'Directo / Orgánico';

  // Objeciones anticipadas por perfil
  let objeciones = '';
  if (ecp === '¿Qué Me Pasa?') {
    objeciones = `- "Ya probé minoxidil y no funcionó" → El 40-60% no responde a minoxidil sin saber la causa. Sin diagnóstico, es como tomar pastillas a ciegas. Nosotros primero diagnosticamos y luego tratamos.
- "Es muy caro" → El test de ${bonoPrice}€ incluye analítica hormonal + tricoscopia digital + valoración médica + plan personalizado. En farmacias gastarás más sin resultado.
- "No sé si es el momento" → Cuanto más esperas, más folículos se pierden. Los que se van no vuelven. Hoy tienes más pelo que mañana.`;
  } else if (ecp === 'Es Normal') {
    objeciones = `- "Mi médico dice que es estrés" → El 70% de alopecias femeninas tienen componente hormonal. Nuestro equipo médico especializado en salud capilar cruza tu perfil hormonal con un estudio capilar completo — algo que nadie más hace.
- "¿Y si es temporal?" → Si lleva más de 6 meses, no es temporal. Un diagnóstico a tiempo evita que se convierta en algo permanente.
- "Ya me hicieron análisis y salió todo bien" → Los análisis estándar no miden los marcadores capilares específicos. Nuestro estudio es diferente.`;
  } else if (ecp === 'El Espejo') {
    objeciones = `- "Todavía no es tan grave" → Exacto, y por eso es el MEJOR momento. Tratar alopecia temprana tiene un 90% de éxito vs 40% cuando ya es avanzada.
- "Soy muy joven para esto" → La alopecia androgenética puede empezar a los 18. No es cuestión de edad, es genética. Actuar ahora = mantener tu pelo.
- "Mis amigos me dicen que es normal" → Perder pelo NO es normal a tu edad. Un test capilar te saca de dudas en 30 minutos.`;
  } else if (ecp === 'Ya Me Engañaron') {
    objeciones = `- "Ya me gastó dinero en otra clínica y no funcionó" → Entiendo perfectamente. Por eso nosotros NO vendemos tratamientos en la primera cita. Primero diagnóstico, luego opciones. Sin presión.
- "¿Cómo sé que ustedes son diferentes?" → Somos un centro con un equipo médico profesional experto en salud capilar. Te damos un diagnóstico completo, no solo un presupuesto.
- "No quiero que me vendan nada" → En el test capilar te explicamos qué tienes y qué opciones existen. Tú decides si y cuándo actuar.`;
  } else if (ecp === 'La Inversión') {
    objeciones = `- "Ya me hice el trasplante, ¿necesito más?" → El trasplante mueve pelo, pero no frena la caída del pelo nativo. Sin mantenimiento, en 3-5 años puedes perder más de lo que ganaste.
- "En la clínica donde me operé no me dijeron nada de esto" → Muchas clínicas solo hacen la cirugía. Nosotros protegemos tu inversión con un plan de mantenimiento personalizado.
- "¿Cuánto cuesta el mantenimiento?" → Depende de tu caso, pero es una fracción de lo que costó el trasplante. El test capilar de ${bonoPrice}€ incluye el plan completo.`;
  } else if (ecp === 'Lo Que Vino Con el Bebé') {
    objeciones = `- "Me dicen que es normal después del parto" → Sí, es común. El 50% de madres lo sufren. Pero si pasan más de 6 meses y no se recupera, puede haber una alopecia subyacente que el embarazo activó.
- "Estoy dando el pecho, ¿puedo tratarme?" → Sí, hay tratamientos compatibles con la lactancia. En el test evaluamos opciones seguras para ti y tu bebé.
- "Ya se me pasará sola" → Ojalá, pero mejor descartarlo con un diagnóstico. Si hay AGA de fondo, cada mes sin tratar cuenta.`;
  } else if (ecp === 'La Farmacia') {
    objeciones = `- "Ya gasté €500+ en productos y nada funciona" → El problema no son los productos — es que nunca te diagnosticaron. Sin saber la causa, todo es una apuesta.
- "El minoxidil no me hizo nada" → El 60% no responde a minoxidil sin diagnóstico. Puede que necesites otro tratamiento completamente distinto.
- "Ya no creo en nada" → Entendemos la frustración. Un diagnóstico con datos objetivos (microscopio + analítica) te dice exactamente qué necesitas. Sin adivinar.`;
  }

  // Descripción natural del problema según ECP (para usar en el guión)
  let problemaNatural = 'la caída de pelo';
  if (ecp === '¿Qué Me Pasa?') problemaNatural = 'la caída de pelo sin tener un diagnóstico claro';
  else if (ecp === 'Es Normal') problemaNatural = 'la pérdida de densidad capilar';
  else if (ecp === 'El Espejo') problemaNatural = 'los primeros signos de caída';
  else if (ecp === 'Ya Me Engañaron') problemaNatural = 'tu experiencia anterior y la caída de pelo';
  else if (ecp === 'La Inversión') problemaNatural = 'el mantenimiento después del trasplante';
  else if (ecp === 'Lo Que Vino Con el Bebé') problemaNatural = 'la caída de pelo desde el embarazo';
  else if (ecp === 'La Farmacia') problemaNatural = 'la caída de pelo tras años probando productos sin resultado';

  // Guión de apertura personalizado
  let apertura = '';
  if (frame === 'FRAME_A') {
    apertura = `"Hola ${nombre}, te llamo de Hospital Capilar. Hiciste nuestro test capilar online y vi que llevas tiempo con ${problemaNatural}. Quería confirmar tu cita para el test presencial — es la forma más rápida de tener un plan claro. ¿Te viene mejor por la mañana o por la tarde?"`;
  } else if (frame === 'FRAME_C') {
    apertura = `"Hola ${nombre}, te llamo de Hospital Capilar. Vi que completaste nuestro test capilar sobre ${problemaNatural} y quería llamarte personalmente. ¿Tienes un par de minutos para que te cuente qué vimos en tus respuestas y qué opciones tienes?"`;
  } else if (frame === 'FRAME_D') {
    apertura = `Enviar WhatsApp/email: "Hola ${nombre}, gracias por completar el test capilar online de Hospital Capilar. Hemos analizado tus respuestas sobre ${problemaNatural} y te adjunto una guía personalizada. Si tienes alguna duda, puedes responder a este mensaje. Sin compromiso."`;
  } else if (frame === 'WAITLIST') {
    apertura = `"Hola ${nombre}, gracias por hacer el test capilar online. Ahora mismo no tenemos clínica cerca de ${ubicacionLabel}, pero estamos abriendo nuevas sedes. Te apunto en la lista prioritaria para que seas de los primeros en enterarte. ¿Te parece bien?"`;
  } else if (frame === 'DERIVACION') {
    apertura = `Enviar email informativo: "Hola ${nombre}, gracias por usar nuestra herramienta de evaluación capilar. Según tus respuestas, te recomendamos consultar con un especialista para una evaluación completa del cuero cabelludo. Te adjuntamos información útil."`;
  }

  const message = `GUION DE APERTURA
${apertura}

OBJECIONES FRECUENTES Y RESPUESTAS
${objeciones}

ESTRATEGIA DE CIERRE
${frame === 'FRAME_A' ? `CIERRE DIRECTO: Este lead quiere actuar YA. No divagar — ir directo a agendar cita.
- "Tenemos disponibilidad esta semana en ${ubicacionLabel}. ¿Prefieres martes o jueves?"
- Si duda: "El test incluye tricoscopia + análisis completo. Los ${bonoPrice}€ se descuentan si inicias tratamiento."
- Urgencia: "Las plazas de esta semana se están llenando, te reservo una ahora mismo."` : ''}${frame === 'FRAME_C' ? `CIERRE CONSULTIVO: Este lead necesita confianza antes de decidir.
- Primero escuchar, luego proponer. No mencionar precio hasta que pregunte.
- "¿Qué es lo que más te preocupa de tu situación actual?"
- Cuando esté listo: "¿Te gustaría que te reserve un test capilar? En 30 minutos sales de dudas con datos objetivos."
- Si duda del precio: "Los ${bonoPrice}€ incluyen TODO el estudio. Y si inicias tratamiento, se descuentan."` : ''}${frame === 'FRAME_D' ? `CIERRE NURTURING: Este lead necesita tiempo. NO presionar.
- Enviar guía PDF + caso de éxito similar a su perfil
- Follow-up en 3-5 días: "Hola ${nombre}, ¿pudiste leer la información? ¿Tienes alguna duda?"
- Si responde: pasar a conversación consultiva (FRAME_C)
- Si no responde: segundo follow-up en 7 días y cerrar secuencia` : ''}${frame === 'WAITLIST' ? `CIERRE WAITLIST: Mantener el interés sin frustrar.
- Apuntar en CRM con tag "waitlist-${ubicacionLabel.toLowerCase().replace(/ /g, '-')}"
- Enviar email de confirmación de lista de espera
- Reactivar cuando haya novedad de apertura en su zona` : ''}${frame === 'DERIVACION' ? `NO ES LEAD COMERCIAL. Solo enviar información educativa.
- Email con guía de cuidado del cuero cabelludo
- NO hacer follow-up comercial
- NO ofrecer cita` : ''}`;

  const quizAnswers = `RESPUESTAS DEL QUIZ — ${answers.nombre || 'Sin nombre'}

- Sexo: ${labels.sexo || answers.sexo || 'N/A'}
- Edad: ${edadLabel}
- Problema: ${problemLabel}
- Patrón de pérdida: ${patronLabel}
- Inicio de caída: ${inicioLabel}
- Antecedentes familiares: ${antecedentesLabel}
- Tiempo: ${tiempoLabel}
- Tratamientos probados: ${probadoLabels}${factoresText}
- Diagnóstico previo: ${diagnosticoPrevioLabel}
- Impacto emocional: ${impactoLabel}
- Motivacion: ${motivacionLabel}
- Inversion: ${inversionLabel}
- Formato preferido: ${formatoLabel}
- Ubicacion: ${ubicacionLabel}`;

  return { message, quizAnswers };
}

// ============================================
// NICHO WELCOME CONFIGS
// ============================================
const NICHO_WELCOME = {
  'el-espejo': {
    badge: 'Alopecia Temprana: Actúa Antes',
    headline: '¿Notas que tus entradas',
    headlineAccent: 'retroceden antes de tiempo?',
    subheadline: 'La alopecia a los 18-28 años es más común de lo que piensas. Y cuanto antes actúes, más pelo conservas. No esperes a que sea tarde — un test capilar a tiempo cambia todo.',
    cta: 'Evalúa tu caso en 3 minutos',
  },
  'es-normal': {
    badge: 'Especialistas en Alopecia Femenina',
    headline: '¿Tu médica dice que tu caída',
    headlineAccent: 'es "normal"?',
    subheadline: 'Desde la menopausia se te cae a puñados. Llevas un año y cada vez peor. El 40% de las mujeres sufre pérdida de pelo — y el 80% está mal diagnosticada.',
    cta: 'Descubre qué le pasa a tu pelo',
  },
  postparto: {
    badge: 'Caída Capilar Postparto',
    headline: '¿Se te cae el pelo',
    headlineAccent: 'desde el embarazo o el parto?',
    subheadline: 'El efluvio postparto afecta al 50% de madres. En la mayoría de casos es temporal, pero en algunas mujeres revela una alopecia subyacente que necesita tratamiento. La única forma de saberlo es con un test capilar.',
    cta: 'Descubre si es temporal o algo más',
  },
  'que-me-pasa': {
    badge: '¿Por Qué Se Me Cae el Pelo?',
    headline: 'Se te cae el pelo y',
    headlineAccent: 'no sabes por qué',
    subheadline: 'Google te asusta más de lo que te ayuda. No sabes si es estrés, genético o algo peor. El 70% de las personas con caída no tienen diagnóstico.',
    cta: '¿Qué me pasa? Descúbrelo en 3 min',
  },
  'ya-me-engañaron': {
    badge: 'Segunda Opinión Capilar',
    headline: '¿Tuviste una mala experiencia',
    headlineAccent: 'en otra clínica capilar?',
    subheadline: 'Sabemos que hay clínicas que prometen mucho y entregan poco. Hospital Capilar es un centro médico, no un centro estético. Aquí no hay consultas gratuitas que son ventas disfrazadas.',
    cta: 'Evalúa tu caso sin compromiso',
  },
  'farmacia-sin-salida': {
    badge: 'Cuando los Productos No Funcionan',
    headline: '¿Llevas años gastando en champús y',
    headlineAccent: 'nada funciona?',
    subheadline: 'Olistic, Iraltone, Pilexil, minoxidil... €500+ tirados. El problema no son los productos — es que nunca te diagnosticaron por qué se te cae el pelo.',
    cta: 'Descubre por qué no funciona',
  },
  'la-inversion': {
    badge: 'Mantenimiento Post-Trasplante',
    headline: 'Ya te operaste.',
    headlineAccent: '¿Quién protege tu inversión?',
    subheadline: 'Un trasplante capilar sin plan de mantenimiento pierde resultados con el tiempo. El pelo trasplantado no se cae, pero el pelo nativo sigue sometido a los mismos factores que causaron la caída original.',
    cta: 'Protege tu trasplante',
  },
};

// ============================================
// MAIN COMPONENT
// ============================================
const HospitalCapilarQuiz = ({ nicho = null, skipIntro = false }) => {
  const [stepIndex, setStepIndex] = useState(skipIntro ? 0 : -1);
  const [answers, setAnswers] = useState({ probado: [], factores_recientes: [], consentPrivacidad: false, consentComunicaciones: false });
  const [showMicroTip, setShowMicroTip] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [finalResult, setFinalResult] = useState(null);
  const [returningLead, setReturningLead] = useState(null);
  const [utmParams] = useState(() => getUTMParams());
  const [funnelType] = useState(() => detectFunnelType());
  const [trafficSource] = useState(() => classifyTrafficSource());
  const ghlContactIdRef = useRef(null);
  const [paymentStep, setPaymentStep] = useState(null); // null | 'paying' | 'paid'
  const [openFaq, setOpenFaq] = useState(null);
  const [disqualified, setDisqualified] = useState(null); // null | { reason: 'cuero-cabelludo' | 'alopecia-rara' }

  // Analytics
  const analytics = useAnalytics();
  const questionStartTime = useRef(Date.now());
  const quizStartTime = useRef(null);

  const theme = { primary: '#4CA994', secondary: '#2C3E50', light: '#F0F7F6', white: '#FFFFFF' };

  // ============================================
  // TRACK QUIZ STARTED WHEN SKIPPING INTRO
  // ============================================
  useEffect(() => {
    if (skipIntro && stepIndex === 0) {
      quizStartTime.current = Date.now();
      questionStartTime.current = Date.now();
      analytics.trackQuizStarted();
    }
  }, []);

  // ============================================
  // RETURNING LEAD DETECTION
  // ============================================
  useEffect(() => {
    try {
      const stored = localStorage.getItem('hc_quiz_lead');
      if (stored) {
        const lead = JSON.parse(stored);
        if (lead.nombre && lead.ecp) {
          setReturningLead(lead);
        }
      }
    } catch {}
  }, []);

  // ============================================
  // TRACK ABANDONMENT ON PAGE LEAVE
  // ============================================
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (stepIndex >= 0 && stepIndex < activeQuestions.length) {
        const q = activeQuestions[stepIndex];
        const timeInQuiz = quizStartTime.current ? Math.round((Date.now() - quizStartTime.current) / 1000) : 0;
        analytics.trackEvent('quiz_abandoned', {
          last_screen_id: q.id,
          last_screen_index: stepIndex,
          last_screen_type: q.type === 'form' ? 'contact_form' : 'question',
          total_screens: activeQuestions.length,
          progress_pct: Math.round((stepIndex / activeQuestions.length) * 100),
          time_in_quiz_seconds: timeInQuiz,
          answers_count: Object.keys(answers).length,
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  });

  // ============================================
  // QUESTIONS
  // ============================================
  const questions = [
    // BLOQUE 1: IDENTIFICACION
    {
      id: 'sexo', block: 1,
      title: 'Empecemos. ¿Cuál es tu sexo biológico?',
      subtitle: 'La caída capilar tiene causas hormonales distintas en hombres y mujeres. Necesitamos saberlo para darte un análisis preciso.',
      type: 'single',
      options: [
        { label: 'Hombre', value: 'hombre', icon: '👨' },
        { label: 'Mujer', value: 'mujer', icon: '👩' }
      ]
    },
    {
      id: 'edad', block: 1,
      title: '¿En qué rango de edad estás?',
      type: 'single',
      options: [
        { label: '18 - 25 años', value: '18-25' },
        { label: '26 - 35 años', value: '26-35' },
        { label: '36 - 45 años', value: '36-45' },
        { label: '46 - 55 años', value: '46-55' },
        { label: 'Más de 55 años', value: '56+' }
      ]
    },
    {
      id: 'problema', block: 1,
      title: '¿Cuál es tu principal preocupación con tu pelo?',
      type: 'single',
      optionsFn: (ans) => ans.sexo === 'hombre' ? [
        { label: 'Se me cae mucho el pelo', value: 'caida' },
        { label: 'Noto que pierdo densidad (se me transparenta)', value: 'densidad' },
        { label: 'Las entradas retroceden', value: 'entradas' },
        { label: 'Me operé y el pelo sigue cayendo', value: 'post-cirugia' },
        { label: 'Tuve mala experiencia en otra clínica', value: 'mala-experiencia' },
        { label: 'Problemas en el cuero cabelludo (caspa, granos, irritación)', value: 'cuero-cabelludo' }
      ] : [
        { label: 'Se me cae mucho el pelo', value: 'caida' },
        { label: 'Noto que pierdo densidad / se me ve el cuero cabelludo', value: 'densidad-mujer' },
        { label: 'Se me cae desde el embarazo / parto', value: 'postparto' },
        { label: 'Se me cae mucho más de lo normal (estrés, cambio de estación)', value: 'caida-general' },
        { label: 'Problemas en el cuero cabelludo (caspa, granos, irritación)', value: 'cuero-cabelludo' }
      ]
    },
    {
      id: 'tiempo', block: 1,
      title: '¿Hace cuánto notas este problema?',
      type: 'single',
      options: [
        { label: 'Menos de 3 meses', value: '<3m' },
        { label: '3 - 12 meses', value: '3-12m' },
        { label: '1 - 3 años', value: '1-3a' },
        { label: 'Más de 3 años', value: '3a+' }
      ]
    },
    {
      id: 'patron_perdida', block: 1,
      title: '¿Dónde notas principalmente la pérdida de pelo?',
      type: 'multiple',
      dependsOn: (ans) => ans.problema !== 'post-cirugia' && ans.problema !== 'mala-experiencia',
      options: [
        { label: 'Entradas / línea frontal', value: 'entradas' },
        { label: 'Coronilla', value: 'coronilla' },
        { label: 'Difusa en toda la cabeza', value: 'difusa' },
        { label: 'Zonas concretas (placas) sin pelo', value: 'placas' },
        { label: 'En "diadema" con pérdida también de las cejas', value: 'diadema' },
        { label: 'No lo sé', value: 'no-se' }
      ]
    },
    {
      id: 'inicio_caida', block: 1,
      title: '¿Cómo empezó la caída del pelo?',
      subtitle: 'Esto nos ayuda a distinguir el tipo de caída.',
      type: 'single',
      dependsOn: (ans) => ans.problema !== 'post-cirugia' && ans.problema !== 'mala-experiencia',
      options: [
        { label: 'De forma progresiva (meses o años)', value: 'progresiva' },
        { label: 'De forma brusca (en pocas semanas)', value: 'brusca' },
        { label: 'No estoy seguro/a', value: 'no-seguro' }
      ]
    },
    {
      id: 'antecedentes', block: 1,
      title: '¿Tienes antecedentes de alopecia en tu familia?',
      subtitle: 'Padre, madre, abuelos, tíos...',
      type: 'single',
      options: [
        { label: 'Sí, por parte de padre', value: 'padre' },
        { label: 'Sí, por parte de madre', value: 'madre' },
        { label: 'Sí, ambos lados', value: 'ambos' },
        { label: 'No que yo sepa', value: 'no' },
        { label: 'No estoy seguro/a', value: 'no-seguro' }
      ]
    },
    {
      id: 'probado', block: 1,
      title: '¿Qué has probado hasta ahora para frenar la caída?',
      subtitle: 'Puedes marcar varias opciones.',
      type: 'multiple',
      options: [
        { label: 'Nada todavía', value: 'nada', exclusive: true },
        { label: 'Champú anticaída / suplementos (Pilexil, biotina, Olistic...)', value: 'otc' },
        { label: 'Minoxidil', value: 'minoxidil' },
        { label: 'Finasteride / Dutasteride', value: 'finasteride' },
        { label: 'Tratamientos en clínica (PRP, mesoterapia, láser...)', value: 'clinica' },
        { label: 'Trasplante capilar', value: 'trasplante' },
        { label: 'Otro tratamiento médico', value: 'otro' }
      ]
    },
    // CONDICIONALES BLOQUE 1
    {
      id: 'factores_recientes', block: 1,
      title: '¿Has tenido alguno de estos factores en los últimos 6 meses?',
      subtitle: 'Puedes marcar varios. Esto nos ayuda a distinguir el tipo de caída.',
      dependsOn: (ans) => ['caida', 'densidad', 'densidad-mujer', 'caida-general', 'postparto'].includes(ans.problema),
      type: 'multiple',
      options: [
        { label: 'Cirugía o enfermedad importante', value: 'cirugia-enfermedad' },
        { label: 'Dieta estricta o pérdida rápida de peso', value: 'dieta' },
        { label: 'Estrés intenso (laboral, personal, duelo...)', value: 'estres' },
        { label: 'COVID u otra infección fuerte', value: 'covid' },
        { label: 'Cambios hormonales (menopausia, tiroides, píldora...)', value: 'hormonales' },
        { label: 'Ninguno de estos', value: 'ninguno', exclusive: true }
      ]
    },
    {
      id: 'cirugia_lugar', block: 1,
      title: '¿Dónde te operaste?',
      dependsOn: (ans) => ans.problema === 'post-cirugia',
      type: 'single',
      options: [
        { label: 'En Hospital Capilar', value: 'hc' },
        { label: 'En otra clínica en España', value: 'españa' },
        { label: 'En Turquía', value: 'turquia' },
        { label: 'En otro país', value: 'otro' }
      ]
    },
    {
      id: 'clinica_previa', block: 1,
      title: '¿En qué clínica fue?',
      dependsOn: (ans) => ans.problema === 'mala-experiencia',
      type: 'single',
      options: [
        { label: 'Insparya', value: 'insparya' },
        { label: 'Svenson', value: 'svenson' },
        { label: 'Medical Hair', value: 'medicalhair' },
        { label: 'IMD (Instituto Médico Dermatológico)', value: 'imd' },
        { label: 'Dorsia', value: 'dorsia' },
        { label: 'Otra', value: 'otra' }
      ]
    },
    // BLOQUE 2: PROFUNDIDAD + EDUCACION
    {
      id: 'impacto', block: 2,
      title: '¿Cuánto te afecta este problema en tu día a día?',
      type: 'single',
      microTipFn: (ans) => `La pérdida de pelo afecta a la autoestima del 75% de las personas que la sufren. No estás ${ans.sexo === 'mujer' ? 'sola' : 'solo'}.`,
      options: [
        { label: 'Poco: me preocupa pero no me limita', value: 'bajo' },
        { label: 'Bastante: evito ciertas situaciones o peinados', value: 'medio' },
        { label: 'Mucho: afecta mi autoestima y mi vida social', value: 'alto' },
        { label: 'Es lo que más me preocupa de mi salud ahora mismo', value: 'critico' }
      ]
    },
    // 🆕 SOCIAL PROOF 1: Validación emocional (después de impacto)
    {
      id: 'social_validacion', block: 2,
      type: 'info',
      infoContentFn: (ans) => ({
        icon: 'heart',
        headline: `No estás ${ans.sexo === 'mujer' ? 'sola' : 'solo'} en esto`,
        body: 'Miles de pacientes han pasado por donde tú estás ahora. Nuestro equipo médico especializado en salud capilar ha ayudado a cada uno de ellos a entender su caso y encontrar una solución real.',
        stats: [
          { value: '+10.000', label: 'pacientes atendidos' },
          { value: '4.8/5', label: 'valoración media' },
          { value: '3', label: 'clínicas en España' },
        ],
        image: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/mejores_cirujanos_de_injerto_capilar_w5ppmh.jpg',
        imageAlt: 'Equipo médico Hospital Capilar',
        cta: 'Seguir con mi test capilar',
      }),
    },
    {
      id: 'diagnostico_previo', block: 2,
      title: '¿Tienes alguna alopecia diagnosticada?',
      type: 'single',
      microTip: 'Existen más de 20 tipos de alopecia con tratamientos distintos. Saber si ya tienes un diagnóstico nos ayuda a orientarte mejor.',
      options: [
        { label: 'No, no tengo diagnóstico', value: 'no' },
        { label: 'Sí, alopecia androgénica (la más común)', value: 'androgenica' },
        { label: 'Sí, alopecia frontal fibrosante', value: 'frontal-fibrosante' },
        { label: 'Sí, alopecia areata', value: 'areata' },
        { label: 'Sí, otro tipo de alopecia', value: 'otra' }
      ]
    },
    // 🆕 SOCIAL PROOF 2: Resultados reales (después de diagnostico_previo)
    {
      id: 'social_resultados', block: 2,
      type: 'info',
      infoContent: {
        icon: 'sparkles',
        headline: 'Resultados reales de pacientes reales',
        body: 'Cada caso es único. Por eso el primer paso siempre es un test capilar profesional con tricoscopía y analítica — no una consulta comercial.',
        gallery: [
          { src: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/Recepcion_ywqbi8.jpg', alt: 'Recepción Hospital Capilar' },
          { src: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/hrt_d1vm3u.jpg', alt: 'Tratamiento capilar avanzado' },
          { src: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/tratamientos_mujer_crt_gpxgxm.jpg', alt: 'Test capilar personalizado' },
        ],
        cta: 'Continuar',
      },
    },
    {
      id: 'motivacion', block: 2,
      title: '¿Qué necesitarías para dar el siguiente paso?',
      type: 'single',
      microTip: 'En Hospital Capilar, el test capilar incluye tricoscopía + analítica hormonal + 30 minutos con tu médico. Un análisis real, no una consulta comercial.',
      options: [
        { label: 'Saber exactamente qué tengo y qué opciones hay', value: 'diagnostico' },
        { label: 'Ver resultados de personas como yo', value: 'prueba-social' },
        { label: 'Que un médico me explique mi caso sin presión', value: 'confianza' },
        { label: 'Que el precio sea razonable', value: 'precio' }
      ]
    },
    // BLOQUE 3: DISPOSICION
    {
      id: 'expectativa', block: 3,
      title: '¿Qué resultado esperas conseguir?',
      type: 'single',
      options: [
        { label: 'Frenar la caída: que no vaya a más', value: 'frenar' },
        { label: 'Recuperar densidad sin cirugía', value: 'densidad' },
        { label: 'Saber si necesito cirugía o tratamiento', value: 'diagnostico' },
        { label: 'Mantener los resultados de mi cirugía', value: 'mantenimiento' }
      ]
    },
    // 🆕 SOCIAL PROOF 3: Testimonio dinámico (antes de inversión)
    {
      id: 'social_testimonio', block: 3,
      type: 'info',
      infoContentFn: (ans) => {
        // Pick a relevant testimonial based on profile
        const ecpMap = {
          'mala-experiencia': 'Ya Me Engañaron',
          'post-cirugia': 'La Inversión',
          'postparto': 'Lo Que Vino Con el Bebé',
        };
        let ecpKey = ecpMap[ans.problema];
        if (!ecpKey) {
          if (ans.sexo === 'mujer') ecpKey = 'Es Normal';
          else if (ans.edad === '18-25') ecpKey = 'El Espejo';
          else if ((ans.probado || []).some(v => ['otc', 'minoxidil'].includes(v)) && !(ans.probado || []).includes('nada')) ecpKey = 'La Farmacia';
          else ecpKey = '¿Qué Me Pasa?';
        }
        const testimonials = TESTIMONIALS_BY_ECP[ecpKey] || TESTIMONIALS_BY_ECP['Es Normal'];
        const t = testimonials[0];
        const isMujer = ans.sexo === 'mujer';
        return {
          icon: 'star',
          headline: 'Personas como tú que dieron el paso',
          testimonial: isMujer ? null : t,
          videoTestimonial: isMujer ? {
            src: 'https://res.cloudinary.com/dsc0jsbkz/video/upload/v1777898178/YOLANDA_TESTIMONIO_rv2tei.mp4',
            name: 'Yolanda',
            label: 'Paciente Hospital Capilar',
          } : null,
          cta: 'Ya casi termino',
        };
      },
    },
    {
      id: 'inversion', block: 3,
      title: '¿Cuánto estarías dispuesto/a a invertir al mes en el cuidado de tu pelo si vieras resultados?',
      type: 'single',
      microTip: 'La mayoría de personas que buscan solución para su caída han gastado entre 200€ y 1.000€ en productos sin un test capilar previo. Un test capilar correcto es lo primero — todo lo demás viene después.',
      options: [
        { label: 'Menos de 50€/mes', value: '<50' },
        { label: '50€ - 150€/mes', value: '50-150' },
        { label: '150€ - 300€/mes', value: '150-300' },
        { label: 'Lo que sea necesario si funciona', value: 'abierto' }
      ]
    },
    {
      id: 'formato', block: 3,
      title: '¿Cómo te gustaría dar el siguiente paso?',
      type: 'single',
      options: [
        { label: 'Quiero reservar un test capilar presencial', value: 'presencial' },
        { label: 'Prefiero que me llamen para explicarme', value: 'llamada' },
        { label: 'Quiero empezar ya: si hay un plan, lo quiero', value: 'directo' },
        { label: 'Necesito más información antes de decidir', value: 'info' }
      ]
    },
    // BLOQUE 4: CAPTURA
    {
      id: 'captura', block: 4,
      title: '¡Ya casi está!',
      subtitle: 'Para preparar tu test capilar personalizado, necesitamos tus datos:',
      type: 'form',
      options: []
    }
  ];

  const activeQuestions = questions.filter(q => !q.dependsOn || q.dependsOn(answers));
  const currentQ = activeQuestions[stepIndex >= 0 ? stepIndex : 0];

  // ============================================
  // LABEL HELPERS (for agent message + display)
  // ============================================
  const getLabel = (qId, value) => {
    const q = questions.find(q => q.id === qId);
    if (!q) return value;
    const opts = q.optionsFn ? q.optionsFn(answers) : q.options;
    const opt = opts?.find(o => o.value === value);
    return opt ? opt.label : value;
  };

  const buildAllLabels = useCallback((ans) => {
    const labels = {};
    for (const q of questions) {
      const val = ans[q.id];
      if (val === undefined || val === null) continue;
      const opts = q.optionsFn ? q.optionsFn(ans) : q.options;
      if (Array.isArray(val)) {
        val.forEach(v => {
          const opt = opts?.find(o => o.value === v);
          labels[`${q.id}_${v}`] = opt ? opt.label : v;
        });
      } else {
        const opt = opts?.find(o => o.value === val);
        labels[q.id] = opt ? opt.label : val;
      }
    }
    // Add location label
    const ubicacionMap = {
      madrid: 'Madrid', murcia: 'Murcia', pontevedra: 'Pontevedra',
      acoruna: 'A Coruña', mostoles: 'Mostoles', albacete: 'Albacete',
      valladolid: 'Valladolid', burgos: 'Burgos', valencia: 'Valencia', otra: 'Otra ciudad'
    };
    if (ans.ubicacion) labels.ubicacion = ubicacionMap[ans.ubicacion] || ans.ubicacion;
    return labels;
  }, []);

  // Build readable answers object for storage
  const buildReadableAnswers = useCallback((ans) => {
    const labels = buildAllLabels(ans);
    const readable = {};
    for (const q of questions) {
      const val = ans[q.id];
      if (val === undefined || val === null || q.type === 'form') continue;
      if (Array.isArray(val)) {
        readable[q.id] = {
          question: q.title,
          values: val,
          labels: val.map(v => labels[`${q.id}_${v}`] || v),
        };
      } else {
        readable[q.id] = {
          question: q.title,
          value: val,
          label: labels[q.id] || val,
        };
      }
    }
    return readable;
  }, [buildAllLabels]);

  // ============================================
  // SCORING ENGINE
  // ============================================
  const processResults = (finalAnswers) => {
    let ecp = '¿Qué Me Pasa?';
    let score = 0;

    // ECP assignment using new clinical questions
    if (finalAnswers.problema === 'cuero-cabelludo') ecp = 'No candidato';
    else if (finalAnswers.problema === 'post-cirugia' || (finalAnswers.probado || []).includes('trasplante')) ecp = 'La Inversión';
    else if (finalAnswers.problema === 'mala-experiencia') ecp = 'Ya Me Engañaron';
    else if (finalAnswers.sexo === 'mujer' && finalAnswers.problema === 'postparto') ecp = 'Lo Que Vino Con el Bebé';
    else if (finalAnswers.sexo === 'mujer' && ['densidad-mujer', 'caida-general', 'caida'].includes(finalAnswers.problema)) ecp = 'Es Normal';
    else if (finalAnswers.sexo === 'hombre' && finalAnswers.edad === '18-25' && ((finalAnswers.probado || []).includes('nada') || (finalAnswers.probado || []).includes('otc'))) ecp = 'El Espejo';

    // Refine ECP using clinical pattern data
    // Efluvio telógeno signals: brusca onset + recent factors → likely temporary
    const hasRecentFactors = (finalAnswers.factores_recientes || []).length > 0 && !(finalAnswers.factores_recientes || []).includes('ninguno');
    const isBrusca = finalAnswers.inicio_caida === 'brusca';
    const hasAntecedentes = ['padre', 'madre', 'ambos'].includes(finalAnswers.antecedentes);

    // Time-based scoring
    if (finalAnswers.tiempo === '3a+') score += 30;
    else if (finalAnswers.tiempo === '1-3a') score += 20;
    else if (finalAnswers.tiempo === '<3m' && (finalAnswers.probado || []).includes('nada')) score -= 15;

    // Treatment history scoring
    if ((finalAnswers.probado || []).includes('minoxidil') || (finalAnswers.probado || []).includes('finasteride')) score += 15;
    if ((finalAnswers.probado || []).includes('clinica')) score += 20;
    if ((finalAnswers.probado || []).includes('trasplante')) score += 25;

    // Clinical pattern scoring
    if (hasAntecedentes) score += 10; // Family history = likely AGA = treatable
    if (hasRecentFactors && isBrusca) score -= 5; // Likely efluvio = may resolve on its own
    if (['entradas', 'coronilla'].includes(finalAnswers.patron_perdida)) score += 10; // Classic AGA pattern
    if (finalAnswers.patron_perdida === 'placas') score -= 5; // Possible areata
    if (finalAnswers.diagnostico_previo === 'androgenica') score += 15; // Already diagnosed AGA = ready for treatment
    if (finalAnswers.diagnostico_previo === 'no') score += 10; // No diagnosis = needs one

    if (['26-35', '36-45'].includes(finalAnswers.edad)) score += 10;

    const ubi = finalAnswers.ubicacion || '';
    if (['madrid', 'murcia', 'pontevedra'].includes(ubi)) score += 15;
    else if (['acoruna', 'mostoles', 'albacete', 'valladolid', 'burgos', 'valencia'].includes(ubi)) score += 5;
    else score -= 20;

    if (['alto', 'critico'].includes(finalAnswers.impacto)) score += 15;
    if (finalAnswers.motivacion === 'diagnostico') score += 10;
    if (['50-150', '150-300'].includes(finalAnswers.inversion)) score += 10;
    if (finalAnswers.inversion === 'abierto') score += 20;
    if (finalAnswers.formato === 'presencial') score += 15;
    if (finalAnswers.formato === 'directo') score += 25;
    if (finalAnswers.formato === 'info') score -= 10;

    let frame = '';
    if (ecp === 'No candidato') frame = 'DERIVACION';
    else if (!['madrid', 'murcia', 'pontevedra'].includes(ubi) && ubi !== '') { frame = 'WAITLIST'; ecp = 'Ciudad sin clinica'; }
    else if (finalAnswers.formato === 'llamada' || ecp === 'Ya Me Engañaron') frame = 'FRAME_C';
    else if (finalAnswers.formato === 'info' || score < 40) frame = 'FRAME_D';
    else frame = 'FRAME_A';

    const result = { ecp, score, frame, nombre: finalAnswers.nombre || 'Paciente' };
    setFinalResult(result);

    // Track ECP classification for PostHog dashboard
    analytics.trackEvent('lead_classified', { ecp, frame, traffic_source: trafficSource, funnel_type: funnelType, nicho, sexo: finalAnswers.sexo || null });

    // Generate labels and agent message FIRST (needed by GHL and Firestore)
    let agentMessage = '';
    let quizAnswersText = '';
    let readableAnswers = {};
    try {
      const labels = {
        ...buildAllLabels(finalAnswers),
        _utm_source: utmParams.utm_source || null,
        _utm_medium: utmParams.utm_medium || null,
        _utm_campaign: utmParams.utm_campaign || null,
      };
      const generated = generateAgentMessage(finalAnswers, result, labels, bonoPrice);
      agentMessage = generated.message;
      quizAnswersText = generated.quizAnswers;
      readableAnswers = buildReadableAnswers(finalAnswers);
    } catch (e) {
      console.error('[Labels] Failed to generate agent message:', e);
    }

    // Send to GHL, then save to Firestore with GHL status (async, non-blocking)
    (async () => {
      let ghlResult = { status: 'pending' };
      try {
        ghlResult = await sendToGoHighLevel(finalAnswers, result, agentMessage, quizAnswersText);
        if (ghlResult.contactId) ghlContactIdRef.current = ghlResult.contactId;
      } catch (e) {
        ghlResult = { status: 'error', error: e.message };
        console.error('[GHL] Failed to send:', e);
      }
      try {
        saveLead(finalAnswers, result, readableAnswers, agentMessage, ghlResult);
      } catch (e) {
        console.error('[Lead] Failed to save lead:', e);
      }
    })();

    // Track completion
    try {
      const totalTime = quizStartTime.current ? Date.now() - quizStartTime.current : 0;
      analytics.trackQuizCompleted(finalAnswers);
      analytics.trackEvent('quiz_result', {
        ecp: result.ecp,
        score: result.score,
        frame: result.frame,
        total_time_seconds: Math.round(totalTime / 1000),
        total_questions: activeQuestions.length,
        sexo: finalAnswers.sexo,
        edad: finalAnswers.edad,
        problema: finalAnswers.problema,
        ubicacion: finalAnswers.ubicacion,
        formato: finalAnswers.formato,
        impacto: finalAnswers.impacto,
        inversion: finalAnswers.inversion,
        device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
        utm_source: utmParams.utm_source || 'direct',
      });
    } catch (e) {
      console.error('[Analytics] Failed to track completion:', e);
    }
  };

  // ============================================
  // SAVE LEAD TO FIRESTORE
  // ============================================
  const saveLead = async (data, result, readableAnswers, agentMessage, ghlResult) => {
    try {
      const totalTime = quizStartTime.current ? Math.round((Date.now() - quizStartTime.current) / 1000) : 0;

      // Determine source channel from UTMs
      const sourceChannel = utmParams.utm_source
        ? `${utmParams.utm_source}/${utmParams.utm_medium || 'unknown'}`
        : document.referrer ? 'organic/referral' : 'direct';

      const leadDoc = {
        // Contact info
        nombre: data.nombre || '',
        email: data.email || '',
        telefono: data.telefono || '',
        ubicacion: data.ubicacion || '',

        // Classification
        ecp: result.ecp,
        score: result.score,
        frame: result.frame,

        // All answers (raw + readable)
        answersRaw: { ...data },
        answersReadable: readableAnswers,

        // Agent message
        agentMessage,

        // Behavior
        behavior: {
          totalTimeSeconds: totalTime,
          totalQuestions: activeQuestions.length,
          sessionId: analytics.sessionId || null,
        },

        // Attribution / UTMs
        source: {
          channel: sourceChannel,
          traffic_source: trafficSource,
          funnel_type: funnelType,
          nicho: nicho,
          utm_source: utmParams.utm_source || null,
          utm_medium: utmParams.utm_medium || null,
          utm_campaign: utmParams.utm_campaign || null,
          utm_content: utmParams.utm_content || null,
          utm_term: utmParams.utm_term || null,
          fbclid: utmParams.fbclid || null,
          gclid: utmParams.gclid || null,
          referrer: document.referrer || 'direct',
          landing_url: window.location.href,
        },

        // GHL sync status (backup tracking)
        ghl: ghlResult || { status: 'unknown' },

        // Metadata
        status: 'new',
        createdAt: serverTimestamp(),
      };

      // Remove form fields from answersRaw
      delete leadDoc.answersRaw.nombre;
      delete leadDoc.answersRaw.email;
      delete leadDoc.answersRaw.telefono;

      const leadsRef = collection(db, 'quiz_leads');
      await addDoc(leadsRef, leadDoc);

      // Save to localStorage for returning lead detection
      localStorage.setItem('hc_quiz_lead', JSON.stringify({
        nombre: data.nombre,
        email: data.email,
        ecp: result.ecp,
        frame: result.frame,
        score: result.score,
        completedAt: new Date().toISOString(),
      }));

    } catch (err) {
      console.error('Firestore save error:', err);
    }
  };

  // ============================================
  // GHL SYNC
  // ============================================

  // Calculate perfil A/B/C from score + frame
  const calculatePerfil = (score, frame) => {
    if (frame === 'DERIVACION') return null;
    if (score >= 60 && ['FRAME_A', 'FRAME_C'].includes(frame)) return 'A';
    if (score >= 35) return 'B';
    return 'C';
  };

  // ============================================
  // CTA CONFIG BY ECP + PERFIL
  // ============================================
  const TREATABLE_ECPS = [
    '¿Qué Me Pasa?',
    'El Espejo',
    'La Inversión',
  ];
  const UNCERTAIN_ECPS = [
    'Es Normal',
    'Lo Que Vino Con el Bebé',
  ];

  // Launch pricing — 195€ anchor tachado, 125€ oferta limitada (single funnel price)
  const ORIGINAL_PRICE = 195;
  const bonoPrice = 125;
  const DISCOUNT_PCT = Math.round(((ORIGINAL_PRICE - bonoPrice) / ORIGINAL_PRICE) * 100);
  const STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/9B614n0s94op9kyblJbAs06';

  // 24h countdown for "oferta limitada" — session-scoped urgency
  const [countdownSeconds, setCountdownSeconds] = useState(() => {
    if (typeof window === 'undefined') return 12 * 60 * 60;
    const stored = window.sessionStorage.getItem('bonoOfferStart_12h');
    const startTime = stored ? parseInt(stored, 10) : Date.now();
    if (!stored) window.sessionStorage.setItem('bonoOfferStart_12h', String(startTime));
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    return Math.max(0, 12 * 60 * 60 - elapsed);
  });

  useEffect(() => {
    const intv = setInterval(() => {
      setCountdownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(intv);
  }, []);

  const countdownDisplay = `${String(Math.floor(countdownSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((countdownSeconds % 3600) / 60)).padStart(2, '0')}:${String(countdownSeconds % 60).padStart(2, '0')}`;

  const getCTAConfig = (ecp, perfil, frame) => {
    // DERIVACION — artículo educativo
    if (frame === 'DERIVACION') {
      return {
        primary: { type: 'articulo_derivacion', label: 'Ir a leer el artículo', icon: 'FileText', style: 'amber' },
        secondary: null,
        heading: 'Información enviada',
        description: 'Te hemos enviado a tu email información educativa sobre cómo manejar problemas del cuero cabelludo.',
      };
    }

    // WAITLIST — geográfico
    if (frame === 'WAITLIST') {
      return {
        primary: { type: 'waitlist', label: 'Avísame cuando abráis cerca', icon: 'MapPin', style: 'primary' },
        secondary: { type: 'videoconsulta', label: '¿Ofrecéis videoconsulta médica?', icon: 'PhoneCall', style: 'outline' },
        heading: 'Próximas aperturas 2026',
        description: 'Estamos abriendo 6 nuevas clínicas en 2026. Si te apuntas, serás el primero en enterarte cuando abramos en tu zona.',
      };
    }

    // MALA EXPERIENCIA — siempre WhatsApp
    if (ecp === 'Ya Me Engañaron') {
      return {
        primary: { type: 'whatsapp', label: 'Háblanos por WhatsApp', icon: 'WhatsApp', style: 'primary', badge: 'SIN COMPROMISO' },
        secondary: null,
        heading: 'Entendemos que quieras hablar antes',
        description: 'Escríbenos por WhatsApp y te resolvemos cualquier duda. Sin presión, sin compromiso.',
      };
    }

    // TRATABLE (hombre, joven, post-trasplante)
    if (TREATABLE_ECPS.includes(ecp)) {
      if (perfil === 'C') {
        return {
          primary: { type: 'solicitar_llamada', label: 'Solicita que te llamemos', icon: 'PhoneCall', style: 'primary' },
          secondary: { type: 'descarga_guia', label: 'Quiero más información', icon: 'Download', style: 'text' },
          heading: 'Hablemos de tu caso',
          description: 'Un asesor médico te llamará en menos de 24h para resolver tus dudas. Sin compromiso, sin presión.',
        };
      }
      // Perfil A o B → WhatsApp como vía principal de contacto
      return {
        primary: { type: 'whatsapp', label: 'Agendar cita por WhatsApp', icon: 'WhatsApp', style: 'primary', badge: 'PASO RECOMENDADO' },
        secondary: null,
        heading: 'Reserva tu test capilar presencial',
        description: 'El siguiente paso es confirmar el pre-análisis con un médico en clínica. Escríbenos por WhatsApp y te agendamos.',
      };
    }

    // INCIERTO (mujer hormonal, postparto)
    if (UNCERTAIN_ECPS.includes(ecp)) {
      if (perfil === 'C') {
        return {
          primary: { type: 'solicitar_llamada', label: 'Solicita que te llamemos', icon: 'PhoneCall', style: 'primary' },
          secondary: { type: 'descarga_guia', label: 'Quiero más información', icon: 'Download', style: 'text' },
          heading: 'Hablemos de tu caso',
          description: 'Un asesor médico te llamará para entender tu situación concreta y orientarte. Sin compromiso.',
        };
      }
      // Perfil A o B → cobrar bono (oferta 195€ → 125€)
      return {
        primary: { type: 'pagar_bono', label: `Reservar mi analítica · ${bonoPrice}€`, icon: 'Calendar', style: 'primary', badge: 'OFERTA LIMITADA' },
        secondary: null,
        heading: 'Tu caso necesita un test capilar especializado',
        description: 'El test incluye analítica hormonal completa + tricoscopia digital + valoración con médico especialista + informe personalizado. En 30 minutos tendrás respuestas.',
      };
    }

    // Fallback → llamada
    return {
      primary: { type: 'solicitar_llamada', label: 'Solicita que te llamemos', icon: 'PhoneCall', style: 'primary' },
      secondary: null,
      heading: 'Hablemos de tu caso',
      description: 'Un asesor médico te llamará en menos de 24h.',
    };
  };

  const sendToGoHighLevel = async (data, result, agentMessage, quizAnswersText) => {
    const locationId = import.meta.env.VITE_GHL_LOCATION_ID || 'U4SBRYIlQtGBDHLFwEUf';

    const nameParts = (data.nombre || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const ciudadMap = {
      madrid: 'Madrid', murcia: 'Murcia', pontevedra: 'Pontevedra',
      acoruna: 'A Coruña', mostoles: 'Mostoles', albacete: 'Albacete',
      valladolid: 'Valladolid', burgos: 'Burgos', valencia: 'Valencia', otra: 'Otra ciudad'
    };

    const perfil = calculatePerfil(result.score, result.frame);

    // GHL Custom Field IDs — Contact level (definitivo)
    const CF = {
      // Aditional Info
      door:                    '2JYlfGk60lHbuyh9vcdV',
      sexo:                    'P7D2edjnOHwXLpglw9tB',
      ecp:                     'cFIcdJlT9sfnC3KMSwDD',
      agent_message_contact:   '5voFSSQP0yBFa8VdLuzY',
      contact_score:           'SGT17lKk7bZgkInBTtrT',
      consent:                 'x2QNuqJqst8Oy8H6pV0G',
      ubicacion_clinica:       'LygjPVQnLbqqdL4eqQwT',
      // UTMs
      utm_source:              'MisB9YJJAH7cnh8JOtQn',
      utm_medium:              'vykx7m6bcfbYMXRqToYP',
      utm_campaign:            '3fUI7GO9o7oZ7ddMNnFf',
      utm_content:             'dydSaUSYbb5R7nYOboLq',
      utm_term:                'eLdhsOthmyD38al527tG',
      nicho:                   'o4I4AG3ZK07nEzAMLTlK',
      funnel_type:             'liIshAFJMngl2BV9MtVw',
      traffic_source:          'miu6E3oxZowYahYGjX1A',
    };

    // contact_score: NUMERICAL 0-100
    // door (quiz_largo > quiz_corto > form) + ubicacion (operativa > otra)
    const clinicasOperativas = ['madrid', 'murcia', 'pontevedra'];
    const ubicacion = data.ubicacion || '';
    const isOperativa = clinicasOperativas.includes(ubicacion);
    let contactScore = 50; // NORMAL — próximas aperturas
    if (isOperativa) contactScore = 85; // HIGH — quiz_largo + operativa
    else if (ubicacion === 'otra' || !ubicacion) contactScore = 20; // OUT

    // Build custom fields array
    const customFields = [
      { id: CF.door, field_value: 'quiz_largo' },
      { id: CF.sexo, field_value: data.sexo || '' },
      { id: CF.ecp, field_value: result.ecp },
      { id: CF.agent_message_contact, field_value: agentMessage || '' },
      { id: CF.contact_score, field_value: contactScore },
      { id: CF.ubicacion_clinica, field_value: data.ubicacion || '' },
      { id: CF.consent, field_value: (() => {
        const opts = [];
        if (data.consentPrivacidad) opts.push('He leído y acepto la Política de Privacidad');
        if (data.consentComunicaciones) opts.push('Acepto recibir comunicaciones comerciales por email, Whatsapp y/o teléfono sobre tratamientos, promociones y novedades.');
        return opts;
      })() },
      { id: CF.nicho, field_value: nicho || 'general' },
      { id: CF.funnel_type, field_value: funnelType || 'quiz_largo' },
      { id: CF.traffic_source, field_value: trafficSource || 'direct' },
    ];

    // UTMs
    if (utmParams.utm_source) customFields.push({ id: CF.utm_source, field_value: utmParams.utm_source });
    if (utmParams.utm_medium) customFields.push({ id: CF.utm_medium, field_value: utmParams.utm_medium });
    if (utmParams.utm_campaign) customFields.push({ id: CF.utm_campaign, field_value: utmParams.utm_campaign });
    if (utmParams.utm_content) customFields.push({ id: CF.utm_content, field_value: utmParams.utm_content });
    if (utmParams.utm_term) customFields.push({ id: CF.utm_term, field_value: utmParams.utm_term });
    // TODO: Add GHL custom field IDs for fbclid and gclid when created in GHL

    // Tags: solo new_lead para activar workflows
    const tags = ['new_lead'];

    const payload = {
      locationId,
      firstName,
      lastName,
      email: data.email || '',
      phone: data.telefono || '',
      gender: data.sexo === 'hombre' ? 'male' : data.sexo === 'mujer' ? 'female' : '',
      city: ciudadMap[data.ubicacion] || data.ubicacion || '',
      country: 'Spain',
      tags,
      source: utmParams.utm_source
        ? `Quiz HC - ${utmParams.utm_source}/${utmParams.utm_medium || ''}`
        : 'Quiz Hospital Capilar',
      customFields,
      _agentMessage: agentMessage || '',
      _quizAnswers: quizAnswersText || '',
      _contactScore: contactScore,
      _salesforceData: {
        door: 'quiz_largo',
        ecp: result.ecp,
        sexo: data.sexo || '',
        edad: data.edad || '',
        problema: data.problema || '',
        tiempo: data.tiempo || '',
        probado: data.probado || [],
        motivacion: data.motivacion || '',
        formato: data.formato || '',
        factores_recientes: data.factores_recientes || [],
        ubicacion: data.ubicacion || '',
        consentPrivacidad: !!data.consentPrivacidad,
        consentComunicaciones: !!data.consentComunicaciones,
        utm_source: utmParams.utm_source || '',
        utm_medium: utmParams.utm_medium || '',
        utm_campaign: utmParams.utm_campaign || '',
        utm_content: utmParams.utm_content || '',
        utm_term: utmParams.utm_term || '',
        fbclid: utmParams.fbclid || '',
        gclid: utmParams.gclid || '',
        referrer: document.referrer || '',
        landing_url: window.location.href || '',
        bono_price: bonoPrice,
      },
    };

    console.log('[GHL] Sending payload:', JSON.stringify(payload));

    try {
      const response = await safeFetch('/.netlify/functions/ghl-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { timeoutMs: 20000, retries: 1, label: 'GHL' });
      const responseData = await response.json();
      console.log('[GHL] Response:', response.status, responseData);
      return {
        status: response.ok ? 'ok' : 'error',
        httpStatus: response.status,
        contactId: responseData.contactId || null,
        oppError: responseData.oppError || null,
      };
    } catch (err) {
      console.error('[GHL] Sync error:', err);
      return { status: 'error', error: err.message };
    }
  };

  // ============================================
  // NAVIGATION HANDLERS
  // ============================================
  const handleNext = () => {
    if ((currentQ.microTip || currentQ.microTipFn) && !showMicroTip) {
      setShowMicroTip(true);
      return;
    }
    setShowMicroTip(false);
    if (stepIndex < activeQuestions.length - 1) {
      setStepIndex(prev => prev + 1);
      questionStartTime.current = Date.now();
    } else {
      startAnalysis();
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setShowMicroTip(false);
      analytics.trackBackButtonClicked(currentQ.id, activeQuestions[stepIndex - 1]?.id);
      setStepIndex(prev => prev - 1);
      questionStartTime.current = Date.now();
    } else if (stepIndex === 0 && !skipIntro) {
      setStepIndex(-1);
    }
  };

  const handleAnswer = (value) => {
    const timeSpent = Date.now() - questionStartTime.current;

    if (currentQ.type === 'single') {
      const newAnswers = { ...answers, [currentQ.id]: value };
      setAnswers(newAnswers);

      // Track answer
      analytics.trackQuestionAnswered(currentQ.id, stepIndex, value);
      analytics.trackEvent('question_time', {
        question_id: currentQ.id,
        time_spent_ms: timeSpent,
      });

      // Early disqualification checks
      if (currentQ.id === 'problema' && value === 'cuero-cabelludo') {
        setTimeout(() => setDisqualified({ reason: 'cuero-cabelludo' }), 350);
        return;
      }
      if (currentQ.id === 'diagnostico_previo' && ['frontal-fibrosante', 'areata'].includes(value)) {
        setTimeout(() => setDisqualified({ reason: 'alopecia-rara', tipo: value }), 350);
        return;
      }

      setTimeout(() => {
        setShowMicroTip(false);
        questionStartTime.current = Date.now();
        if (stepIndex < activeQuestions.length - 1) {
          setStepIndex(prev => prev + 1);
        } else {
          startAnalysis();
        }
      }, 350);
    } else if (currentQ.type === 'multiple') {
      let currentArr = answers[currentQ.id] || [];
      const option = currentQ.options.find(o => o.value === value);
      if (option.exclusive) {
        currentArr = [value];
      } else {
        currentArr = currentArr.filter(v => {
          const opt = currentQ.options.find(o => o.value === v);
          return !opt?.exclusive;
        });
        if (currentArr.includes(value)) {
          currentArr = currentArr.filter(v => v !== value);
        } else {
          currentArr = [...currentArr, value];
        }
      }
      setAnswers({ ...answers, [currentQ.id]: currentArr });
    }
  };

  const handleMultipleNext = () => {
    const timeSpent = Date.now() - questionStartTime.current;
    analytics.trackQuestionAnswered(currentQ.id, stepIndex, answers[currentQ.id]);
    analytics.trackEvent('question_time', {
      question_id: currentQ.id,
      time_spent_ms: timeSpent,
    });
    handleNext();
  };

  const startAnalysis = () => {
    processResults(answers);
    setIsAnalyzing(true);
    analytics.trackEvent('analysis_started', { answers_count: Object.keys(answers).length });
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setAnalysisProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsAnalyzing(false);
        setStepIndex(activeQuestions.length);
      }
    }, 40);
  };

  // ============================================
  // TRACK QUESTION VIEWS
  // ============================================
  useEffect(() => {
    if (stepIndex >= 0 && stepIndex < activeQuestions.length) {
      const q = activeQuestions[stepIndex];
      const progressPct = Math.round((stepIndex / activeQuestions.length) * 100);
      const timeInQuiz = quizStartTime.current ? Math.round((Date.now() - quizStartTime.current) / 1000) : 0;
      analytics.trackEvent('screen_viewed', {
        screen_type: q.type === 'form' ? 'contact_form' : q.type === 'info' ? 'social_proof' : 'question',
        screen_id: q.id,
        screen_index: stepIndex,
        total_screens: activeQuestions.length,
        block: q.block,
        progress_pct: progressPct,
        time_in_quiz_seconds: timeInQuiz,
      });
      questionStartTime.current = Date.now();
    } else if (stepIndex === activeQuestions.length && finalResult) {
      analytics.trackEvent('screen_viewed', {
        screen_type: 'results',
        screen_id: 'results',
        frame: finalResult.frame,
        ecp: finalResult.ecp,
        score: finalResult.score,
      });
    }
  }, [stepIndex]);

  // ============================================
  // TRACK CTA CLICKS
  // ============================================
  const handleCTAClick = (ctaType) => {
    const perfil = finalResult ? calculatePerfil(finalResult.score, finalResult.frame) : null;
    analytics.trackEvent('cta_clicked', {
      cta_type: ctaType,
      frame: finalResult?.frame,
      ecp: finalResult?.ecp,
      score: finalResult?.score,
      perfil,
    });

    // When user requests a call, tag + note the contact in GHL
    if (ctaType === 'solicitar_llamada' && ghlContactIdRef.current) {
      const contactId = ghlContactIdRef.current;
      safeFetch('/.netlify/functions/ghl-call-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          ecp: finalResult?.ecp || '',
          nombre: answers.nombre || '',
        }),
      }, { timeoutMs: 10000, retries: 1, label: 'GHL-CallRequest' })
        .catch((err) => console.warn('[GHL-CallRequest] Failed:', err.message));
    }
  };

  // ============================================
  // RETURNING LEAD SCREEN
  // ============================================
  if (returningLead && stepIndex === -1) {
    return (
      <div className="min-h-screen bg-white font-sans text-gray-800 flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: theme.primary }}></div>
        <img src="/logo-hc.png" alt="Hospital Capilar" className="h-14 mb-12" />
        <div className="max-w-xl text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
            ¡Hola de nuevo, {returningLead.nombre.split(' ')[0]}!
          </h1>
          <p className="text-lg text-gray-500 mb-8 leading-relaxed">
            Ya completaste tu test capilar. ¿Qué te gustaría hacer?
          </p>
          <div className="space-y-3">
            <button
              onClick={() => { setReturningLead(null); analytics.trackEvent('returning_lead_action', { action: 'retake' }); }}
              className="w-full py-4 rounded-xl text-white font-bold text-lg shadow-lg hover:-translate-y-1 transition-transform"
              style={{ backgroundColor: theme.primary }}
            >
              Repetir el test capilar
            </button>
            <button
              onClick={() => { handleCTAClick('returning_contact'); }}
              className="w-full py-4 rounded-xl border-2 border-gray-200 text-gray-700 font-bold text-lg hover:bg-gray-50 transition-colors"
            >
              Quiero que me contacten
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PANTALLA DE DESCARTE TEMPRANO
  if (disqualified) {
    const isCueroCabelludo = disqualified.reason === 'cuero-cabelludo';
    return (
      <div className="min-h-screen bg-white font-sans text-gray-800 flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-400"></div>
        <img src="/logo-hc.png" alt="Hospital Capilar" className="h-14 mb-12" />
        <div className="max-w-xl text-center">
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 mb-6">
            <div className="text-4xl mb-4">{isCueroCabelludo ? '🩺' : '📋'}</div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-3">
              {isCueroCabelludo
                ? 'Tu caso requiere atención dermatológica'
                : 'Tu caso requiere seguimiento especializado'}
            </h2>
            <p className="text-gray-600 leading-relaxed">
              {isCueroCabelludo
                ? 'Los problemas del cuero cabelludo (caspa, granos, irritación) requieren un tratamiento dermatológico específico que no ofrecemos en Hospital Capilar. Te recomendamos consultar con un dermatólogo especializado.'
                : `La ${disqualified.tipo === 'frontal-fibrosante' ? 'alopecia frontal fibrosante' : 'alopecia areata'} es una condición que requiere seguimiento por un dermatólogo especializado. En Hospital Capilar no tratamos este tipo de alopecia, pero queremos asegurarnos de que recibas la atención adecuada.`}
            </p>
          </div>
          <p className="text-sm text-gray-400 mb-6">
            Gracias por tu tiempo. Esperamos haberte orientado.
          </p>
          <button
            onClick={() => { setDisqualified(null); setStepIndex(-1); setAnswers({ probado: [], factores_recientes: [], consentPrivacidad: false, consentComunicaciones: false }); }}
            className="text-sm text-gray-500 underline hover:text-gray-700"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // PANTALLA INTRO
  if (stepIndex === -1) {
    const nichoWelcome = nicho ? NICHO_WELCOME[nicho] : null;
    const badgeText = nichoWelcome?.badge || 'Test Capilar Online';
    const headlineMain = nichoWelcome?.headline || 'Descubre si tu caso es';
    const headlineAccent = nichoWelcome?.headlineAccent || 'tratable o quirúrgico';
    const subText = nichoWelcome?.subheadline || 'Responde a este test capilar interactivo (3-4 min). Nuestro sistema evaluará tu nivel de caída y definirá un pre-análisis preciso.';
    const ctaText = nichoWelcome?.cta || 'Iniciar Pre-Análisis';

    return (
      <div className="min-h-screen bg-white font-sans text-gray-800 flex flex-col items-center justify-center p-6 relative">
        <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: theme.primary }}></div>
        <img src="/logo-hc.png" alt="Hospital Capilar" className="h-14 mb-12" />
        <div className="max-w-xl text-center">
          <div className="bg-[#E6F0F0] text-[#2E4C4C] px-4 py-1.5 rounded-full text-sm font-bold mb-6 inline-flex items-center gap-2">
            <Stethoscope size={16} /> {badgeText}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6 leading-tight">
            {headlineMain} <br/>
            <span style={{ color: theme.primary }}>{headlineAccent}</span>
          </h1>
          <p className="text-lg text-gray-500 mb-10 leading-relaxed">
            {subText}
          </p>
          <button
            onClick={() => {
              analytics.trackEvent('screen_viewed', {
                screen_type: 'welcome',
                screen_id: 'welcome',
                nicho: nicho || 'generic',
                device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
                utm_source: utmParams.utm_source || 'direct',
                utm_medium: utmParams.utm_medium || '',
                utm_campaign: utmParams.utm_campaign || '',
              });
              setStepIndex(0);
              quizStartTime.current = Date.now();
              questionStartTime.current = Date.now();
              analytics.trackQuizStarted();
            }}
            className="w-full md:w-auto px-12 py-4 rounded-xl text-white font-bold text-lg shadow-lg hover:-translate-y-1 transition-transform"
            style={{ backgroundColor: theme.primary }}
          >
            {ctaText}
          </button>
          <p className="text-sm text-gray-400 mt-4">3-4 minutos | 100% confidencial | Sin compromiso</p>
        </div>
      </div>
    );
  }

  // PANTALLA ANALISIS
  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: theme.primary }}></div>
          <Dna className="absolute inset-0 m-auto text-gray-400" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Evaluando tu caso...</h2>
        <div className="w-full max-w-xs bg-gray-200 rounded-full h-2 mb-4">
          <div className="h-full rounded-full transition-all duration-75" style={{ width: `${analysisProgress}%`, backgroundColor: theme.primary }}></div>
        </div>
        <p className="text-sm text-gray-500 font-mono">Calculando Score Médico...</p>
      </div>
    );
  }

  // PANTALLA RESULTADOS
  if (finalResult && stepIndex === activeQuestions.length) {
    const { ecp, frame, nombre } = finalResult;
    const isDerivacion = frame === 'DERIVACION';

    // Payment flow overlays
    if (paymentStep === 'paid') {
      return (
        <PaymentConfirmation
          nombre={nombre}
          email={answers.email || ''}
          ubicacion={answers.ubicacion || ''}
          onCallRequest={() => handleCTAClick('solicitar_llamada')}
          bonoPrice={bonoPrice}
        />
      );
    }

    const handleStartPayment = async () => {
      if (paymentStep === 'paying') return; // Prevent double-click
      setPaymentStep('paying');
      try {
        const res = await safeFetch('/.netlify/functions/stripe-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: answers.email || '',
            nombre: answers.nombre || nombre || '',
            contactId: ghlContactIdRef.current || '',
            ecp: finalResult?.ecp || '',
            ubicacion: answers.ubicacion || '',
            amount: bonoPrice * 100,
          }),
        }, { timeoutMs: 15000, retries: 0, label: 'Stripe' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error('No checkout URL');
      } catch (err) {
        console.error('[Stripe] Checkout error, using fallback:', err);
        window.location.href = `${STRIPE_CHECKOUT_URL}?prefilled_email=${encodeURIComponent(answers.email || '')}`;
      }
    };

    const perfil = calculatePerfil(finalResult.score, frame);
    const cta = getCTAConfig(ecp, perfil, frame);
    const ctaType = cta.primary.type;
    const isAmber = cta.primary.style === 'amber';
    const IconMap = { Calendar, PhoneCall, Download, MapPin, FileText };
    const PrimaryIcon = IconMap[cta.primary.icon] || ChevronRight;
    const firstName = nombre.split(' ')[0];

    const WA_PHONE = '34623457218';
    const refCode = (analytics.sessionId || '').slice(-6).toUpperCase();
    const waText = encodeURIComponent(
      `Hola, soy ${firstName}. Acabo de completar el test capilar online en Hospital Capilar (ref: ${refCode}). Me gustaría recibir más información sobre mi caso.`
    );
    const waUrl = `https://wa.me/${WA_PHONE}?text=${waText}`;

    const handlePrimaryClick = () => {
      if (ctaType === 'whatsapp') {
        window.location.href = waUrl;
      }
      handleCTAClick(ctaType);
      if (ctaType === 'pagar_bono') {
        handleStartPayment();
      }
    };

    const handleSecondaryClick = () => {
      if (cta.secondary.type === 'whatsapp') {
        window.location.href = waUrl;
      }
      handleCTAClick(cta.secondary.type);
    };

    const objections = OBJECTIONS_BY_ECP[ecp] || [];
    const testimonials = TESTIMONIALS_BY_ECP[ecp] || [];
    const includedItems = INCLUDED_BY_CTA[ctaType] || INCLUDED_BY_CTA['solicitar_llamada'];
    const faqs = FAQS_BY_CTA[ctaType] || FAQS_BY_CTA['solicitar_llamada'];

    // ECP-specific subtitle for the header (JSX so we can bold the product name)
    const highlight = (txt) => <strong className="font-bold text-gray-900">{txt}</strong>;
    const ecpSubtitles = {
      '¿Qué Me Pasa?': <>Google no puede diagnosticarte. Solo un {highlight('analítica de perfil hormonal')} te dice exactamente qué ocurre.</>,
      'Es Normal': <>Tu caída puede tener causa hormonal. Solo un {highlight('analítica de perfil hormonal')} especializado puede confirmarlo.</>,
      'El Espejo': <>Actuar temprano es la mejor decisión. Un {highlight('analítica de perfil hormonal')} te dice exactamente qué tienes.</>,
      'Ya Me Engañaron': <>Entendemos tus dudas. Hospital Capilar es un centro médico, no un centro estético.</>,
      'La Inversión': <>Tu trasplante necesita un plan de mantenimiento para proteger los resultados.</>,
      'Lo Que Vino Con el Bebé': <>Tu caso necesita un {highlight('analítica de perfil hormonal')}: mide tus hormonas postparto y las cruza con un estudio capilar completo para identificar la causa real.</>,
      'La Farmacia': <>Sin saber la causa, cualquier producto es una apuesta. Un {highlight('analítica de perfil hormonal')} te dice exactamente qué necesitas.</>,
    };

    return (
      <>
      {paymentStep === 'paying' && (
        <div className="fixed inset-0 z-50 bg-[#F7F8FA] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-[#4CA994] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Redirigiendo al pago seguro...</p>
          </div>
        </div>
      )}
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
              {firstName}, {isDerivacion ? 'esto es lo que hemos encontrado' : 'descubre qué le pasa a tu pelo'}
            </h2>
            <p className="text-gray-700 text-base md:text-lg font-medium leading-relaxed max-w-md mx-auto">
              {isDerivacion
                ? 'Basado en tus respuestas, este es nuestro análisis.'
                : ecpSubtitles[ecp] || 'Basado en tus respuestas, este es nuestro análisis.'}
            </p>
          </div>

          {/* Objections section */}
          {objections.length > 0 && (
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
          )}

          {/* Video testimonial — right after objections (only for payment CTA) */}
          {ctaType === 'pagar_bono' && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 text-center">Conoce Hospital Capilar</h3>
              <div className="rounded-2xl overflow-hidden shadow-sm bg-black aspect-[9/16] max-h-[360px] mx-auto" style={{ maxWidth: '200px' }}>
                <iframe
                  src="https://www.youtube.com/embed/pbJOQYupwFE"
                  title="Hospital Capilar"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            </div>
          )}

          {/* What's included */}
          {!isDerivacion && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                {ctaType === 'pagar_bono' ? 'Lo que incluye tu analítica' : 'Lo que haremos por ti'}
              </h3>
              <div className="space-y-1.5">
                {includedItems.map((text, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 px-3 py-2.5 flex items-center gap-2.5 shadow-sm">
                    <div className="w-6 h-6 bg-[#F0F7F6] rounded-md flex items-center justify-center shrink-0">
                      <Check size={14} className="text-[#4CA994]" />
                    </div>
                    <span className="text-gray-800 text-[13px] font-medium leading-snug">{text}</span>
                  </div>
                ))}
              </div>
              {ctaType === 'pagar_bono' && (
                <p className="text-center text-xs text-gray-500 mt-3">
                  <span aria-hidden="true">⚠️</span> <strong className="text-gray-700">Todo en el mismo día</strong> · sin esperas ni vueltas
                </p>
              )}
            </div>
          )}

          {/* Price card (only for payment CTA) */}
          {ctaType === 'pagar_bono' && (
            <div className="bg-white rounded-2xl border-2 border-[#4CA994] p-5 pt-7 mb-4 shadow-sm relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2C3E50] text-white text-xs font-extrabold uppercase tracking-wider px-4 py-1.5 rounded-full flex items-center gap-1 whitespace-nowrap shadow-md">
                <Sparkles size={12} fill="currentColor" />
                <span>Oferta limitada</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* En clínica */}
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Reservando en clínica</p>
                  <div className="text-2xl font-bold text-gray-400 line-through">{ORIGINAL_PRICE}€</div>
                </div>
                {/* Online */}
                <div className="text-center border-l border-gray-200 pl-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4CA994] mb-1">Reservando online</p>
                  <div className="text-3xl font-extrabold text-gray-900 leading-none">{bonoPrice}€</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-center gap-2">
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-md">Ahorra {DISCOUNT_PCT}% reservando online</span>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">Pago único · Se descuenta si inicias tratamiento</p>
            </div>
          )}

          {/* Countdown — "oferta limitada" running clock */}
          {ctaType === 'pagar_bono' && (
            <div className="flex items-center justify-center gap-2 bg-white rounded-full border border-gray-200 px-4 py-2 mb-6 mx-auto w-fit shadow-sm">
              <Clock size={14} className="text-[#2C3E50]" />
              <span className="text-xs font-semibold text-gray-700">Oferta limitada:</span>
              <span className="text-sm font-extrabold text-[#2C3E50] tabular-nums">{countdownDisplay}</span>
            </div>
          )}

          {/* CTA info card (for non-payment CTAs) */}
          {ctaType !== 'pagar_bono' && (
            <div className={`bg-white rounded-2xl border-2 ${isAmber ? 'border-amber-300' : 'border-[#4CA994]'} p-5 mb-6 shadow-sm relative`}>
              {cta.primary.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 ${isAmber ? 'bg-amber-600' : 'bg-[#4CA994]'} text-white text-xs font-bold px-4 py-1 rounded-full`}>
                  {cta.primary.badge}
                </div>
              )}
              <div className={cta.primary.badge ? 'pt-2' : ''}>
                <h4 className={`font-bold text-lg ${isAmber ? 'text-amber-900' : 'text-gray-900'} mb-1`}>{cta.heading}</h4>
                <p className={`text-sm ${isAmber ? 'text-amber-800' : 'text-gray-600'}`}>{cta.description}</p>
              </div>
            </div>
          )}

          {/* Testimonials */}
          {testimonials.length > 0 && (
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
          )}

          {/* FAQ */}
          {faqs.length > 0 && (
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
          )}

          {/* Trust footer */}
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-6 text-gray-400 text-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} />
                <span>100% confidencial</span>
              </div>
              <div className="flex items-center gap-2">
                <Stethoscope size={16} />
                <span>Centro médico</span>
              </div>
            </div>
            {ctaType === 'pagar_bono' && (
              <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-2">
                <Lock size={12} /> Pago 100% seguro con Stripe
              </p>
            )}
          </div>
        </div>

        {/* Sticky CTA — fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-3 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="max-w-lg mx-auto">
            <button
              onClick={handlePrimaryClick}
              className={`w-full font-bold text-lg py-4 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 ${
                isAmber
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-[#4CA994] hover:bg-[#3d9480] text-white'
              }`}
            >
              {cta.primary.label} <PrimaryIcon size={18} />
            </button>
            {cta.secondary && (
              <button
                onClick={handleSecondaryClick}
                className={`w-full text-center text-sm mt-2 py-1 transition-colors flex items-center justify-center gap-1 ${
                  cta.secondary.type === 'whatsapp'
                    ? 'text-[#25D366] hover:text-[#1da851]'
                    : 'text-gray-500 hover:text-[#4CA994]'
                }`}
              >
                {cta.secondary.icon === 'WhatsApp' ? <WhatsAppIcon size={14} /> : null}
                {cta.secondary.label}
                {cta.secondary.icon !== 'WhatsApp' && (() => { const SI = IconMap[cta.secondary.icon] || ChevronRight; return <SI size={14} />; })()}
              </button>
            )}
          </div>
        </div>
      </div>
      </>
    );
  }

  // PREGUNTAS
  const progress = (stepIndex / activeQuestions.length) * 100;

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col relative overflow-hidden">

      {/* MICRO-TIP OVERLAY */}
      {showMicroTip && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#F0F7F6] border-2 border-[#4CA994]/20 p-8 rounded-3xl shadow-xl text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Info size={32} style={{ color: theme.primary }} />
            </div>
            <h3 className="text-xl font-bold text-[#2C3E50] mb-4">¿Sabías que...?</h3>
            <p className="text-[#405B5B] text-lg leading-relaxed mb-8">{currentQ.microTipFn ? currentQ.microTipFn(answers) : currentQ.microTip}</p>
            <button
              onClick={handleNext}
              className="w-full py-4 rounded-xl text-white font-bold text-lg shadow-md hover:opacity-90 transition-opacity"
              style={{ backgroundColor: theme.primary }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-gray-100 fixed top-0 z-40">
        <div className="h-full transition-all duration-500 ease-out" style={{ width: `${progress}%`, backgroundColor: theme.primary }}></div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-5 pt-8 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 p-1.5 -ml-1.5 rounded-full hover:bg-gray-50">
            <ArrowLeft size={20} />
          </button>
          <img src="/logo-hc.png" alt="Hospital Capilar" className="h-6" />
          <div className="w-8" />
        </div>

        {/* INFO SCREEN TYPE — social proof / breathing room */}
        {currentQ.type === 'info' && (() => {
          const info = currentQ.infoContentFn ? currentQ.infoContentFn(answers) : currentQ.infoContent;
          const IconComponent = info.icon === 'heart' ? Heart : info.icon === 'star' ? Star : Sparkles;
          return (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2 -mt-4">
              <div className="w-16 h-16 bg-[#F0F7F6] rounded-full flex items-center justify-center mx-auto mb-5 shadow-sm">
                <IconComponent size={30} className="text-[#4CA994]" fill={info.icon === 'star' ? '#4CA994' : 'none'} />
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-[#2C3E50] mb-3 leading-tight">{info.headline}</h2>
              {info.body && <p className="text-gray-500 text-[15px] leading-relaxed mb-6 max-w-md">{info.body}</p>}

              {/* Stats row */}
              {info.stats && (
                <div className="grid grid-cols-3 gap-4 w-full max-w-sm mb-6">
                  {info.stats.map((s, i) => (
                    <div key={i} className="text-center">
                      <div className="text-xl font-extrabold text-[#4CA994]">{s.value}</div>
                      <div className="text-xs text-gray-400 font-medium mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Single image */}
              {info.image && (
                <div className="w-full max-w-sm rounded-2xl overflow-hidden mb-6 shadow-md">
                  <img src={info.image} alt={info.imageAlt || ''} className="w-full h-48 object-cover" loading="lazy" />
                </div>
              )}

              {/* Gallery */}
              {info.gallery && (
                <div className="grid grid-cols-3 gap-2 w-full max-w-md mb-6">
                  {info.gallery.map((img, i) => (
                    <div key={i} className="rounded-xl overflow-hidden aspect-square shadow-sm">
                      <img src={img.src} alt={img.alt} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ))}
                </div>
              )}

              {/* Testimonial */}
              {info.testimonial && (
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 w-full max-w-md mb-6 text-left">
                  <div className="flex gap-0.5 mb-2">
                    {Array.from({ length: info.testimonial.stars }).map((_, j) => (
                      <Star key={j} size={16} className="text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 leading-relaxed italic text-[15px] mb-3">"{info.testimonial.text}"</p>
                  <p className="text-sm font-bold text-gray-900">{info.testimonial.name}, {info.testimonial.age} años</p>
                </div>
              )}

              {/* Video testimonial — for mujeres */}
              {info.videoTestimonial && (
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 w-full max-w-md mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-bold text-sm text-gray-900">{info.videoTestimonial.name}</span>
                    <span className="text-gray-400 text-xs">{info.videoTestimonial.label}</span>
                    <div className="flex gap-0.5 ml-auto">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} size={14} className="text-yellow-400 fill-yellow-400" />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[300px] mx-auto" style={{ maxWidth: '170px' }}>
                    <video
                      src={info.videoTestimonial.src}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleNext}
                className="w-full max-w-md py-3.5 rounded-xl text-white font-bold text-base shadow-lg hover:-translate-y-0.5 transition-transform"
                style={{ backgroundColor: theme.primary }}
              >
                {info.cta} <ChevronRight size={18} className="inline ml-1 -mt-0.5" />
              </button>
            </div>
          );
        })()}

        {currentQ.type !== 'form' && currentQ.type !== 'info' && (
          <>
            <div className="mb-5">
              <span className="text-xs font-bold tracking-wider text-[#4CA994] uppercase mb-1.5 block">
                Fase {currentQ.block} de 4
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 leading-tight">
                {currentQ.title}
              </h2>
              {currentQ.subtitle && <p className="text-gray-500 text-sm">{currentQ.subtitle}</p>}
            </div>

            <div className="grid gap-2 mb-4">
              {(currentQ.optionsFn ? currentQ.optionsFn(answers) : currentQ.options).map((option, idx) => {
                const isSelected = currentQ.type === 'single'
                  ? answers[currentQ.id] === option.value
                  : (answers[currentQ.id] || []).includes(option.value);
                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(option.value)}
                    className={`group flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all duration-200 text-left ${
                      isSelected ? 'border-[#4CA994] bg-[#F0F7F6]' : 'border-gray-100 hover:border-[#4CA994]/50 hover:bg-gray-50'
                    }`}
                  >
                    {option.icon && <span className="text-xl w-7 text-center">{option.icon}</span>}
                    <span className={`flex-1 font-semibold text-[15px] ${isSelected ? 'text-[#2C3E50]' : 'text-gray-700'}`}>
                      {option.label}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-[#4CA994] bg-[#4CA994]' : 'border-gray-300'
                    }`}>
                      {isSelected && <CheckCircle2 size={13} className="text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {currentQ.type === 'multiple' && (answers[currentQ.id] && answers[currentQ.id].length > 0) && (
              <button
                onClick={handleMultipleNext}
                className="w-full py-3.5 rounded-xl text-white font-bold text-base mt-2 shadow-lg hover:-translate-y-0.5 transition-transform"
                style={{ backgroundColor: theme.primary }}
              >
                Siguiente Pregunta <ChevronRight size={18} className="inline ml-1 -mt-0.5" />
              </button>
            )}
          </>
        )}

        {currentQ.type === 'form' && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1 leading-tight">{currentQ.title}</h2>
            <p className="text-gray-500 text-sm mb-5">{currentQ.subtitle}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre completo <span className="text-red-500">*</span></label>
                <input type="text" value={answers.nombre || ''} onChange={(e) => setAnswers({...answers, nombre: e.target.value})}
                  onFocus={() => analytics.trackEvent('form_field_focused', { field: 'nombre' })}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#4CA994] outline-none text-sm" placeholder="Ej: Carlos García" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" value={answers.email || ''} onChange={(e) => setAnswers({...answers, email: e.target.value})}
                  onFocus={() => analytics.trackEvent('form_field_focused', { field: 'email' })}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-[#4CA994] outline-none text-sm" placeholder="correo@ejemplo.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Teléfono <span className="text-red-500">*</span></label>
                <PhoneInput
                  value={answers.telefono || ''}
                  onChange={(phone) => setAnswers({...answers, telefono: phone})}
                  onFocus={() => analytics.trackEvent('form_field_focused', { field: 'telefono' })}
                  required
                  inputClassName="p-3 focus:border-[#4CA994]"
                  placeholder="612 345 678"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">¿Cerca de qué clínica te queda mejor? <span className="text-red-500">*</span></label>
                <select className="w-full p-3 border-2 border-gray-200 rounded-xl bg-white focus:border-[#4CA994] outline-none text-sm font-medium"
                  onChange={(e) => setAnswers({...answers, ubicacion: e.target.value})} value={answers.ubicacion || ''}>
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
              </div>
              <div className="space-y-2 mt-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={answers.consentPrivacidad || false} onChange={e => setAnswers({...answers, consentPrivacidad: e.target.checked})}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#4CA994] focus:ring-[#4CA994]" />
                  <span className="text-xs text-gray-500">Acepto la <a href="https://hospitalcapilar.com/politica-de-privacidad" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: theme.primary }}>política de privacidad</a> <span className="text-red-500">*</span></span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={answers.consentComunicaciones || false} onChange={e => setAnswers({...answers, consentComunicaciones: e.target.checked})}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#4CA994] focus:ring-[#4CA994]" />
                  <span className="text-xs text-gray-500">Acepto recibir comunicaciones sobre tratamientos capilares</span>
                </label>
              </div>
              <button
                onClick={() => {
                  analytics.trackQuizCompleted(answers);
                  analytics.trackEvent('form_submitted', {
                    has_name: !!answers.nombre,
                    has_email: !!answers.email,
                    has_phone: !!answers.telefono,
                    ubicacion: answers.ubicacion,
                    sexo: answers.sexo || null,
                  });
                  if (answers.email) {
                    analytics.trackEvent('$identify', { email: answers.email, name: answers.nombre });
                  }
                  startAnalysis();
                }}
                disabled={!answers.ubicacion || !answers.nombre || !answers.email || !answers.telefono || !answers.consentPrivacidad}
                className="w-full py-3.5 rounded-xl text-white font-bold text-base shadow-lg mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{ backgroundColor: theme.primary }}
              >
                Ver mi test capilar <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 text-center border-t border-gray-100 bg-gray-50 flex justify-center gap-6">
        <p className="text-xs text-gray-400 font-medium flex items-center gap-1"><ShieldCheck size={14}/> 100% Confidencial</p>
        <p className="text-xs text-gray-400 font-medium flex items-center gap-1"><Stethoscope size={14}/> Valoración Médica</p>
      </div>
    </div>
  );
};

export default HospitalCapilarQuiz;

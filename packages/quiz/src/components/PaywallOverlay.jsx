import React, { useState, useEffect, useMemo } from 'react';
import { Check, X, Star, ChevronDown, Lock, Phone, Clock, FlaskConical, Microscope, Stethoscope } from 'lucide-react';
import HCHeader from './HCHeader';

const TESTIMONIALS_BY_ECP = {
  'Es Normal': [
    { name: 'Laura M.', age: 52, text: 'Desde la menopausia se me caía a puñados. Mi médica decía que era normal. En HC cruzaron mi perfil hormonal con tricoscopía y encontraron la causa real.', stars: 5 },
    { name: 'Patricia G.', age: 48, text: 'Llevaba un año con caída brutal. Me dijeron que era por la edad. En HC descubrieron un desbalance hormonal tratable.', stars: 5 },
  ],
  'Lo Que Vino Con el Bebé': [
    { name: 'Elena R.', age: 32, text: 'Después del parto se me caía a puñados. 8 meses después seguía igual. En HC descubrieron AGA subyacente. Gracias a actuar a tiempo estoy recuperando densidad.', stars: 5 },
    { name: 'Sofía T.', age: 29, text: 'Creía que nunca iba a volver a tener mi pelo de antes. El test en HC me tranquilizó: era efluvio temporal. Me dieron un plan y en 4 meses estaba como antes.', stars: 5 },
  ],
  '¿Qué Me Pasa?': [
    { name: 'María J.', age: 35, text: 'No sabía si era estrés o algo peor. Google me asustaba. En HC en 30 minutos supe exactamente qué tenía y qué hacer.', stars: 5 },
    { name: 'Pablo R.', age: 31, text: 'Llevaba meses preocupado sin saber a quién ir. El test me quitó todas las dudas. Era mucho menos grave de lo que pensaba.', stars: 5 },
  ],
  'La Farmacia': [
    { name: 'Carlos M.', age: 38, text: 'Llevaba 3 años gastando en Olistic, champús, minoxidil. €800 tirados. En HC descubrieron que mi alopecia era mixta. En 6 meses noté la diferencia.', stars: 5 },
    { name: 'Andrea L.', age: 33, text: 'Probé todo lo de la farmacia durante 2 años. Nada. En HC me dijeron exactamente por qué no funcionaba y qué sí iba a funcionar.', stars: 5 },
  ],
  'Protocolo Mujer': [
    { name: 'Laura M.', age: 52, text: 'Desde la menopausia se me caía a puñados. Mi médica decía que era normal. En HC cruzaron mi perfil hormonal con tricoscopía y encontraron la causa real.', stars: 5 },
    { name: 'Elena R.', age: 32, text: 'Después del parto se me caía a puñados. 8 meses después seguía igual. En HC descubrieron AGA subyacente. Actué a tiempo y estoy recuperando densidad.', stars: 5 },
    { name: 'Patricia G.', age: 48, text: 'Llevaba un año con caída brutal. En IMD me vendieron láser sin diagnosticar. En HC hicieron analítica completa y encontraron SOP. Ese era el problema real.', stars: 5 },
  ],
};

const OBJECTIONS = {
  'Es Normal': [
    { myth: 'No sé si mi caída tiene solución', truth: 'El Protocolo Femenino Trichometabolic te da la respuesta en 30 minutos con tricoscopía + analítica completa de 27 biomarcadores.' },
    { myth: 'Ya fui a otro médico y no me dijeron nada', truth: 'Nuestro equipo médico especializado en salud capilar femenina cruza tu perfil hormonal con un estudio capilar completo. Nadie más los mira juntos.' },
    { myth: 'Es muy caro para no saber si funciona', truth: null }, // dynamic — uses bonoPrice (Trichometabolic truth applied via helper)
  ],
  'Lo Que Vino Con el Bebé': [
    { myth: 'Me dicen que es normal y que se pasará solo', truth: 'En el 70% de casos sí. Pero si hay AGA subyacente, cada mes sin actuar es pelo que no vuelve.' },
    { myth: 'Mi ginecóloga no le da importancia', truth: 'Los ginecólogos se centran en hormonas. El Protocolo Femenino Trichometabolic cruza tu perfil hormonal con un estudio capilar completo para encontrar la causa real.' },
    { myth: 'Es muy caro para no saber si funciona', truth: null }, // dynamic — uses bonoPrice (Trichometabolic truth applied via helper)
  ],
  '¿Qué Me Pasa?': [
    { myth: 'Seguro que no es nada, ya se pasará', truth: 'Puede ser estrés temporal… o el inicio de una alopecia. Solo un test capilar profesional te saca de dudas.' },
    { myth: 'Busqué en Google y me asusté más', truth: 'Internet no puede diagnosticarte. Una tricoscopia + analítica en 30 minutos te da la respuesta real.' },
    { myth: 'No sé si ir al dermatólogo o a una clínica capilar', truth: 'Un centro especializado combina microscopio + analítica + médico. Es el test más completo para caída capilar.' },
  ],
  'La Farmacia': [
    { myth: 'Si el minoxidil no funciona, no hay nada que hacer', truth: 'El 60% no responde a minoxidil sin saber la causa. No es que no funcione — es que puede no ser lo que necesitas.' },
    { myth: 'Los suplementos deberían ser suficientes', truth: 'Olistic, Iraltone, Pilexil… pueden complementar, pero sin saber la causa es tirar dinero.' },
    { myth: 'Ya me gasté demasiado, para qué gastar más', truth: null }, // dynamic — uses bonoPrice
  ],
  'Protocolo Mujer': [
    { myth: 'Me dicen que es normal y que se pasará solo', truth: 'En el 80% de los casos, la caída capilar femenina tiene causa médica. En una sola visita realizamos un estudio clínico completo para detectar exactamente qué está causando tu caída capilar y diseñar un tratamiento con resultados reales.' },
    { myth: 'Las clínicas capilares son para hombres', truth: 'Trichometabolic está diseñado específicamente para la caída capilar femenina. Contamos con una unidad médica especializada en mujer, porque el cabello femenino tiene causas y tratamientos distintos.' },
    { myth: 'Es muy caro para no saber si funciona', truth: null }, // dynamic — uses bonoPrice (hardcoded Trichometabolic truth below)
  ],
};

const getfaqs = (price) => [
  { q: '¿Qué incluye exactamente la analítica?', a: 'Todo en el mismo día: tricoscopia digital (microscopio capilar de alta resolución), analítica completa personalizada (perfil hormonal + serología + hemograma completo), valoración con médico especialista (30 min), pauta médica con receta si fuera necesario e informe personalizado con plan de tratamiento.' },
  { q: `¿Por qué se paga por adelantado?`, a: `Reservamos 30 minutos de tiempo médico exclusivo y una analítica de laboratorio a tu nombre. El pago por adelantado garantiza tu plaza y nos permite preparar tu caso antes de la cita.` },
  { q: `¿Los ${price}€ se descuentan si hago tratamiento?`, a: `Sí. Si decides iniciar tratamiento en Hospital Capilar, los ${price}€ del test se descuentan íntegros del coste.` },
  { q: '¿Me van a intentar vender algo?', a: 'No. Nuestros médicos te dan un informe objetivo (microscopio + analítica) y te explican tus opciones. Si no necesitas tratamiento, te lo decimos.' },
];

const ORIGINAL_PRICE = 195;

// Female ECPs use the Trichometabolic product branding (per María 2026-04-23):
// "Protocolo Femenino Trichometabolic" / "diagnóstico Trichometabolic" with 27 biomarcadores.
const FEMALE_ECPS = new Set(['Protocolo Mujer', 'Lo Que Vino Con el Bebé', 'Es Normal']);

const PaywallOverlay = ({ ecp, nombre, onPay, onClose, onCallRequest, bonoPrice = 125, brandHeader = false }) => {
  const [openFaq, setOpenFaq] = useState(null);
  const [paying, setPaying] = useState(false);
  const handlePayClick = async () => {
    if (paying) return;
    setPaying(true);
    try { await onPay?.(); } finally {
      // Re-enable after 20s in case redirect didn't fire (network failure)
      setTimeout(() => setPaying(false), 20000);
    }
  };
  const testimonials = TESTIMONIALS_BY_ECP[ecp] || TESTIMONIALS_BY_ECP['Es Normal'];
  const discountPct = Math.round(((ORIGINAL_PRICE - bonoPrice) / ORIGINAL_PRICE) * 100);
  const isTrichometabolic = FEMALE_ECPS.has(ecp);

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
    const intv = setInterval(() => setCountdownSeconds(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(intv);
  }, []);
  const countdownDisplay = `${String(Math.floor(countdownSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((countdownSeconds % 3600) / 60)).padStart(2, '0')}:${String(countdownSeconds % 60).padStart(2, '0')}`;
  const dynamicTruth = 'Pagar tratamientos sin saber la causa es lo realmente caro. El test te dice qué necesitas (y qué no) en 30 minutos.';
  const dynamicOtcTruth = 'Justo por eso. Un test médico te quita las dudas para no seguir gastando en lo que ya sabes que no funciona.';
  const dynamicTrichometabolicTruth = 'El problema no es probar otro tratamiento. Es seguir probándolos sin conocer la causa. El diagnóstico te da la respuesta antes de gastar más.';
  const rawObjections = OBJECTIONS[ecp] || OBJECTIONS['Es Normal'];
  const objections = rawObjections.map(obj => ({
    ...obj,
    truth: obj.truth ?? (isTrichometabolic ? dynamicTrichometabolicTruth : obj.myth.includes('gasté') ? dynamicOtcTruth : dynamicTruth),
  }));
  const faqs = getfaqs(bonoPrice);
  const firstName = (nombre || 'Paciente').split(' ')[0];

  return (
    <div className="fixed inset-0 z-50 bg-[#F7F8FA] overflow-y-auto">
      {/* Top header — HC brand (standalone) or green preanalysis banner (in-quiz) */}
      {brandHeader ? (
        <HCHeader />
      ) : (
        <div className="bg-[#4CA994] text-white text-center py-3 px-4 text-sm font-semibold sticky top-0 z-10">
          Tu pre-análisis personalizado está listo
        </div>
      )}

      <div className="max-w-lg md:max-w-2xl mx-auto px-4 md:px-8 pb-40">
        {/* Close button — only when onClose is provided (hidden on standalone paywall) */}
        {onClose && (
          <div className="flex justify-end pt-3 pb-1">
            <button onClick={onClose} className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-200">
              <X size={16} className="text-gray-500" />
            </button>
          </div>
        )}

        {/* Header */}
        <div className={`text-center pb-6 ${onClose ? '' : 'pt-8 md:pt-10'}`}>
          <h2 className="text-2xl md:text-4xl font-extrabold text-gray-900 mb-4 md:mb-6 leading-tight">
            <span className="text-[#4CA994]">{firstName},</span> deja de adivinar qué le pasa a tu pelo. <span className="text-[#4CA994]">Descúbrelo.</span>
          </h2>
          <div className="max-w-md md:max-w-xl mx-auto">
            <p className="text-gray-700 text-base md:text-lg font-medium leading-relaxed">
              La caída capilar no tiene una única causa. Es <strong className="font-bold text-gray-900">multifactorial</strong>:
            </p>
            <div className="flex flex-wrap justify-center gap-2 my-3 md:my-4">
              <span className="bg-white border border-gray-200 text-gray-700 text-xs md:text-sm font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-sm">Estrés</span>
              <span className="bg-white border border-gray-200 text-gray-700 text-xs md:text-sm font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-sm">Desajustes hormonales</span>
              <span className="bg-white border border-gray-200 text-gray-700 text-xs md:text-sm font-semibold px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-sm">Déficits nutricionales</span>
            </div>
            <p className="text-gray-700 text-base md:text-lg font-medium leading-relaxed">
              Por eso los tratamientos genéricos <strong className="font-bold text-gray-900">fallan</strong>.
            </p>
          </div>
          <div className="flex items-center gap-3 max-w-md md:max-w-xl mx-auto my-5 md:my-7">
            <div className="flex-1 h-px bg-gray-200" />
            <p className="text-xs md:text-sm text-[#4CA994] font-extrabold uppercase tracking-wider whitespace-nowrap">Necesitas precisión</p>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="max-w-md md:max-w-xl mx-auto">
            <p className="text-gray-700 text-base md:text-lg font-medium leading-relaxed mb-4 md:mb-5">
              Con el <strong className="font-bold text-gray-900">Protocolo Femenino Trichometabolic</strong> identificamos el origen real de tu caída:
            </p>
            <div className="grid grid-cols-3 gap-2 md:gap-4">
              <div className="bg-white rounded-xl border border-gray-100 p-3 md:p-5 shadow-sm flex flex-col items-center text-center">
                <div className="w-9 h-9 md:w-12 md:h-12 bg-[#F0F7F6] rounded-lg flex items-center justify-center mb-2 md:mb-3">
                  <FlaskConical className="text-[#4CA994] w-[18px] h-[18px] md:w-6 md:h-6" />
                </div>
                <p className="text-[12px] md:text-sm font-bold text-gray-900 leading-tight">27 biomarcadores</p>
                <p className="text-[11px] md:text-xs text-gray-500 leading-tight mt-0.5">Analítica hormonal</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-3 md:p-5 shadow-sm flex flex-col items-center text-center">
                <div className="w-9 h-9 md:w-12 md:h-12 bg-[#F0F7F6] rounded-lg flex items-center justify-center mb-2 md:mb-3">
                  <Microscope className="text-[#4CA994] w-[18px] h-[18px] md:w-6 md:h-6" />
                </div>
                <p className="text-[12px] md:text-sm font-bold text-gray-900 leading-tight">Tricoscopía</p>
                <p className="text-[11px] md:text-xs text-gray-500 leading-tight mt-0.5">Alta precisión</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-3 md:p-5 shadow-sm flex flex-col items-center text-center">
                <div className="w-9 h-9 md:w-12 md:h-12 bg-[#F0F7F6] rounded-lg flex items-center justify-center mb-2 md:mb-3">
                  <Stethoscope className="text-[#4CA994] w-[18px] h-[18px] md:w-6 md:h-6" />
                </div>
                <p className="text-[12px] md:text-sm font-bold text-gray-900 leading-tight">Valoración</p>
                <p className="text-[11px] md:text-xs text-gray-500 leading-tight mt-0.5">Médica especialista</p>
              </div>
            </div>
          </div>
          <div className="mt-5 md:mt-7 inline-flex items-center gap-1.5 md:gap-2 bg-[#F0F7F6] text-[#2C3E50] text-[11px] md:text-xs font-bold uppercase tracking-wider px-3 md:px-4 py-1.5 md:py-2 rounded-full">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-[#4CA994] rounded-full" />
            Especialistas capilares · España
          </div>
        </div>

        {/* Video testimonial — right after hero (Especialistas chip) */}
        <div className="mb-6 md:mb-8">
          <h3 className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 md:mb-4 text-center">Conoce Hospital Capilar</h3>
          <div className="rounded-2xl overflow-hidden shadow-sm bg-black aspect-[9/16] max-h-[360px] md:max-h-[420px] mx-auto max-w-[200px] md:max-w-[240px]">
            <iframe
              src="https://www.youtube.com/embed/pbJOQYupwFE"
              title="Hospital Capilar"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </div>

        {/* Objections section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 md:p-7 mb-6 md:mb-8 shadow-sm">
          <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-1">
            ¿Te sientes así? <span className="text-[#4CA994]">Tenemos la respuesta.</span>
          </h3>
          <div className="space-y-4 md:space-y-5 mt-4">
            {objections.map((obj, i) => (
              <div key={i} className="flex gap-3 md:gap-4">
                <div className="w-6 h-6 md:w-7 md:h-7 bg-red-50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <X className="text-red-400 w-[14px] h-[14px] md:w-4 md:h-4" />
                </div>
                <div>
                  <p className="text-gray-400 text-sm md:text-base line-through">"{obj.myth}"</p>
                  <p className="text-gray-800 text-sm md:text-base font-medium mt-0.5">{obj.truth}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What's included */}
        <div className="mb-6 md:mb-8">
          <h3 className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 md:mb-4">
            {isTrichometabolic ? 'Lo que incluye tu Protocolo Femenino Trichometabolic' : 'Lo que incluye tu test capilar'}
          </h3>
          <div className="space-y-1.5 md:space-y-2">
            {(isTrichometabolic
              ? [
                  'Estudio capilar con tricoscopía de alta precisión',
                  'Analítica completa con 27 biomarcadores clave que influyen directamente en la salud capilar: perfil hormonal femenino + función tiroidea + serología + hemograma completo + regulación metabólica + estado nutricional',
                  'Valoración con médico capilar especialista + informe personalizado',
                  'Plan de tratamiento médico a medida para frenar la caída capilar con pauta médica en la primera visita',
                ]
              : [
                  'Tricoscopia digital con microscopio de alta resolución',
                  'Analítica completa personalizada: perfil hormonal + serología + hemograma completo',
                  'Pauta médica con receta incluida en la primera consulta si fuera necesario',
                  'Valoración con médico especialista + informe personalizado con plan de tratamiento',
                ]
            ).map((text, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 px-3 md:px-4 py-2.5 md:py-3.5 flex items-start gap-2.5 md:gap-3 shadow-sm">
                <div className="w-6 h-6 md:w-7 md:h-7 bg-[#F0F7F6] rounded-md flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="text-[#4CA994] w-[14px] h-[14px] md:w-4 md:h-4" />
                </div>
                <span className="text-gray-800 text-[13px] md:text-[15px] font-medium leading-snug">{text}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-xs md:text-sm text-gray-500 mt-3 md:mt-4">
            <span aria-hidden="true">⚠️</span> <strong className="text-gray-700">Todo en el mismo día</strong> · sin esperas ni vueltas
          </p>
        </div>

        {/* Price card */}
        <div className="bg-white rounded-2xl border-2 border-[#4CA994] p-5 md:p-7 pt-7 md:pt-9 mb-4 md:mb-6 shadow-sm relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2C3E50] text-white text-xs md:text-sm font-extrabold uppercase tracking-wider px-4 md:px-5 py-1.5 md:py-2 rounded-full whitespace-nowrap shadow-md">
            Oferta limitada
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-6">
            {/* En clínica */}
            <div className="text-center">
              <p className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 md:mb-2">Reservando en clínica</p>
              <div className="text-2xl md:text-4xl font-bold text-gray-400 line-through">{ORIGINAL_PRICE}€</div>
            </div>
            {/* Online */}
            <div className="text-center border-l border-gray-200 pl-3 md:pl-6">
              <p className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-[#4CA994] mb-1 md:mb-2">Reservando online</p>
              <div className="text-3xl md:text-5xl font-extrabold text-gray-900 leading-none">{bonoPrice}€</div>
            </div>
          </div>
          <div className="mt-3 md:mt-5 pt-3 md:pt-4 border-t border-gray-100 flex items-center justify-center gap-2">
            <span className="bg-amber-100 text-amber-800 text-xs md:text-sm font-bold px-2 md:px-3 py-0.5 md:py-1 rounded-md">Ahorra {discountPct}% reservando online</span>
          </div>
          <p className="text-xs md:text-sm text-gray-500 text-center mt-2">Pago único · Se descuenta si inicias tratamiento</p>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-2 md:gap-3 bg-white rounded-full border border-gray-200 px-4 md:px-5 py-2 md:py-2.5 mb-6 md:mb-8 mx-auto w-fit shadow-sm">
          <Clock className="text-[#2C3E50] w-[14px] h-[14px] md:w-4 md:h-4" />
          <span className="text-xs md:text-sm font-semibold text-gray-700">Oferta limitada:</span>
          <span className="text-sm md:text-base font-extrabold text-[#2C3E50] tabular-nums">{countdownDisplay}</span>
        </div>

        {/* Testimonials */}
        <div className="mb-6 md:mb-10">
          <h3 className="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 md:mb-4 text-center">Historias reales</h3>
          <div className="space-y-3 md:space-y-4">
            {/* Video testimonial — Yolanda */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 md:p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-bold text-sm md:text-base text-gray-900">Yolanda</span>
                <span className="text-gray-400 text-xs md:text-sm">Paciente Hospital Capilar</span>
                <div className="flex gap-0.5 ml-auto">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="text-yellow-400 fill-yellow-400 w-[14px] h-[14px] md:w-4 md:h-4" />
                  ))}
                </div>
              </div>
              <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[300px] md:max-h-[340px] mx-auto max-w-[170px] md:max-w-[190px]">
                <video
                  src="https://res.cloudinary.com/dsc0jsbkz/video/upload/v1777898178/YOLANDA_TESTIMONIO_rv2tei.mp4"
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 md:p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-sm md:text-base text-gray-900">{t.name}</span>
                  <span className="text-gray-400 text-xs md:text-sm">{t.age} años</span>
                  <div className="flex gap-0.5 ml-auto">
                    {Array.from({ length: t.stars }).map((_, j) => (
                      <Star key={j} className="text-yellow-400 fill-yellow-400 w-[14px] h-[14px] md:w-4 md:h-4" />
                    ))}
                  </div>
                </div>
                <p className="text-gray-600 text-sm md:text-base italic leading-relaxed">"{t.text}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-8 md:mb-10">
          <h3 className="text-base md:text-xl font-bold text-gray-900 text-center mb-4 md:mb-5">Preguntas frecuentes</h3>
          <div className="space-y-2 md:space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 md:p-5 text-left"
                >
                  <span className="text-sm md:text-base font-medium text-gray-800 pr-4">{faq.q}</span>
                  <ChevronDown className={`text-gray-400 shrink-0 transition-transform w-[18px] h-[18px] md:w-5 md:h-5 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-4 md:px-5 pb-4 md:pb-5">
                    <p className="text-sm md:text-base text-gray-600 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Trust footer */}
        <div className="text-center mb-4">
          <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
            <Lock size={12} /> Pago 100% seguro con Stripe
          </p>
        </div>
      </div>

      {/* Sticky CTA — fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 md:px-8 py-3 md:py-4 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="max-w-lg md:max-w-2xl mx-auto">
          {/* Offer line — tachado + descuento + countdown */}
          <div className="flex items-center justify-center gap-2 flex-wrap mb-2 md:mb-3 text-xs md:text-sm">
            <span className="bg-amber-100 text-amber-800 font-bold px-2 md:px-3 py-0.5 md:py-1 rounded-md">Ahorra {discountPct}%</span>
            <span className="text-gray-400 line-through">{ORIGINAL_PRICE}€</span>
            <span className="text-gray-300">·</span>
            <span className="flex items-center gap-1 text-[#2C3E50] font-semibold">
              <Clock className="w-[11px] h-[11px] md:w-[14px] md:h-[14px]" />
              <span>Oferta limitada:</span>
              <span className="font-extrabold tabular-nums">{countdownDisplay}</span>
            </span>
          </div>
          <button
            onClick={handlePayClick}
            disabled={paying}
            className="w-full bg-[#4CA994] hover:bg-[#3d9480] disabled:bg-[#7BBFAE] disabled:cursor-wait text-white font-bold text-lg md:text-xl py-4 md:py-5 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
          >
            {paying ? (
              <>
                <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Conectando con Stripe…
              </>
            ) : (
              <>Reservar mi analítica · {bonoPrice}€</>
            )}
          </button>
          {onCallRequest && (
            <button
              onClick={onCallRequest}
              className="w-full text-center text-sm text-gray-500 mt-2 py-1 hover:text-[#4CA994] transition-colors flex items-center justify-center gap-1"
            >
              <Phone size={14} /> ¿Dudas? Te llamamos sin compromiso
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaywallOverlay;

import React, { useState } from 'react';
import { ShieldCheck, Stethoscope, CheckCircle2, Users, Star, ChevronDown, Phone } from 'lucide-react';

// ============================================
// SHARED SECTIONS — used by both Quiz and Form landings
// ============================================

export const TopBar = () => (
  <div className="h-1.5 w-full bg-[#4CA994]" />
);

export const StatsSection = ({ stats }) => (
  <section className="bg-gray-50 py-12">
    <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-8 text-center">
      {stats.map((stat, i) => (
        <div key={i}>
          <div className="text-3xl md:text-4xl font-extrabold text-[#4CA994] mb-1">{stat.value}</div>
          <div className="text-sm text-gray-500 font-medium">{stat.label}</div>
        </div>
      ))}
    </div>
  </section>
);

export const PainPointsSection = ({ painPoints }) => (
  <section className="max-w-3xl mx-auto px-6 py-16">
    <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
      ¿Te identificas con esto?
    </h2>
    <div className="space-y-4">
      {painPoints.map((point, i) => (
        <div key={i} className="flex items-start gap-4 p-5 bg-gray-50 rounded-xl border border-gray-100">
          <CheckCircle2 size={24} className="text-[#4CA994] shrink-0 mt-0.5" />
          <p className="text-lg text-gray-700 font-medium">{point}</p>
        </div>
      ))}
    </div>
  </section>
);

export const SolutionSection = ({ solution }) => (
  <section className="bg-[#F0F7F6] py-16">
    <div className="max-w-3xl mx-auto px-6 text-center">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-6">
        ¿Por qué Hospital Capilar es diferente?
      </h2>
      <p className="text-lg text-gray-600 leading-relaxed mb-10">
        {solution}
      </p>
      <div className="grid md:grid-cols-3 gap-6 text-left">
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <Stethoscope size={28} className="text-[#4CA994] mb-3" />
          <h3 className="font-bold text-gray-900 mb-2">Test capilar real</h3>
          <p className="text-sm text-gray-500">Tricoscopía + analítica hormonal + valoración médica en 30 minutos.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <Users size={28} className="text-[#4CA994] mb-3" />
          <h3 className="font-bold text-gray-900 mb-2">Equipo médico</h3>
          <p className="text-sm text-gray-500">Un equipo médico profesional experto en salud capilar trabajando juntos en tu caso.</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <ShieldCheck size={28} className="text-[#4CA994] mb-3" />
          <h3 className="font-bold text-gray-900 mb-2">Sin presión</h3>
          <p className="text-sm text-gray-500">Te decimos la verdad sobre tu caso. Si no necesitas tratamiento, te lo decimos.</p>
        </div>
      </div>
    </div>
  </section>
);

export const TestimonialsSection = ({ testimonials, videoTestimonial }) => (
  <section className="max-w-4xl mx-auto px-6 py-16">
    <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
      Personas como tú que dieron el paso
    </h2>
    {videoTestimonial && (
      <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 max-w-md mx-auto mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-bold text-sm text-gray-900">{videoTestimonial.name}</span>
          <span className="text-gray-400 text-xs">{videoTestimonial.label}</span>
          <div className="flex gap-0.5 ml-auto">
            {Array.from({ length: 5 }).map((_, j) => (
              <Star key={j} size={14} className="text-yellow-400 fill-yellow-400" />
            ))}
          </div>
        </div>
        <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[340px] mx-auto" style={{ maxWidth: '190px' }}>
          <video
            src={videoTestimonial.src}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    )}
    <div className="grid md:grid-cols-2 gap-6">
      {testimonials.map((t, i) => (
        <div key={i} className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
          <div className="flex gap-1 mb-3">
            {Array.from({ length: t.stars }).map((_, j) => (
              <Star key={j} size={18} className="text-yellow-400 fill-yellow-400" />
            ))}
          </div>
          <p className="text-gray-700 leading-relaxed mb-4 italic">"{t.text}"</p>
          <p className="text-sm font-bold text-gray-900">{t.name}, {t.age} años</p>
        </div>
      ))}
    </div>
  </section>
);

export const FAQSection = ({ faqs }) => {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-8 text-center">
        Preguntas frecuentes
      </h2>
      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="font-bold text-gray-900 pr-4">{faq.q}</span>
              <ChevronDown
                size={20}
                className={`text-gray-400 shrink-0 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
              />
            </button>
            {openIndex === i && (
              <div className="px-5 pb-5">
                <p className="text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

const CLINIC_IMAGES = [
  { src: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/Recepcion_ywqbi8.jpg', alt: 'Recepción Hospital Capilar' },
  { src: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/hrt_d1vm3u.jpg', alt: 'Tratamiento capilar avanzado' },
  { src: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/mejores_cirujanos_de_injerto_capilar_w5ppmh.jpg', alt: 'Equipo médico Hospital Capilar' },
  { src: 'https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_800/v1773931166/tratamientos_mujer_crt_gpxgxm.jpg', alt: 'Test capilar personalizado' },
];

export const ClinicGallerySection = () => (
  <section className="py-16 bg-white">
    <div className="max-w-5xl mx-auto px-6">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3 text-center">
        Conoce nuestras instalaciones
      </h2>
      <p className="text-gray-500 text-center mb-10 max-w-2xl mx-auto">
        Tecnología de última generación en un entorno diseñado para tu comodidad.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {CLINIC_IMAGES.map((img, i) => (
          <div key={i} className="overflow-hidden rounded-2xl aspect-[4/3]">
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            />
          </div>
        ))}
      </div>
    </div>
  </section>
);

export const CEOSection = () => (
  <section className="py-16 bg-white">
    <div className="max-w-5xl mx-auto px-6">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 text-center mb-2">
        Óscar Mendoza Sanmartín
      </h2>
      <p className="text-sm text-gray-400 uppercase tracking-widest text-center mb-10">
        CEO de Hospital Capilar
      </p>

      <div className="flex flex-col md:flex-row items-center gap-10">
        {/* Quote + bio */}
        <div className="flex-1 space-y-6">
          <blockquote className="text-xl md:text-2xl italic text-[#4CA994] font-medium leading-relaxed">
            "Yo antes era calvo, ahora ayudo a personas como tú a que vuelvan a sentirse ellos mismos".
          </blockquote>
          <p className="text-sm text-[#4CA994] font-semibold">Óscar Mendoza Sanmartín</p>
          <p className="text-gray-600 leading-relaxed">
            Al igual que muchas otras personas, yo también empecé a sufrir en mi día a día las consecuencias de la alopecia.
            Comencé a sentirme pequeño delante de los demás, a no reconocer a quien veía en el espejo.
            En 2017 viajé a Turquía para realizar mi trasplante capilar. Durante mi experiencia como paciente pude observar
            y vivir de primera mano las carencias del sistema turco, y decidí apostar por la calidad de la sanidad española
            para lanzar este proyecto. Quiero que recuperes tu pelo y tu confianza, y que tu injerto capilar sea toda una
            grata experiencia con Hospital Capilar.
          </p>
        </div>

        {/* CEO photo */}
        <div className="w-64 md:w-80 shrink-0">
          <img
            src="https://res.cloudinary.com/dsc0jsbkz/image/upload/f_auto,q_auto,w_600/v1773946149/Oscar_Mendoza_srrd84.webp"
            alt="Óscar Mendoza Sanmartín — CEO Hospital Capilar"
            loading="lazy"
            className="w-full rounded-2xl shadow-lg object-cover"
          />
        </div>
      </div>
    </div>
  </section>
);

export const Footer = () => (
  <footer className="py-8 border-t border-gray-100">
    <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <img src="/logo-hc.png" alt="Hospital Capilar" className="h-8 opacity-40" />
      <div className="flex gap-6 text-sm text-gray-400">
        <span>Madrid</span>
        <span>Murcia</span>
        <span>Pontevedra</span>
      </div>
      <p className="text-xs text-gray-400">Centro Médico Especializado en Salud Capilar</p>
    </div>
  </footer>
);

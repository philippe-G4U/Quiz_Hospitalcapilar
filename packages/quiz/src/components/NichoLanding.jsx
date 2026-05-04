import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useAnalytics, getUTMParams } from '@hospital-capilar/shared/analytics';
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

const NichoLanding = ({ nicho, onStartQuiz }) => {
  const analytics = useAnalytics();
  const config = NICHOS[nicho];

  if (!config) return null;

  const handleStart = () => {
    analytics.trackEvent('landing_cta_clicked', {
      nicho,
      type: 'quiz',
      utm_source: getUTMParams().utm_source || 'direct',
    });
    onStartQuiz();
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">
      <TopBar />

      {/* Hero — dark, same style as form landing */}
      <div className="relative bg-[#2C3E50] text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo-hc-white.png" alt="Hospital Capilar" className="h-10" />
          </div>
          <p className="text-[#4CA994] text-sm font-bold tracking-widest uppercase mb-4">{config.badge}</p>
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4 max-w-3xl">{config.headline}</h1>
          <p className="text-lg text-gray-300 max-w-2xl mb-10">{config.subheadline}</p>

          <button
            onClick={handleStart}
            className="inline-flex items-center gap-3 px-10 py-5 rounded-2xl text-white font-bold text-lg shadow-xl hover:-translate-y-1 hover:shadow-2xl transition-all bg-[#4CA994]"
          >
            {config.ctaQuiz}
            <ArrowRight size={22} />
          </button>
          <p className="text-sm text-gray-400 mt-4">3-4 minutos | 100% confidencial | Sin compromiso</p>
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
            Responde nuestro test capilar interactivo y recibe un pre-análisis personalizado en minutos.
          </p>
          <button
            onClick={handleStart}
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

export default NichoLanding;

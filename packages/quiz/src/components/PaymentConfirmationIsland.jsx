import { useEffect, useState } from 'react';
import { PostHogProvider, AnalyticsProvider, useAnalytics, getUTMParams } from '@hospital-capilar/shared/analytics';
import ErrorBoundary from './ErrorBoundary';
import PaymentConfirmation from './PaymentConfirmation';

function readQueryParams() {
  if (typeof window === 'undefined') return {};
  const sp = new URLSearchParams(window.location.search);
  return {
    nombre: sp.get('nombre') || '',
    email: sp.get('email') || '',
    telefono: sp.get('telefono') || sp.get('phone') || '',
    ubicacion: sp.get('ubicacion') || sp.get('ciudad') || '',
    contactId: sp.get('contactId') || '',
    bonoPrice: parseInt(sp.get('amount') || '125', 10),
    sessionId: sp.get('session_id') || '',
  };
}

function PaymentConfirmationInner() {
  const analytics = useAnalytics();
  const [params] = useState(readQueryParams);

  useEffect(() => {
    try {
      analytics.trackEvent('payment_confirmation_viewed', {
        has_email: !!params.email,
        has_telefono: !!params.telefono,
        session_id: params.sessionId || 'none',
        ...getUTMParams(),
      });
    } catch (e) {
      console.warn('[Analytics] payment_confirmation_viewed failed:', e.message);
    }
    // Meta Pixel — Purchase confirmation (CAPI also fires server-side from stripe-webhook)
    try {
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('track', 'Purchase', {
          value: params.bonoPrice,
          currency: 'EUR',
          content_name: 'Protocolo Femenino Trichometabolic',
        });
      }
    } catch (e) {
      console.warn('[Meta Pixel] Purchase failed:', e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PaymentConfirmation
      nombre={params.nombre}
      email={params.email}
      telefono={params.telefono}
      ubicacion={params.ubicacion}
      contactId={params.contactId}
      bonoPrice={params.bonoPrice}
    />
  );
}

export default function PaymentConfirmationIsland() {
  return (
    <ErrorBoundary>
      <PostHogProvider>
        <AnalyticsProvider>
          <PaymentConfirmationInner />
        </AnalyticsProvider>
      </PostHogProvider>
    </ErrorBoundary>
  );
}

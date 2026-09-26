/**
 * Analytics and Verification Configuration
 * 
 * Supports Google Analytics 4 (GA4) and Google Search Console (GSC)
 * strictly through environment variables.
 * Does not load analytics scripts unless a valid Measurement ID is configured.
 */

export interface AnalyticsConfig {
  gaMeasurementId?: string;
  gscVerificationToken?: string;
}

export function getAnalyticsConfig(): AnalyticsConfig {
  let gaMeasurementId: string | undefined;
  let gscVerificationToken: string | undefined;

  if (typeof import.meta !== 'undefined' && (import.meta as Record<string, any>).env) {
    const env = (import.meta as Record<string, any>).env;
    gaMeasurementId = env.VITE_GA_MEASUREMENT_ID;
    gscVerificationToken = env.VITE_GSC_VERIFICATION_TOKEN;
  }

  return {
    gaMeasurementId: gaMeasurementId && gaMeasurementId.trim() ? gaMeasurementId.trim() : undefined,
    gscVerificationToken: gscVerificationToken && gscVerificationToken.trim() ? gscVerificationToken.trim() : undefined,
  };
}

/**
 * Initializes GA4 script client-side only if configured and in a browser environment
 */
export function initAnalyticsIfConfigured(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const { gaMeasurementId } = getAnalyticsConfig();
  if (!gaMeasurementId || !gaMeasurementId.startsWith('G-')) {
    return;
  }

  // Avoid duplicate injection
  if (document.getElementById('ga-gtag-script')) {
    return;
  }

  const script = document.createElement('script');
  script.id = 'ga-gtag-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`;
  document.head.appendChild(script);

  (window as any).dataLayer = (window as any).dataLayer || [];
  function gtag(...args: any[]) {
    (window as any).dataLayer.push(args);
  }
  gtag('js', new Date());
  gtag('config', gaMeasurementId, {
    anonymize_ip: true,
  });
}

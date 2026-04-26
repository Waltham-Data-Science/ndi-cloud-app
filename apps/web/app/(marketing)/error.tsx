'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * Marketing route group error boundary.
 *
 * Catches uncaught errors thrown during render of any (marketing)/*
 * page. Renders a friendly fallback that matches the rest of the
 * marketing aesthetic (light card on cream canvas) — distinct from the
 * dark depth-gradient 404 since this represents an unexpected failure,
 * not a routing problem. The "Try again" reset button calls Next 16's
 * `reset()` to re-render the boundary and the page below it without a
 * full navigation.
 *
 * Phase 6.7 A8: Sentry is lazily-initialized at module-load time —
 * see app/(app)/error.tsx for the rationale. Bundle stays under the
 * 200 KB gz budget because @sentry/nextjs only ships in the error
 * route chunk, not the initial bundle. When `NEXT_PUBLIC_SENTRY_DSN`
 * is unset, init runs with `dsn: undefined` and captureException is
 * a no-op.
 */
if (typeof window !== 'undefined' && !Sentry.isInitialized()) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console in dev + Vercel function logs in prod.
    console.error('[marketing/error]', error.message, error.digest);
    Sentry.captureException(error, {
      tags: { source: 'marketing/error.tsx' },
      contexts: { nextjs: { digest: error.digest } },
    });
  }, [error]);

  return (
    <main className="flex justify-center items-center px-7 py-20 min-h-[calc(100vh-160px)] bg-bg-canvas">
      <div className="w-full max-w-[480px] bg-bg-surface rounded-xl shadow-md p-10 text-center">
        <div className="text-xs font-bold tracking-eyebrow uppercase text-fg-muted mb-3">
          Something went wrong
        </div>
        <h1 className="text-2xl font-bold text-fg-primary leading-tight mb-3">
          We hit an error rendering this page.
        </h1>
        <p className="text-[15px] leading-relaxed text-fg-secondary mb-6">
          The team has been notified. Try again, or head back to the home page.
          {error.digest ? (
            <span className="block mt-3 text-xs font-mono text-fg-muted">
              Reference: {error.digest}
            </span>
          ) : null}
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <MarketingButton variant="cta" size="md" onClick={reset}>
            Try again
          </MarketingButton>
          <MarketingButton as="a" href="/" variant="outline" size="md">
            Home
          </MarketingButton>
        </div>
      </div>
    </main>
  );
}

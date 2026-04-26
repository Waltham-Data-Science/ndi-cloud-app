'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * App route group error boundary.
 *
 * Phase 3a-5 wires this against the typed `ApiError` codes from
 * lib/api/errors.ts so per-error UI can render (login required, contact
 * support, retry, etc.). For Phase 2a it's a generic fallback identical
 * to the marketing error boundary in shape — same friendly card, same
 * Try again / Home affordances. The data-browser feature components
 * land on this when their RSC fetch fails.
 *
 * Phase 6.7 A8: Sentry is lazily-initialized at module-load time —
 * the error.tsx file is its own route chunk, so the @sentry/nextjs
 * SDK only ships with the initial bundle if a global instrumentation-
 * client.ts forces it. Keeping the SDK off the initial bundle preserves
 * the 200 KB gz initial-paint budget. When `NEXT_PUBLIC_SENTRY_DSN` is
 * unset, init runs with `dsn: undefined` and captureException is a
 * no-op — dev / un-provisioned builds work without error capture.
 *
 * Tradeoff: only errors that hit React error boundaries are captured.
 * Window-level uncaught errors (setTimeout, unhandled promise rejections
 * outside React) won't fire this code path. At <10 users + no
 * always-on Sentry init in instrumentation-client.ts (~75 KB gz cost),
 * this is the right trade.
 */
if (typeof window !== 'undefined' && !Sentry.isInitialized()) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console in dev + Vercel function logs in prod.
    console.error('[app/error]', error.message, error.digest);
    Sentry.captureException(error, {
      tags: { source: 'app/error.tsx' },
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
          We couldn&rsquo;t load this view.
        </h1>
        <p className="text-[15px] leading-relaxed text-fg-secondary mb-6">
          The team has been notified. Try again, or head to the catalog.
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
          <MarketingButton as="a" href="/datasets" variant="outline" size="md">
            Browse the catalog
          </MarketingButton>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useEffect } from 'react';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * App route group error boundary.
 *
 * Intentionally a generic fallback — same friendly card / Try-again /
 * catalog-link affordances as the marketing error boundary. Per-code
 * branching (e.g. ApiError → "log in to access this dataset" vs
 * "contact support" vs "try again") is a possible future enhancement;
 * keeping this generic covers the common case (transient RSC fetch
 * failure → user retries) without trying to translate every ApiError
 * code into copy that may or may not be useful.
 */
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

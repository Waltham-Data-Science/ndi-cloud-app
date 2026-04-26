/**
 * Server + edge runtime Sentry init.
 *
 * Next 16 calls `register()` once per process at startup. We dynamically
 * import the runtime-specific Sentry config so the Node SDK doesn't
 * leak into the Edge bundle (which has different runtime constraints).
 *
 * The DSN is opt-in: when `NEXT_PUBLIC_SENTRY_DSN` is unset (dev or
 * un-provisioned), `Sentry.init({ dsn: undefined })` is a no-op so
 * captureException calls in error.tsx degrade gracefully to console
 * logs without throwing.
 *
 * `onRequestError` forwards Server Components errors to Sentry — the
 * `app/(*)/error.tsx` boundaries handle client-side errors.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      // Capture 10% of transactions in prod (free tier comfortably handles
      // <10 users at this rate); dev gets 100% to ease local debugging.
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // Don't fingerprint PII; Vercel function logs already capture
      // request shapes.
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      sendDefaultPii: false,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;

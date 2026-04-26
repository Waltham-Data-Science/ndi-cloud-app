'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * /account-exists — informational page shown when a user attempts to
 * sign up with an email that already has a (pending) account. The
 * primary action is "send a fresh verification code" which routes the
 * user to /account-verification (where the actual `resendConfirmation`
 * call happens — keeping the resend logic on the destination page
 * rather than this gateway means a single source of truth for the
 * resend flow regardless of entry point).
 *
 * Wrapped in <Suspense> so the useSearchParams() hook (which suspends
 * during prerender per Next 16's strict-mode behavior) renders cleanly
 * at build time.
 */
export default function AccountExistsPage() {
  return (
    <Suspense fallback={<AccountExistsCard email={null} onResend={() => {}} disabled />}>
      <AccountExistsClient />
    </Suspense>
  );
}

function AccountExistsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  function handleResend() {
    // Routes to /account-verification with the email prefilled — the
    // verification page owns the actual `resendConfirmation` call so
    // this gateway and the standard flow share one resend codepath.
    const target = email
      ? `/account-verification?email=${encodeURIComponent(email)}`
      : '/account-verification';
    router.push(target);
  }

  return <AccountExistsCard email={email} onResend={handleResend} />;
}

function AccountExistsCard({
  email,
  onResend,
  disabled = false,
}: {
  email: string | null;
  onResend: () => void;
  disabled?: boolean;
}) {
  return (
    <main className="flex justify-center px-7 py-20 min-h-[calc(100vh-160px)] bg-bg-canvas">
      <div className="w-full max-w-[480px] bg-bg-surface rounded-xl shadow-md p-10 mt-8 max-[640px]:p-6">
        <h1 className="text-2xl font-bold text-fg-primary leading-tight mb-3">
          You&rsquo;ve already started an account
        </h1>
        <p className="text-[15px] leading-relaxed text-fg-secondary mb-6">
          {email ? (
            <>
              We sent a verification code to <strong>{email}</strong>, but account
              creation was never finished. Send a new code to pick up where you left
              off.
            </>
          ) : (
            <>
              You&rsquo;ve already started an account, but verification was never
              finished. Send a new code to pick up where you left off.
            </>
          )}
        </p>
        <div className="flex flex-col gap-3 mb-5">
          <MarketingButton
            variant="cta"
            size="md"
            onClick={onResend}
            disabled={disabled}
          >
            Send New Verification Code
          </MarketingButton>
        </div>
        <div className="text-sm text-fg-muted">
          <Link
            href="/create-account"
            className="text-ndi-teal no-underline hover:underline"
          >
            Back to Create Account
          </Link>
        </div>
      </div>
    </main>
  );
}

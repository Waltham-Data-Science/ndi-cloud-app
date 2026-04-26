'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * Client island for /account-exists. Split out of `page.tsx` so the
 * page can be a Server Component and export `metadata` (Next.js
 * forbids `metadata` exports from `'use client'` files).
 *
 * Wrapped in `<Suspense>` here so the `useSearchParams()` hook
 * (which suspends during prerender per Next 16's strict-mode
 * behavior) renders cleanly at build time.
 */
export function AccountExistsClient() {
  return (
    <Suspense fallback={<AccountExistsCard email={null} onResend={() => {}} disabled />}>
      <AccountExistsBody />
    </Suspense>
  );
}

function AccountExistsBody() {
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

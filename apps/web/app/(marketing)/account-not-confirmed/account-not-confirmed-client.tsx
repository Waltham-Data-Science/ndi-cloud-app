'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { ApiError } from '@/lib/api/client';
import { resendConfirmation } from '@/lib/api/auth';
import { AuthCard } from '@/components/marketing/AuthCard';
import { FormError } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';

/**
 * Shown when login succeeds but the account's email is not yet
 * verified. Single-action: send a fresh code, then route to
 * /account-verification.
 */
export function AccountNotConfirmedClient() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleResend() {
    if (!email) {
      router.push('/resend-verification');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resendConfirmation({ email });
      router.push(`/account-verification?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `We couldn't send a new code (${err.code}). Try again.`
          : 'Network error. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      heading="Your email isn't verified yet"
      description={
        <>
          We sent a verification code to{' '}
          <strong>{email || 'your email'}</strong> when you created your
          account, but it was never used. Send a fresh code to finish setting
          up.
        </>
      }
      footer={
        <Link href="/login" className="text-ndi-teal hover:underline">
          Back to log in
        </Link>
      }
    >
      {error && <FormError>{error}</FormError>}
      <MarketingButton
        variant="cta"
        size="md"
        onClick={handleResend}
        disabled={submitting}
        className="w-full"
      >
        {submitting ? 'Sending…' : 'Send a new verification code'}
      </MarketingButton>
    </AuthCard>
  );
}

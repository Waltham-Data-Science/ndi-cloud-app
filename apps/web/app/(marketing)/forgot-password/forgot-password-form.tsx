'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { forgotPassword } from '@/lib/api/auth';
import { AuthCard } from '@/components/marketing/AuthCard';
import { Field, FormError } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword({ email });
      // Always proceed to the reset page — even if the email doesn't
      // exist, we don't leak that information (server returns 200 in
      // both cases by design).
      router.push(`/reset-forgotten-password?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `We couldn't send a reset code right now (${err.code}). Try again in a moment.`
          : 'Network error. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      heading="Reset your password"
      description="Enter the email on your NDI Cloud account. We'll send you a code to reset your password."
      footer={
        <>
          Remember your password?{' '}
          <Link href="/login" className="text-ndi-teal hover:underline">
            Log in
          </Link>
          .
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <FormError>{error}</FormError>}
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <MarketingButton
          type="submit"
          variant="cta"
          size="md"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? 'Sending…' : 'Send reset code'}
        </MarketingButton>
      </form>
    </AuthCard>
  );
}

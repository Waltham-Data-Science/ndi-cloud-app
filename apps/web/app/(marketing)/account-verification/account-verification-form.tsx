'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { verifyEmail } from '@/lib/api/auth';
import { AuthCard } from '@/components/marketing/AuthCard';
import { Field, FormError } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';

export function AccountVerificationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const emailFromQuery = params.get('email') ?? '';
  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await verifyEmail({ email, code });
      router.push('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'invalid_code' || err.code === 'expired_code') {
          setFieldErrors({ code: 'That code is invalid or has expired.' });
        } else {
          setError(`Verification failed (${err.code}). Try requesting a new code.`);
        }
      } else {
        setError('Network error. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      heading="Verify your email"
      description={
        <>
          We sent a verification code to{' '}
          <strong>{email || 'your email'}</strong>. Enter it below to finish
          creating your account.
        </>
      }
      footer={
        <Link href="/resend-verification" className="text-ndi-teal hover:underline">
          Send a new code
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <FormError>{error}</FormError>}
        {!emailFromQuery && (
          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <Field
          label="Verification code"
          type="text"
          name="code"
          autoComplete="one-time-code"
          required
          inputMode="numeric"
          pattern="[0-9]*"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={fieldErrors.code}
        />
        <MarketingButton
          type="submit"
          variant="cta"
          size="md"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? 'Verifying…' : 'Verify email'}
        </MarketingButton>
      </form>
    </AuthCard>
  );
}

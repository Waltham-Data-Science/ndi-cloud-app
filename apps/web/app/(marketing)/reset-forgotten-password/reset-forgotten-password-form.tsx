'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { resetForgottenPassword } from '@/lib/api/auth';
import { AuthCard } from '@/components/marketing/AuthCard';
import { Field, FormError } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';

const MIN_PASSWORD = 12;

export function ResetForgottenPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const emailFromQuery = params.get('email') ?? '';
  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const nextFieldErrors: Record<string, string> = {};
    if (!code) nextFieldErrors.code = 'Reset code is required.';
    if (newPassword.length < MIN_PASSWORD)
      nextFieldErrors.newPassword = `Password must be at least ${MIN_PASSWORD} characters.`;
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await resetForgottenPassword({ email, code, newPassword });
      router.push('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'invalid_code' || err.code === 'expired_code') {
          setFieldErrors({
            code: 'That code is invalid or has expired. Request a new one.',
          });
        } else {
          setError(`Couldn't reset password (${err.code}). Try again.`);
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
      heading="Set a new password"
      description="Enter the code we sent to your email and choose a new password."
      footer={
        <Link href="/forgot-password" className="text-ndi-teal hover:underline">
          Send a new code
        </Link>
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
        <Field
          label="Reset code"
          type="text"
          name="code"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={fieldErrors.code}
        />
        <Field
          label="New password"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          hint={`At least ${MIN_PASSWORD} characters.`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={fieldErrors.newPassword}
        />
        <MarketingButton
          type="submit"
          variant="cta"
          size="md"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? 'Resetting…' : 'Reset password'}
        </MarketingButton>
      </form>
    </AuthCard>
  );
}

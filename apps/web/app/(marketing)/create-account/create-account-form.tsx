'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { signup } from '@/lib/api/auth';
import { AuthCard } from '@/components/marketing/AuthCard';
import { Field, FormError } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';

const MIN_PASSWORD = 12;

export function CreateAccountForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validation. Server re-validates; this is purely UX.
    const nextFieldErrors: Record<string, string> = {};
    if (!email) nextFieldErrors.email = 'Email is required.';
    if (!password) nextFieldErrors.password = 'Password is required.';
    else if (password.length < MIN_PASSWORD)
      nextFieldErrors.password = `Password must be at least ${MIN_PASSWORD} characters.`;
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await signup({ email, password, name: name.trim() || undefined });
      router.push(`/account-verification?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'email_already_exists') {
          router.push(`/account-exists?email=${encodeURIComponent(email)}`);
          return;
        }
        setError(`Signup failed (${err.code}). Try again or contact support.`);
      } else {
        setError('Network error. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard
      heading="Create your account"
      description="Free for all public-data use. No credit card required."
      footer={
        <>
          Already have an account?{' '}
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
          label="Name"
          type="text"
          name="name"
          autoComplete="name"
          hint="Optional — shown next to your published datasets."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          hint={`At least ${MIN_PASSWORD} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <MarketingButton
          type="submit"
          variant="cta"
          size="md"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </MarketingButton>
      </form>
    </AuthCard>
  );
}

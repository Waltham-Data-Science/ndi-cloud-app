'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { signup } from '@/lib/api/auth';
import { AuthSplitLayout } from '@/components/marketing/AuthSplitLayout';
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
    <AuthSplitLayout
      marketingEyebrow="Create your account"
      marketingTitle={
        <>
          From first upload to <em>first DOI</em>, in a day.
        </>
      }
      marketingSubtitle="Free to browse the Commons. Free-tier lab workspaces available for academic labs — today including teams at Brandeis, UCSD, and Johns Hopkins. No credit card required."
      marketingFeatures={[
        'Published datasets satisfy NIH Data Management & Sharing Plan requirements',
        <>
          RRID:SCR_023368 &mdash; cite NDI in your methods section
        </>,
        '(Public Data Commons is open to everyone — no account needed for browsing.)',
      ]}
    >
      <h1 className="font-display text-[1.85rem] font-extrabold tracking-tight text-fg-primary leading-tight mb-2 m-0">
        Create your account
      </h1>
      <p className="text-[0.92rem] text-fg-secondary mb-7 m-0">
        Free to browse the Commons. Account creation takes about 30 seconds.
      </p>
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
        <div className="mt-5 pt-5 border-t border-border-subtle text-sm text-fg-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-ndi-teal hover:underline">
            Log in
          </Link>
          .
        </div>
      </form>
    </AuthSplitLayout>
  );
}

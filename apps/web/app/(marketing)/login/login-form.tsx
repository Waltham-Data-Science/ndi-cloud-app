'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { login } from '@/lib/api/auth';
import { AuthSplitLayout } from '@/components/marketing/AuthSplitLayout';
import { Field, FormError } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      // Invalidate session cache so useSession() re-reads /api/auth/me with
      // the fresh cookie. Then navigate.
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      router.push(params.get('returnTo') ?? '/my');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Email or password is incorrect.');
        } else if (err.code === 'email_not_verified') {
          router.push(`/account-not-confirmed?email=${encodeURIComponent(email)}`);
          return;
        } else {
          setError(`Login failed (${err.code}). Try again or contact support.`);
        }
      } else {
        setError('Network error. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout
      marketingEyebrow="Welcome back"
      marketingTitle={
        <>
          Welcome back to your <em>lab&rsquo;s workspace.</em>
        </>
      }
      marketingSubtitle="Sign in to the NDI Data Browser, check progress on in-flight datasets, and publish new work to the Data Commons."
      marketingFeatures={[
        'HIPAA-aware storage with per-tenant isolation',
        'Crossref-registered DOIs on published datasets',
        'Intan, Blackrock, Spike2, and SpikeGadgets file readers in NDI-MATLAB/Python',
      ]}
    >
      <h1 className="font-display text-[1.85rem] font-extrabold tracking-tight text-fg-primary leading-tight mb-2 m-0">
        Log in
      </h1>
      <p className="text-[0.92rem] text-fg-secondary mb-7 m-0">
        Sign in to your lab&rsquo;s workspace.
      </p>
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
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <MarketingButton
          type="submit"
          variant="cta"
          size="md"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? 'Signing in…' : 'Log in'}
        </MarketingButton>
        <div className="mt-5 pt-5 border-t border-border-subtle text-sm text-fg-muted">
          Don&rsquo;t have an account?{' '}
          <Link href="/create-account" className="text-ndi-teal hover:underline">
            Create one
          </Link>
          {' · '}
          <Link href="/forgot-password" className="text-ndi-teal hover:underline">
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthSplitLayout>
  );
}

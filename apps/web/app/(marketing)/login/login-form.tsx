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
        'DOIs on published datasets',
        'Intan, Blackrock, Spike2, and SpikeGadgets file readers in NDI-MATLAB/Python',
      ]}
    >
      <h1 className="font-display text-[1.85rem] font-extrabold tracking-tight text-fg-primary leading-tight mb-2 m-0">
        Log in
      </h1>
      <p className="text-[0.92rem] text-fg-secondary mb-7 m-0">
        Sign in to your lab&rsquo;s workspace.
      </p>
      <ReturnToBanner returnTo={params.get('returnTo')} />
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

/**
 * Banner explaining WHY the login form is here when the user was
 * redirected from a protected route.
 *
 * Audit 2026-04-27 #12 — pre-fix, the login form looked identical to
 * the directly-accessed login regardless of how the user got here.
 * A user who clicked a `/my*` link from the catalog and got bounced
 * to `/login?returnTo=/my` had no contextual hint that the login was
 * required. Now: a small dismissible-styled banner reads from the
 * `returnTo` param and surfaces destination context.
 *
 * The banner is purely informational — the login flow already
 * honors `returnTo` post-success (see `handleSubmit` push above).
 *
 * Renders nothing when `returnTo` is missing or points at a generic
 * landing surface (`/`, `/datasets`, `/my`) — those cases need no
 * extra context.
 */
function ReturnToBanner({ returnTo }: { returnTo: string | null }) {
  if (!returnTo) return null;
  // Bounce-back targets that are mundane enough to skip the banner
  // — telling a user they need to log in to "see your account" when
  // /my IS the account page is just noise. Anything more specific
  // (a deeplink to a specific dataset, a query, etc.) is worth
  // surfacing.
  const generic = new Set(['/', '/datasets', '/my']);
  if (generic.has(returnTo)) return null;
  return (
    <div
      role="status"
      className="mb-5 rounded-md border border-brand-blue-3/30 bg-brand-blue-3/[0.06] px-3 py-2 text-[12.5px] text-fg-secondary"
      data-testid="return-to-banner"
    >
      Log in to continue to{' '}
      <span className="font-mono text-fg-primary">{returnTo}</span>.
    </div>
  );
}

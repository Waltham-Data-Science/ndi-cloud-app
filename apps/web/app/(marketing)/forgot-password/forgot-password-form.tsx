'use client';

/**
 * Forgot-password form.
 *
 * Audit 2026-04-27 batch D — two changes from the prior single-card
 * shell:
 *
 *   - **#7 — heading** was "Reset your password," which describes
 *     the NEXT page action (`/reset-forgotten-password`). The
 *     current page is the request-a-code step; "Forgot your
 *     password?" frames it correctly.
 *   - **#8 — layout** was a centered `<AuthCard>`, breaking the
 *     two-panel pattern shared by `/login` and `/create-account`.
 *     Switched to `<AuthSplitLayout>` with a tighter marketing
 *     copy on the left ("Happens to everyone.").
 *
 * Anonymous endpoint — no auth required to request a reset code.
 * The backend always returns 200 (so the existence of the email
 * isn't leaked), and we always proceed to `/reset-forgotten-password`
 * with the email pre-filled.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { forgotPassword } from '@/lib/api/auth';
import { AuthSplitLayout } from '@/components/marketing/AuthSplitLayout';
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
    <AuthSplitLayout
      marketingEyebrow="Account recovery"
      marketingTitle={
        <>
          Forgot? <em>Happens to everyone.</em>
        </>
      }
      marketingSubtitle="We'll send you a single-use code so you can pick a new password and get back into your lab's workspace."
      marketingFeatures={[
        'Codes expire after a short window — old codes can’t be reused',
        'Cognito-backed flow; we never see your password in plaintext',
        'Two-factor and SSO settings are preserved through the reset',
      ]}
    >
      <h1 className="font-display text-[1.85rem] font-extrabold tracking-tight text-fg-primary leading-tight mb-2 m-0">
        Forgot your password?
      </h1>
      <p className="text-[0.92rem] text-fg-secondary mb-7 m-0">
        Enter the email on your NDI Cloud account and we&rsquo;ll send a
        reset code.
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
        <MarketingButton
          type="submit"
          variant="cta"
          size="md"
          disabled={submitting}
          className="w-full"
        >
          {submitting ? 'Sending…' : 'Send reset code'}
        </MarketingButton>
        <div className="mt-5 pt-5 border-t border-border-subtle text-sm text-fg-muted">
          Remember your password?{' '}
          <Link href="/login" className="text-ndi-teal hover:underline">
            Log in
          </Link>
          .
        </div>
      </form>
    </AuthSplitLayout>
  );
}

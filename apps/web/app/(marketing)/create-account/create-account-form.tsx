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
const MAX_PASSWORD = 99;
const MIN_NAME = 2;
const MAX_NAME = 50;

/**
 * Password complexity requirements (M7).
 *
 * Source `pages/createAccount/index.tsx:25-31` enforces:
 *   /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9])(?!.*\s).{8,99}$/
 *
 * That maps to a Cognito UserPool policy of: min length, at least one
 * uppercase, lowercase, digit, special, no whitespace. Cognito enforces
 * these server-side; the frontend mirror prevents users submitting weak
 * passwords and getting back a confusing 400.
 *
 * The target's stricter 12-char minimum (vs source's 8) is preserved.
 *
 * Returns a list of human-readable problems with the password — empty
 * means it passes. We surface *what's missing* (not just "invalid") so
 * users can correct incrementally.
 */
function validatePassword(pw: string): string[] {
  const problems: string[] = [];
  if (pw.length < MIN_PASSWORD) {
    problems.push(`at least ${MIN_PASSWORD} characters`);
  }
  if (pw.length > MAX_PASSWORD) {
    problems.push(`${MAX_PASSWORD} characters or fewer`);
  }
  if (!/[A-Z]/.test(pw)) problems.push('one uppercase letter');
  if (!/[a-z]/.test(pw)) problems.push('one lowercase letter');
  if (!/\d/.test(pw)) problems.push('one number');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('one special character');
  if (/\s/.test(pw)) problems.push('no spaces');
  return problems;
}

function passwordHint(pw: string): string {
  if (pw.length === 0) {
    return `At least ${MIN_PASSWORD} characters with one uppercase, lowercase, number, and special character.`;
  }
  const problems = validatePassword(pw);
  if (problems.length === 0) return 'Looks good.';
  return `Still needed: ${problems.join(', ')}.`;
}

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
    const trimmedName = name.trim();
    if (!trimmedName) {
      nextFieldErrors.name = 'Name is required.';
    } else if (trimmedName.length < MIN_NAME) {
      nextFieldErrors.name = `Name must be at least ${MIN_NAME} characters.`;
    } else if (trimmedName.length > MAX_NAME) {
      nextFieldErrors.name = `Name must be ${MAX_NAME} characters or fewer.`;
    }
    if (!email) nextFieldErrors.email = 'Email is required.';
    if (!password) {
      nextFieldErrors.password = 'Password is required.';
    } else {
      const problems = validatePassword(password);
      if (problems.length > 0) {
        nextFieldErrors.password = `Password needs ${problems.join(', ')}.`;
      }
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await signup({ email, password, name: trimmedName });
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
          required
          minLength={MIN_NAME}
          maxLength={MAX_NAME}
          hint="Shown next to your published datasets — required for attribution."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
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
          maxLength={MAX_PASSWORD}
          hint={passwordHint(password)}
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
          {/* Source data-browser-v2 wording was "Send Verification Code"
              — sets explicit user expectation that the next screen
              awaits an emailed code. Restored after visual-comparison
              audit #3 flagged this as a regression. */}
          {submitting ? 'Sending verification code…' : 'Send verification code'}
        </MarketingButton>
        {/* Audit 2026-04-27 #14 — pre-fix, the row was three peer
            elements in a flex container: ("Already have an account?
            Log in.") + ("·") + ("Forgot password?"). When the form
            column was narrow enough for the third item to wrap, the
            second item ("·") sat orphaned at the end of line one,
            making the line read "Log in. ·" with nothing after.
            Inlining all three into ONE span keeps the separator with
            its right-hand neighbor across all viewport widths, AND
            drops the trailing period after "Log in" so the inline
            sentence reads as one phrase ("Log in · Forgot password?")
            rather than two. */}
        <div className="mt-5 pt-5 border-t border-border-subtle text-sm text-fg-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-ndi-teal hover:underline">
            Log in
          </Link>
          {' · '}
          <Link
            href="/forgot-password"
            className="text-ndi-teal hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </form>
    </AuthSplitLayout>
  );
}

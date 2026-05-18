'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError } from '@/lib/api/client';
import { changePassword } from '@/lib/api/auth';
import { AuthCard } from '@/components/marketing/AuthCard';
import { Field, FormError } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';
import { useSession } from '@/lib/auth/use-session';

const MIN_PASSWORD = 12;

/**
 * /reset-password — change-password flow for an authenticated user.
 *
 * Distinct from /reset-forgotten-password (the forgot-password flow,
 * which uses an emailed code). This page requires the current
 * password as proof of session — protects against an attacker with a
 * stolen XSRF cookie but no password from rotating creds.
 *
 * # Anonymous-user posture
 *
 * Pre-2026-05-14, anonymous visitors saw the "Change password" form
 * and were asked for their current password — confusing for anyone
 * who arrived from the legacy `/resetPassword` camelCase alias or a
 * search-result snippet (visual-UX audit #6, P0-1 from a63c agent).
 * Now anonymous visitors are redirected to /login with returnTo set,
 * and the form additionally renders a "Forgot your password?" link
 * to /forgot-password so authenticated users who can't remember
 * their current password have a clear escape hatch.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const { user, isLoading } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Auth gate: anonymous users can't change a password they don't
  // know — they need to recover via email instead. Follows the same
  // pattern as `my-account-client.tsx`'s redirect-to-login.
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login?returnTo=/reset-password');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="px-7 py-20 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading…</p>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (newPassword.length < MIN_PASSWORD) {
      setFieldErrors({
        newPassword: `Password must be at least ${MIN_PASSWORD} characters.`,
      });
      return;
    }
    if (newPassword === currentPassword) {
      setFieldErrors({ newPassword: 'New password must differ from current password.' });
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 || err.code === 'wrong_password') {
          setFieldErrors({ currentPassword: 'Current password is incorrect.' });
        } else {
          setError(`Couldn't change password (${err.code}). Try again.`);
        }
      } else {
        setError('Network error. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <AuthCard
        heading="Password updated"
        description="Your new password is now active."
        footer={
          <Link href="/my-account" className="text-ndi-teal hover:underline">
            Back to account
          </Link>
        }
      >
        <MarketingButton
          variant="cta"
          size="md"
          onClick={() => router.push('/my-account')}
          className="w-full"
        >
          Back to account
        </MarketingButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      heading="Change your password"
      description="Enter your current password, then choose a new one."
      footer={
        <div className="flex flex-col items-center gap-2">
          <Link href="/my-account" className="text-ndi-teal hover:underline">
            Back to account
          </Link>
          <span className="text-xs text-gray-500">
            Forgot your current password?{' '}
            <Link href="/forgot-password" className="text-ndi-teal hover:underline">
              Reset it via email
            </Link>
            .
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        {error && <FormError>{error}</FormError>}
        <Field
          label="Current password"
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={fieldErrors.currentPassword}
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
          {submitting ? 'Saving…' : 'Update password'}
        </MarketingButton>
      </form>
    </AuthCard>
  );
}

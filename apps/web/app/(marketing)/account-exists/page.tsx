/**
 * /account-exists — informational page shown when a user attempts to
 * sign up with an email that already has a (pending) account. The
 * primary action is "send a fresh verification code" which routes the
 * user to /account-verification (where the actual `resendConfirmation`
 * call happens — keeping the resend logic on the destination page
 * rather than this gateway means a single source of truth for the
 * resend flow regardless of entry point).
 *
 * Server Component — exports `metadata` so the browser tab reads
 * "You've already started an account · NDI Cloud" instead of bare
 * "NDI Cloud". The interactive bits live in `account-exists-client.tsx`
 * (Next.js forbids `metadata` exports from `'use client'` files).
 */
import type { Metadata } from 'next';

import { AccountExistsClient } from './account-exists-client';

export const metadata: Metadata = {
  title: "You've already started an account",
  robots: { index: false, follow: true },
};

export default function AccountExistsPage() {
  return <AccountExistsClient />;
}

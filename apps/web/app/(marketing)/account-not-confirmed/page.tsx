import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AccountNotConfirmedClient } from './account-not-confirmed-client';

export const metadata: Metadata = {
  title: 'Verify your email',
  description: 'Your account exists but the email is not yet verified.',
  robots: { index: false, follow: true },
};

export default function AccountNotConfirmedPage() {
  return (
    <Suspense fallback={null}>
      <AccountNotConfirmedClient />
    </Suspense>
  );
}

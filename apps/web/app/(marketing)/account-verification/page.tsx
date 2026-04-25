import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AccountVerificationForm } from './account-verification-form';

export const metadata: Metadata = {
  title: 'Verify your email',
  description: 'Enter the code we sent to your email.',
  robots: { index: false, follow: true },
};

export default function AccountVerificationPage() {
  return (
    <Suspense fallback={null}>
      <AccountVerificationForm />
    </Suspense>
  );
}

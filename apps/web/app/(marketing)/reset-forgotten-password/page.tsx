import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ResetForgottenPasswordForm } from './reset-forgotten-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
  description: 'Set a new NDI Cloud password.',
  robots: { index: false, follow: true },
};

export default function ResetForgottenPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForgottenPasswordForm />
    </Suspense>
  );
}

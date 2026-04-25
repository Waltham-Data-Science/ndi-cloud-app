import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Sign in to your NDI Cloud account.',
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

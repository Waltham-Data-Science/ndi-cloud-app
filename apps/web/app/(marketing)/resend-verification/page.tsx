import type { Metadata } from 'next';

import { ResendVerificationForm } from './resend-verification-form';

export const metadata: Metadata = {
  title: 'Resend verification code',
  description: 'Resend the email verification code for your NDI Cloud account.',
  robots: { index: false, follow: true },
};

export default function ResendVerificationPage() {
  return <ResendVerificationForm />;
}

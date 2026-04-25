import type { Metadata } from 'next';

import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Change password',
  description: 'Change your NDI Cloud password.',
  robots: { index: false, follow: true },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}

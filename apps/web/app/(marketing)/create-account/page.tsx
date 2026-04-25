import type { Metadata } from 'next';

import { CreateAccountForm } from './create-account-form';

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Create a free NDI Cloud account.',
  robots: { index: false, follow: true },
};

export default function CreateAccountPage() {
  return <CreateAccountForm />;
}

import type { Metadata } from 'next';

import { MyAccountClient } from './my-account-client';

export const metadata: Metadata = {
  title: 'My account',
  description: 'Your NDI Cloud account.',
  robots: { index: false, follow: true },
};

export default function MyAccountPage() {
  return <MyAccountClient />;
}

/**
 * `/my` — workspace dataset list (closes audit #64).
 *
 * Authenticated route. Renders the MyDatasetsClient under (app)/layout
 * (Header + Footer wrapped). The client island handles auth-gate, data
 * fetch, filter state, and the virtualized table.
 *
 * Phase 5 wires Edge Middleware to 302 unauthenticated visitors to
 * /login?returnTo=/my before HTML ships. Until then the client redirects
 * after `useSession()` resolves to user=null (matches the my-account
 * pattern shipped in Phase 2b).
 */
import type { Metadata } from 'next';

import { MyDatasetsClient } from './my-datasets-client';

export const metadata: Metadata = {
  title: 'My workspace · NDI Cloud',
  alternates: { canonical: '/my' },
  robots: { index: false }, // authenticated; not crawlable
};

export default function MyPage() {
  return <MyDatasetsClient />;
}

/**
 * `/my` — workspace dataset list (closes audit #64).
 *
 * Authenticated route. Renders the MyDatasetsClient under (app)/layout
 * (Header + Footer wrapped). The client island handles auth-gate, data
 * fetch, filter state, and the virtualized table.
 *
 * Auth gate is client-side: when `useSession()` resolves to `user=null`
 * the client routes to `/login?returnTo=/my` (matches the my-account
 * pattern shipped in Phase 2b). A server-side Edge-Middleware 302
 * (`Vary: Cookie` + auth-cookie inspection) is a possible future
 * optimization to remove the brief auth flash, but the current
 * middleware (`apps/web/middleware.ts`) is intentionally scoped to
 * Origin enforcement + CSP — adding cookie-driven 302s would expand
 * the matcher's blast radius and warrants its own PR + e2e coverage.
 */
import type { Metadata } from 'next';

import { MyDatasetsClient } from './my-datasets-client';

export const metadata: Metadata = {
  // Bare title; root layout's `template: '%s · NDI Cloud'` adds the
  // suffix. (Pre-hotfix this had a literal " · NDI Cloud" that the
  // template doubled into "My workspace · NDI Cloud · NDI Cloud".)
  title: 'My workspace',
  alternates: { canonical: '/my' },
  robots: { index: false }, // authenticated; not crawlable
};

export default function MyPage() {
  return <MyDatasetsClient />;
}

import type { Metadata } from 'next';

import { DataHealthClient } from './data-health-client';

/**
 * /admin/data-health — Dataset Health admin dashboard.
 *
 * Stream 6.9 (2026-05-15) deliverable. Reads the latest snapshot
 * from `/api/admin/data-health` (which fronts the
 * `dataset_health_violations` Postgres table populated nightly by
 * the cron at `/api/cron/dataset-health`).
 *
 * The full invariant set fires here (not just the compact-safe
 * subset that powers the catalog badge) — see
 * `apps/web/lib/data-quality/invariants.ts` for the catalog vs.
 * full split, ADR-009 (planned) for the rationale.
 *
 * Authz is enforced server-side at `/api/admin/data-health/route.ts`
 * (returns 403 unless the session user is admin). The page itself
 * renders to anyone; the admin gate is the data source.
 */
export const metadata: Metadata = {
  title: 'Data health · admin',
  robots: { index: false, follow: false },
};

export default function DataHealthPage() {
  return <DataHealthClient />;
}

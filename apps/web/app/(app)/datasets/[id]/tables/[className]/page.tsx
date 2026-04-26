/**
 * `/datasets/[id]/tables/[className]` — Summary tables tab content.
 *
 * Renders the ported `SummaryTableView` via `<TableShell>` (Phase 6.5
 * lifted the data-browser component into this monorepo). The tab bar
 * lives in the parent layout; this file's job is the route-to-shell
 * handoff. The audit-#65 a11y tab-bar shape (URL-routed `aria-current`
 * rather than state-controlled) was the original Phase 3b deliverable.
 *
 * `generateMetadata` sets a per-tab title so the browser tab reads
 * "Tables · NDI Cloud" instead of bare "NDI Cloud" (root layout's
 * template adds the suffix). Per-dataset name in the title is audit
 * follow-up #67 (deferred — see `[id]/layout.tsx` header comment for
 * the Next.js 16.2 InvariantError that crashes layout-level fetch).
 */
import type { Metadata } from 'next';

import { TableShell } from './table-shell';

interface PageProps {
  params: Promise<{ id: string; className: string }>;
}

export const metadata: Metadata = {
  title: 'Tables',
};

export default async function TableTabPage({ params }: PageProps) {
  const { id, className } = await params;
  return <TableShell datasetId={id} className={className} />;
}

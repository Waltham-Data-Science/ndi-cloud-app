/**
 * `/datasets/[id]/tables/[className]` — Summary tables tab content.
 *
 * Renders the ported `SummaryTableView` via `<TableShell>` (Phase 6.5
 * lifted the data-browser component into this monorepo). The tab bar
 * lives in the parent layout; this file's job is the route-to-shell
 * handoff. The audit-#65 a11y tab-bar shape (URL-routed `aria-current`
 * rather than state-controlled) was the original Phase 3b deliverable.
 *
 * `metadata` sets a per-tab title so the browser tab reads
 * "Tables · NDI Cloud" instead of bare "NDI Cloud" (root layout's
 * template adds the suffix).
 *
 * Per-dataset name appears on the OVERVIEW tab title only (audit #67)
 * — that's the canonical link people share. Inner tabs stay generic
 * because the user already sees the dataset name in the hero.
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

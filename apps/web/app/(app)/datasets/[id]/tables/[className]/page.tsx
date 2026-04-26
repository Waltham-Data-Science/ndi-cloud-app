/**
 * `/datasets/[id]/tables/[className]` — Summary tables tab content.
 *
 * Renders the ported `SummaryTableView` via `<TableShell>` (Phase 6.5
 * lifted the data-browser component into this monorepo). The tab bar
 * lives in the parent layout; this file's job is the route-to-shell
 * handoff. The audit-#65 a11y tab-bar shape (URL-routed `aria-current`
 * rather than state-controlled) was the original Phase 3b deliverable.
 */
import { TableShell } from './table-shell';

interface PageProps {
  params: Promise<{ id: string; className: string }>;
}

export default async function TableTabPage({ params }: PageProps) {
  const { id, className } = await params;
  return <TableShell datasetId={id} className={className} />;
}

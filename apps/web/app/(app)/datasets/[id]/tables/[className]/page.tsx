/**
 * `/datasets/[id]/tables/[className]` — Summary tables tab content.
 *
 * Phase 3b structural shell. Real content lands when `SummaryTableView`
 * (data-browser's `components/tables/SummaryTableView.tsx`) ports —
 * that's a separate sub-phase from this PR's audit-#65 close. The
 * tab bar (in the layout above) and routing are in place; this page
 * tells users where the content will land.
 */
import { TableShell } from './table-shell';

interface PageProps {
  params: Promise<{ id: string; className: string }>;
}

export default async function TableTabPage({ params }: PageProps) {
  const { id, className } = await params;
  return <TableShell datasetId={id} className={className} />;
}

/**
 * `/datasets/[id]/pivot/[grain]` — pivot tab content.
 *
 * Phase 3b structural shell. The full PivotView (TanStack Virtual + grain
 * selector + cell-detail render) ports in a follow-up. The tab bar in the
 * layout already lights up "Summary tables" for any `/pivot/*` path
 * (matches data-browser convention).
 */
import { PivotShell } from './pivot-shell';

interface PageProps {
  params: Promise<{ id: string; grain: string }>;
}

export default async function PivotPage({ params }: PageProps) {
  const { id, grain } = await params;
  return <PivotShell datasetId={id} grain={grain} />;
}

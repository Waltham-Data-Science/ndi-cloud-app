/**
 * `/datasets/[id]/pivot/[grain]` — pivot tab content.
 *
 * Renders the ported `PivotView` (TanStack Virtual + grain selector +
 * cell-detail render) via `<PivotShell>`. The tab bar in the layout
 * lights up "Summary tables" for any `/pivot/*` path (matches the
 * source data-browser convention — pivot is a derived view of the
 * tables surface, not its own top-level concept).
 */
import type { Metadata } from 'next';

import { PivotShell } from './pivot-shell';

interface PageProps {
  params: Promise<{ id: string; grain: string }>;
}

// Per-tab title; root layout's template wraps to "Pivot · NDI Cloud".
export const metadata: Metadata = {
  title: 'Pivot',
};

export default async function PivotPage({ params }: PageProps) {
  const { id, grain } = await params;
  return <PivotShell datasetId={id} grain={grain} />;
}

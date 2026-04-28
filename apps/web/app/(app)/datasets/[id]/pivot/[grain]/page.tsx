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
import { HydrationBoundary } from '@tanstack/react-query';

import { prefetchDatasetForPage } from '@/lib/api/datasets-prefetch';

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
  // Existence check + prefetch — see lib/api/datasets-prefetch.ts.
  const dehydratedState = await prefetchDatasetForPage(id);
  return (
    <HydrationBoundary state={dehydratedState}>
      <PivotShell datasetId={id} grain={grain} />
    </HydrationBoundary>
  );
}

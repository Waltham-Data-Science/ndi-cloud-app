'use client';

/**
 * OverviewContent — the "read this dataset" view for the Overview tab.
 *
 * Three sections (DatasetOverviewCard + DatasetSummaryCard +
 * DatasetProvenanceCard) laid out in a two-column grid: the main
 * "Details" card on the left, summary pills + provenance on the right.
 *
 * Mirrors `ndi-data-browser-v2/frontend/src/pages/DatasetDetailPage.tsx`
 * `OverviewTab` (lines 238-308 in source). Phase 6.6 REBUILD-3c lifts
 * this from a Phase 3b placeholder into a source-faithful Overview.
 *
 * Provenance errors degrade silently — a flaky aggregator should never
 * block the detail view.
 */
import {
  useDataset,
  useDatasetProvenance,
  useDatasetSummary,
} from '@/lib/api/datasets';
import { DatasetOverviewCard } from '@/components/datasets/DatasetOverviewCard';
import { DatasetProvenanceCard } from '@/components/datasets/DatasetProvenanceCard';
import { DatasetSummaryCard } from '@/components/datasets/DatasetSummaryCard';
import { ErrorState } from '@/components/errors/ErrorState';
import { CardSkeleton } from '@/components/ui/Skeleton';

export function OverviewContent({ datasetId }: { datasetId: string }) {
  const ds = useDataset(datasetId);
  const summary = useDatasetSummary(datasetId);
  const provenance = useDatasetProvenance(datasetId);

  // Smoke-test feedback: the sidecar appeared empty when summary or
  // provenance errored, because `isLoading` (TanStack Query 5) is
  // `isPending && isFetching` — false the moment a query's first
  // attempt errors out. With the new zero-retry hooks the error path
  // is reached on the first attempt; we use `isPending` (no data, no
  // success yet) for the "first paint" skeleton instead so a slow but
  // not-yet-errored fetch keeps showing the skeleton until it resolves
  // either way.
  //
  // `isPending && !data` = "we have no data yet, still in flight".
  // `isError`            = "first attempt failed; surface a retry".
  // `data`               = "render the card".
  const summaryShowSkeleton = summary.isPending && !summary.data;
  const provenanceShowSkeleton = provenance.isPending && !provenance.data;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] min-w-0">
      {/* ── Main column: details (abstract + authors + pubs + cite) ── */}
      <div className="space-y-4 min-w-0 order-2 lg:order-1">
        {ds.isPending && !ds.data && <CardSkeleton />}
        {ds.isError && (
          // Source data-browser used `<ErrorState onRetry={…} />` for a
          // typed-error UI with a retry button (visual-comparison audit
          // #6 — port had degraded this to a static "Couldn't load
          // dataset {id}" line with no actionable affordance). Restored
          // so a Railway flap mid-session is recoverable in-place
          // rather than requiring a hard refresh.
          <ErrorState error={ds.error} onRetry={() => ds.refetch()} />
        )}
        {ds.data && (
          <DatasetOverviewCard
            ds={ds.data}
            datasetId={datasetId}
            summary={summary.data}
          />
        )}
      </div>

      {/* ── Sidecar: summary pills + provenance ─────────────────────── */}
      <aside className="space-y-4 min-w-0 order-1 lg:order-2">
        {summaryShowSkeleton && <CardSkeleton />}
        {summary.isError && (
          // Audit #6 — summary errors were swallowed silently so a
          // synthesizer outage left users staring at an empty sidebar
          // with no signal what happened.
          <ErrorState
            error={summary.error}
            onRetry={() => summary.refetch()}
          />
        )}
        {summary.data && <DatasetSummaryCard summary={summary.data} />}

        {/* Plan B B5 — dataset provenance card (derivation graph,
            cross-dataset depends_on edges, branches). Provenance now
            renders a CardSkeleton during first-paint (matching the
            summary card), an inline error state on failure (lets the
            user retry without a hard refresh), and the card itself on
            success. Pre-fix it was render-on-data-only, which was a
            silent UX bug: users saw a blank space for slow datasets
            with no signal whether provenance was loading, broken, or
            simply absent. Errors no longer block the rest of the
            view — DatasetSummaryCard above renders independently. */}
        {provenanceShowSkeleton && <CardSkeleton />}
        {provenance.isError && (
          <ErrorState
            error={provenance.error}
            onRetry={() => provenance.refetch()}
          />
        )}
        {provenance.data && (
          <DatasetProvenanceCard provenance={provenance.data} />
        )}
      </aside>
    </div>
  );
}

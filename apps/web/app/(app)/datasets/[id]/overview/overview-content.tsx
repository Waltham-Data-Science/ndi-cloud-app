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
import { CardSkeleton } from '@/components/ui/Skeleton';

export function OverviewContent({ datasetId }: { datasetId: string }) {
  const ds = useDataset(datasetId);
  const summary = useDatasetSummary(datasetId);
  const provenance = useDatasetProvenance(datasetId);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px] min-w-0">
      {/* ── Main column: details (abstract + authors + pubs + cite) ── */}
      <div className="space-y-4 min-w-0 order-2 lg:order-1">
        {ds.isLoading && <CardSkeleton />}
        {ds.isError && (
          <div className="rounded-lg border border-dashed border-border-subtle bg-bg-surface p-6 text-center">
            <p className="text-sm text-fg-secondary">
              Couldn&rsquo;t load dataset {datasetId}.
            </p>
          </div>
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
        {summary.isLoading && <CardSkeleton />}
        {summary.data && <DatasetSummaryCard summary={summary.data} />}

        {/* Plan B B5 — dataset provenance card (derivation graph,
            cross-dataset depends_on edges, branches). Errors on
            provenance degrade silently so a flaky aggregator never
            blocks the detail view. */}
        {provenance.data && (
          <DatasetProvenanceCard provenance={provenance.data} />
        )}
      </aside>
    </div>
  );
}

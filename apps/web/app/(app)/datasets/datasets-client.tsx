'use client';

/**
 * Client island for the catalog. The RSC at `./page.tsx` server-prefetches
 * `['datasets', 'published', 1, 20]` and wraps this component in a
 * `<HydrationBoundary>`, so the first `useQuery` call resolves
 * synchronously to the prefetched data — no client-side fetch on first
 * paint. TanStack Query revalidates in the background according to the
 * provider's `staleTime` (60s).
 *
 * Anonymous-public guarantee: this component renders identically for all
 * viewers. No `useSession` reads, no per-user state. Filter / sort /
 * pagination land as a follow-up sub-phase; the architectural piece (RSC
 * + HydrationBoundary + ISR) is what Phase 3a delivers.
 */
import { usePublishedDatasets } from '@/lib/api/datasets';
import { DatasetCard } from '@/components/app/DatasetCard';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';

export function DatasetsListClient({
  page = 1,
  pageSize = 20,
}: {
  page?: number;
  pageSize?: number;
}) {
  const { data, isLoading, isError, error, refetch } = usePublishedDatasets(
    page,
    pageSize,
  );

  if (isLoading) {
    return (
      <div className="grid gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle bg-bg-surface p-10 text-center">
        <p className="text-sm text-fg-secondary mb-3">
          Couldn&rsquo;t load datasets
          {error instanceof Error ? `: ${error.message}` : '.'}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm font-semibold text-ndi-teal hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const datasets = data?.datasets ?? [];
  const total = data?.totalNumber ?? 0;

  if (datasets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-subtle bg-bg-surface p-10 text-center">
        <p className="text-sm text-fg-secondary">No published datasets yet.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-fg-muted mb-4 font-mono">
        {formatNumber(total)} dataset{total === 1 ? '' : 's'}
      </p>
      <div className="grid gap-5">
        {datasets.map((d) => (
          <DatasetCard key={d.id} dataset={d} />
        ))}
      </div>
    </>
  );
}

'use client';

/**
 * Client island for the catalog. The RSC at `./page.tsx` server-prefetches
 * `['datasets', 'published', 1, 20]` and wraps this component in a
 * `<HydrationBoundary>`, so the first `useQuery` call resolves
 * synchronously to the prefetched data — no client-side fetch on first
 * paint. TanStack Query revalidates in the background according to the
 * provider's `staleTime` (60s).
 *
 * Phase 6.5d (cross-repo unification): adds the `<FacetPanel>` sidebar.
 * The facets endpoint aggregates across published datasets only — same
 * anonymous-public guarantee as the dataset list, no per-user state.
 *
 * Anonymous-public guarantee: this component renders identically for all
 * viewers. No `useSession` reads, no per-user state. Filter / sort /
 * pagination still land as a follow-up; this PR adds the chip cloud and
 * routes chip clicks to `/query?...` so users can discover the research
 * vocabulary even before the QueryBuilder ships in 6.5e.
 */
import { useRouter } from 'next/navigation';

import { usePublishedDatasets } from '@/lib/api/datasets';
import { DatasetCard } from '@/components/app/DatasetCard';
import { FacetPanel } from '@/components/app/FacetPanel';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';
import type { OntologyTerm } from '@/lib/types/facets';

/** Maps the FacetPanel's `kind` argument to the QueryBuilder field path
 * a `contains_string` operator should be applied against. The mapping
 * mirrors the data-browser's `QueryPage` chip-click handlers — once
 * QueryBuilder ports in 6.5e, both sides agree on field paths. */
const FACET_KIND_TO_FIELD: Record<
  'species' | 'brainRegions' | 'strains' | 'sexes',
  string
> = {
  species: 'openminds.fields.preferredOntologyIdentifier',
  brainRegions: 'openminds.fields.preferredOntologyIdentifier',
  strains: 'openminds.fields.preferredOntologyIdentifier',
  sexes: 'openminds.fields.preferredOntologyIdentifier',
};

export function DatasetsListClient({
  page = 1,
  pageSize = 20,
}: {
  page?: number;
  pageSize?: number;
}) {
  const router = useRouter();

  const handleOntologyChip = (
    kind: 'species' | 'brainRegions' | 'strains' | 'sexes',
    term: OntologyTerm,
  ) => {
    // Prefer the ontology id (e.g. NCBITaxon:6239) when present — that's
    // what the backend ontologyTableRow indexes on. Fall back to the
    // human-readable label if no ontology id was extracted.
    const value = term.ontologyId ?? term.label;
    if (!value) return;
    const field = FACET_KIND_TO_FIELD[kind];
    const qs = new URLSearchParams({
      op: 'contains_string',
      field,
      param1: value,
    });
    router.push(`/query?${qs.toString()}`);
  };

  const handleProbeTypeChip = (probeType: string) => {
    const qs = new URLSearchParams({
      op: 'contains_string',
      field: 'element.fields.probeType',
      param1: probeType,
    });
    router.push(`/query?${qs.toString()}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="min-w-0">
        <FacetPanel
          onSelectOntologyFacet={handleOntologyChip}
          onSelectProbeType={handleProbeTypeChip}
        />
      </aside>
      <section className="min-w-0">
        <DatasetsList page={page} pageSize={pageSize} />
      </section>
    </div>
  );
}

function DatasetsList({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
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

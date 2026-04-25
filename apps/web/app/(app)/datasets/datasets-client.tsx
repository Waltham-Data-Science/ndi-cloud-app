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

/** All four ontology facet kinds funnel into the same backend field —
 * `data.ontology_name` is the canonical ontology-ID field emitted by
 * the enrichment pipeline (matches both full IDs like `NCBITaxon:10116`
 * and human-readable labels in the same cell). The data-browser's
 * `QueryPage` `handleSelectOntologyFacet` does the same unified
 * dispatch; the `kind` argument is reserved for future per-kind field
 * paths if the enrichment pipeline ever splits species / brainRegions
 * into distinct paths.
 *
 * Phase 6.5e fixed this: the previous 6.5d shipped `openminds.fields.preferredOntologyIdentifier`
 * which doesn't exist in the cloud's document index — chip clicks would
 * land on /query with a query that always returns 0 rows. This restores
 * parity with the data-browser. */
const ONTOLOGY_FACET_FIELD = 'data.ontology_name';

export function DatasetsListClient({
  page = 1,
  pageSize = 20,
}: {
  page?: number;
  pageSize?: number;
}) {
  const router = useRouter();

  const handleOntologyChip = (
    _kind: 'species' | 'brainRegions' | 'strains' | 'sexes',
    term: OntologyTerm,
  ) => {
    // Prefer the ontology id (e.g. NCBITaxon:6239) when present — that's
    // what the backend ontologyTableRow indexes on. Fall back to the
    // human-readable label if no ontology id was extracted. `_kind` is
    // unused today; see ONTOLOGY_FACET_FIELD's docstring.
    const value = term.ontologyId ?? term.label;
    if (!value) return;
    const qs = new URLSearchParams({
      op: 'contains_string',
      field: ONTOLOGY_FACET_FIELD,
      param1: value,
    });
    router.push(`/query?${qs.toString()}`);
  };

  const handleProbeTypeChip = (probeType: string) => {
    // `element.type` is the canonical probe-type field in NDI-matlab and
    // v2's element-class shape — matches the data-browser's
    // `QueryPage.handleSelectProbeType`.
    const qs = new URLSearchParams({
      op: 'contains_string',
      field: 'element.type',
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

'use client';

/**
 * OpenmindsSubjectTableView — frontend-projected summary table for the
 * `openminds_subject` class.
 *
 * The summary-table backend's `_project_for_class` (in
 * `ndi-data-browser-v2/backend/services/summary_table_service.py`) has no
 * `openminds_subject` branch — it falls through to a generic 2-column
 * projection that is effectively empty for these docs because their
 * `base.name` is unset. The user saw a near-blank table at
 * `/datasets/[id]/tables/openminds_subject`.
 *
 * The `documents` endpoint already returns the full data, so we project
 * rows on the frontend in the exact same shape the backend WOULD have
 * emitted. This mirrors how `OntologyTablesView` repurposes the
 * `useOntologyTables` hook to feed a synthesized `TableResponse` into
 * the existing `SummaryTableView` (filter + sort + column-toggle +
 * CSV/XLS/JSON export inherit free).
 *
 * Polymorphic dispatch: each `openminds_subject` doc carries an
 * `openminds.openminds_type` URI whose terminal segment is the type
 * discriminator (`Species`, `Strain`, `BiologicalSex`,
 * `GeneticStrainType`). The `Strain` type uses `ontologyIdentifier`
 * (Schema B) for its ontology ID; everything else uses
 * `preferredOntologyIdentifier` (Schema A). Both flow into the same
 * `ontologyIdentifier` column so the user sees one cell per row
 * regardless of source.
 *
 * Progressive load: backed by `useDocumentsInfinite` with `pageSize=500`
 * so very-large openminds_subject sets (Haley's 9k+ docs at 500/page =
 * 18 round-trips) stream in progressively rather than blocking the
 * whole table on one mega-fetch. A "Loaded N of M" pill renders above
 * the table while pages are still in flight; rows render as each page
 * lands.
 *
 * Click-through: `documentIdentifier` is the per-row primary id
 * (matches `doc.ndiId`), and `pickDocId` in `table-shell.tsx` already
 * picks it up via its fallback chain so clicking a row navigates to
 * `/datasets/[id]/documents/[ndiId]` with no extra wiring.
 *
 * Follow-up (PR body): backend parity. `_project_for_class` could grow
 * a matching `openminds_subject` branch later for a server-side
 * projection (caching + uniform shape across classes); no UI change
 * needed when it lands — `useSummaryTable` would just start returning
 * the same 8 columns this file projects today.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { ErrorState } from '@/components/errors/ErrorState';
import { SummaryTableView } from '@/components/app/SummaryTableView';
import { Card, CardBody } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocumentsInfinite, type DocumentSummary } from '@/lib/api/documents';
import type { TableResponse } from '@/lib/api/tables';

const PAGE_SIZE = 500;

/**
 * Auto-fetch trigger: while the first page has landed but more pages
 * remain, fire the next request immediately so the user doesn't have
 * to wait between page boundaries on multi-thousand-doc datasets.
 * Same shape as `DocumentExplorer`'s sentinel-driven progressive load
 * but simpler — there's no scroll viewport to observe here, the table
 * is rendered in one big virtualized list, so we just chain page
 * requests as soon as each completes.
 */
function useStreamAllPages(
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void,
  loadedCount: number,
) {
  // Ref used to guard against re-firing the next-page request inside
  // the same tick — TanStack toggles `isFetchingNextPage` true synchronously,
  // but the first render after a page lands may briefly show
  // `isFetchingNextPage=false` before the next `fetchNextPage()` runs.
  const lastFetchedAtRef = useRef<number>(-1);
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (lastFetchedAtRef.current === loadedCount) return;
    lastFetchedAtRef.current = loadedCount;
    fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, loadedCount]);
}

/**
 * Fixed column order for the openminds_subject summary table. Matches
 * `OPENMINDS_SUBJECT_DEFAULT_COLUMNS` in
 * `lib/data/table-column-definitions.ts` — change one, change the other.
 *
 * `documentIdentifier` first so the click-through-target id is also
 * the leftmost column (matches the convention on subject /
 * element / element_epoch tables).
 */
const COLUMN_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'documentIdentifier', label: 'Doc ID' },
  { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Name' },
  { key: 'ontologyIdentifier', label: 'Ontology ID' },
  { key: 'matlabType', label: 'MATLAB Type' },
  { key: 'description', label: 'Description' },
  { key: 'synonym', label: 'Synonym' },
] as const;

interface OpenmindsSubjectTableViewProps {
  datasetId: string;
}

export function OpenmindsSubjectTableView({
  datasetId,
}: OpenmindsSubjectTableViewProps) {
  const router = useRouter();
  const query = useDocumentsInfinite(datasetId, 'openminds_subject', PAGE_SIZE);

  const allDocs = useMemo(
    () => query.data?.pages.flatMap((p) => p.documents) ?? [],
    [query.data],
  );
  const total = query.data?.pages[0]?.total ?? null;
  const loaded = allDocs.length;

  // Auto-stream remaining pages while any are in flight. Disabling
  // when the first page errors (the user sees the ErrorState below).
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useStreamAllPages(
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    loaded,
  );

  /**
   * Synthesize a `TableResponse` from the loaded documents. Built in a
   * `useMemo` so a stable identity hits `SummaryTableView`'s ordered-
   * columns / auto-hide / batch-ontology-lookup memos correctly across
   * progressive page arrivals.
   */
  const synthesized = useMemo<TableResponse>(
    () => ({
      columns: [...COLUMN_ORDER],
      rows: allDocs.map(projectOpenmindsRow),
    }),
    [allDocs],
  );

  // Row click handler — navigate to the per-document detail page using
  // the same ndiId that `documentIdentifier` carries.
  const onRowClick = (row: Record<string, unknown>) => {
    const id = row.documentIdentifier;
    if (typeof id !== 'string' || !id) return;
    const sel = typeof window !== 'undefined' ? window.getSelection?.() : null;
    if (sel && sel.toString().length > 0) return;
    router.push(`/datasets/${datasetId}/documents/${encodeURIComponent(id)}`);
  };

  if (query.isPending) {
    return (
      <Card>
        <CardBody>
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </CardBody>
      </Card>
    );
  }

  if (query.isError && allDocs.length === 0) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  if (allDocs.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-fg-secondary">
            No <span className="font-mono">openminds subjects</span> rows in this dataset.
          </p>
          <p className="text-xs text-fg-muted mt-2 italic">
            The documents endpoint returned 0 docs. Try a different class
            or confirm this dataset publishes the openminds_subject grain.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progressive-load progress pill. Renders only while there are
          pages still in flight (or about to be) so the table itself is
          the main visible content as soon as data arrives. */}
      {(hasNextPage || isFetchingNextPage) && total !== null && (
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-ndi-teal animate-pulse"
            aria-hidden
          />
          <span className="font-mono">
            Loaded {loaded.toLocaleString('en-US')} of{' '}
            {total.toLocaleString('en-US')} rows
            {isFetchingNextPage ? ' · loading more…' : ''}
          </span>
        </div>
      )}

      <SummaryTableView
        data={synthesized}
        tableType="openminds_subject"
        title={`${datasetId}-openminds_subject`}
        datasetId={datasetId}
        onRowClick={onRowClick}
      />
    </div>
  );
}

/**
 * Pure helper — projects one openminds_subject document into a flat row
 * for the summary table. Exported (alongside `pickDependencyValue`) so
 * the unit tests can exercise the projection logic without spinning up
 * a TanStack Query / React tree.
 *
 * Polymorphic dispatch on `openminds_type` terminal segment:
 *
 *   - `Strain` →  `ontologyIdentifier` field (Schema B; `WBStrain:…`)
 *   - everything else → `preferredOntologyIdentifier` (Schema A;
 *     `NCBITaxon:…`, `PATO:…`)
 *
 * Both populate the row's single `ontologyIdentifier` column so the
 * user-visible UX is uniform across types.
 *
 * Schema-B Strain docs also carry `ndi://`-prefixed refs in
 * `backgroundStrain` / `species`. Resolving those to labels is a
 * follow-up — the projection just leaves them as-is in the
 * description / synonym fields if present, but those columns aren't
 * defined on the row schema. (See PR body Caveats.)
 */
export function projectOpenmindsRow(
  doc: DocumentSummary,
): Record<string, unknown> {
  const data = (doc.data ?? {}) as Record<string, unknown>;
  const openminds = (data.openminds ?? {}) as Record<string, unknown>;
  const fields = (openminds.fields ?? {}) as Record<string, unknown>;

  const openmindsType = typeof openminds.openminds_type === 'string'
    ? openminds.openminds_type
    : '';
  const type = openmindsType.split('/').pop() ?? '';

  // Schema A vs Schema B: Strain uses `ontologyIdentifier`,
  // everything else uses `preferredOntologyIdentifier`.
  const ontologyKey =
    type === 'Strain' ? 'ontologyIdentifier' : 'preferredOntologyIdentifier';
  const ontologyValue = fields[ontologyKey];

  const matlabType = typeof openminds.matlab_type === 'string'
    ? openminds.matlab_type
    : '';

  return {
    documentIdentifier: doc.ndiId ?? '',
    subjectDocumentIdentifier: pickDependencyValue(data.depends_on, 'subject_id'),
    type,
    name: typeof fields.name === 'string' ? fields.name : (fields.name ?? ''),
    ontologyIdentifier: typeof ontologyValue === 'string'
      ? ontologyValue
      : (ontologyValue ?? ''),
    matlabType,
    description: typeof fields.description === 'string'
      ? fields.description
      : (fields.description ?? ''),
    synonym: typeof fields.synonym === 'string'
      ? fields.synonym
      : (fields.synonym ?? ''),
  };
}

/**
 * Walk a `data.depends_on` array (or single object — backend sometimes
 * collapses) and return the `value` of the first entry whose `name`
 * matches `targetName`. Returns `''` when no match exists, which
 * renders as an em-dash in `SummaryTableView`'s `TableCell`.
 */
export function pickDependencyValue(
  raw: unknown,
  targetName: string,
): string {
  if (!raw) return '';
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const d of arr) {
    if (!d || typeof d !== 'object') continue;
    const name = (d as Record<string, unknown>).name;
    if (name !== targetName) continue;
    const value = (d as Record<string, unknown>).value;
    if (typeof value === 'string') return value;
  }
  return '';
}

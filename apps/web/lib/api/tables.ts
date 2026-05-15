'use client';

/**
 * Table hooks — summary tables (per NDI class), combined join, ontology
 * groups. Ported verbatim from `ndi-data-browser-v2/frontend/src/api/tables.ts`.
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import { TABLE_TIMEOUT_MS } from './timeouts';

export interface TableColumn {
  key: string;
  label: string;
  /** For ontology-table columns — the ontology term ID describing the
   * column itself (e.g. `"EMPTY:0000153"`). */
  ontologyTerm?: string | null;
}

export interface TableResponse {
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
}

/** One ontology-table group — all `ontologyTableRow` docs that share a
 * `variableNames` CSV roll up into a single `OntologyTableGroup`. */
export interface OntologyTableGroup {
  variableNames: string[];
  names: string[];
  ontologyNodes: string[];
  table: TableResponse;
  docIds: string[];
  rowCount: number;
}

export interface OntologyTablesResponse {
  groups: OntologyTableGroup[];
}

/**
 * Per-class table fetches can take 6-30s cold on Railway depending on
 * dataset size + class size. Default 15s apiFetch timeout would abort
 * on the first attempt for medium datasets and TanStack's default 3
 * retries would compound that into a 60s+ "stuck loading" window. Bump
 * to 60s + zero retries: ONE attempt with enough headroom, then either
 * succeeds (and edge-cache warms for subsequent viewers) or surfaces a
 * typed error for the user to manually retry. Same pattern as the
 * detail hooks in `lib/api/datasets.ts`.
 *
 * `signal` is also threaded through so navigating away cancels the
 * in-flight fetch instead of holding the connection open until the
 * timeout fires.
 */
// TABLE_TIMEOUT_MS now lives in `./timeouts.ts` (post-cutover sweep).
const TABLE_STALE_MS = 60_000;

/** Table of a single NDI class. */
export function useSummaryTable(
  datasetId: string | undefined,
  className: string | undefined,
) {
  return useQuery({
    queryKey: ['table', datasetId, className],
    queryFn: ({ signal }) =>
      apiFetch<TableResponse>(
        `/api/datasets/${datasetId}/tables/${className}`,
        { signal, timeoutMs: TABLE_TIMEOUT_MS },
      ),
    enabled: !!datasetId && !!className,
    retry: 0,
    staleTime: TABLE_STALE_MS,
  });
}

/** Cross-class joined view — subject ⋈ element ⋈ element_epoch. */
export function useCombinedTable(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['table', datasetId, 'combined'],
    queryFn: ({ signal }) =>
      apiFetch<TableResponse>(
        `/api/datasets/${datasetId}/tables/combined`,
        { signal, timeoutMs: TABLE_TIMEOUT_MS },
      ),
    enabled: !!datasetId,
    retry: 0,
    staleTime: TABLE_STALE_MS,
  });
}

/** Ontology tables — groups of `ontologyTableRow` docs that share a schema. */
export function useOntologyTables(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['table', datasetId, 'ontology'],
    queryFn: ({ signal }) =>
      apiFetch<OntologyTablesResponse>(
        `/api/datasets/${datasetId}/tables/ontology`,
        { signal, timeoutMs: TABLE_TIMEOUT_MS },
      ),
    enabled: !!datasetId,
    retry: 0,
    staleTime: TABLE_STALE_MS,
  });
}

/**
 * Stream 5.8 (2026-05-16) — paginated single-class table envelope.
 *
 * Returned by `/api/datasets/:id/tables/:class?page=N&pageSize=M`. The
 * backend caches the FULL row set and slices server-side, so each page
 * fetch reads ~250 KB instead of the unpaged ~6 MB blob (Bhar's
 * `ontologyTableRow` is the worst case). `distinct_summary` is computed
 * over the full set and carried on every page so consumers can still
 * answer "how many distinct strains" without paging through.
 */
export interface PagedTableResponse extends TableResponse {
  page: number;
  pageSize: number;
  totalRows: number;
  hasMore: boolean;
  distinct_summary?: Record<string, unknown> | { _meta: string };
}

/**
 * Page-by-page table loader for large per-class tables. Use when the
 * caller wants infinite-scroll semantics over a class whose row count
 * might be in the thousands (Bhar's `ontologyTableRow` is 5,297 rows;
 * the unpaged hook returns a ~6 MB blob that bloats memory + bandwidth).
 *
 * Contract:
 *   - The query function fetches one page (`pageParam`) at a time using
 *     the server-side pagination supported by the backend's tables
 *     router (Stream 5.8 acceptance: `{page, pageSize, totalRows, hasMore}`).
 *   - The component flat-maps `data.pages.flatMap(p => p.rows)` for
 *     rendering; `distinct_summary` is taken from `data.pages[0]` since
 *     it's identical across pages.
 *   - `getNextPageParam` advances while `hasMore === true`.
 *
 * Per-page timeout / retry posture matches `useSummaryTable`. Stale
 * window same.
 *
 * The legacy `useSummaryTable` is preserved for callers that genuinely
 * want every row in one shot (Document Explorer's full-set fetch).
 * Callers should prefer this hook for any view that can do progressive
 * loading.
 */
export function usePagedDatasetTable(
  datasetId: string | undefined,
  className: string | undefined,
  pageSize: number,
) {
  return useInfiniteQuery({
    queryKey: ['table:paged', datasetId, className, pageSize],
    queryFn: ({ pageParam, signal }) =>
      apiFetch<PagedTableResponse>(
        `/api/datasets/${datasetId}/tables/${className}?page=${pageParam}&pageSize=${pageSize}`,
        { signal, timeoutMs: TABLE_TIMEOUT_MS },
      ),
    initialPageParam: 1,
    /** Walk to the next page while the backend says there's more. */
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: !!datasetId && !!className,
    retry: 0,
    staleTime: TABLE_STALE_MS,
  });
}

/**
 * Canonical table types the UI knows about. Matches the backend's
 * `SUPPORTED_CLASSES` plus the dedicated `combined` + `ontology` routes.
 */
export type TableType =
  | 'combined'
  | 'subject'
  | 'element'
  | 'element_epoch'
  | 'treatment'
  | 'probe_location'
  | 'openminds_subject'
  | 'ontology';

'use client';

/**
 * Table hooks — summary tables (per NDI class), combined join, ontology
 * groups. Ported verbatim from `ndi-data-browser-v2/frontend/src/api/tables.ts`.
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

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
const TABLE_TIMEOUT_MS = 60_000;
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

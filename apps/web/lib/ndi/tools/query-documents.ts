/**
 * `query_documents` — pull a class-filtered table of NDI documents
 * inside a single dataset.
 *
 * Calls the existing FastAPI route:
 *
 *   GET /api/datasets/:id/tables/:className?page=&pageSize=
 *
 * which returns an enriched table view (columns + rows) where each
 * row carries the class-specific fields plus joined ontology /
 * subject / probe-location enrichments. Examples by class:
 *
 *   - subject:               speciesName, strainName, biologicalSexName,
 *                            speciesOntology (NCBITaxon:6239), …
 *   - probe:                 probeType, num_channels, brainRegion, …
 *   - stimulus_presentation: stim parameters per presentation
 *   - vmspikesummary:        mean_firing_rate_hz, n_spikes, duration_s
 *   - element / element_epoch / treatment / openminds_subject etc.
 *
 * This is the *document-level* lookup that lets the chat answer
 * "what probe types were used in dataset X" or "what stimuli were
 * presented during epoch Y" — questions that the catalog-level tools
 * (list_published_datasets, get_dataset, get_facets) cannot reach.
 *
 * # Citations
 *
 * Each row gets one reference. The row's own NDI document ID is
 * harvested from the first column key ending in `DocumentIdentifier`
 * (subjectDocumentIdentifier, sessionDocumentIdentifier, etc.) so
 * the citation chip can deep-link straight into the Document
 * Explorer (`/datasets/[datasetId]/documents/[ndiId]`) — the Document
 * Explorer route accepts both MongoDB ObjectIds and NDI IDs.
 *
 * When a row has no obvious self-doc-id (some derived tables don't),
 * the row's reference falls back to the dataset overview so the
 * citation still leads somewhere navigable.
 */
import { z } from 'zod';

import { makeReference, type Reference } from '../references';
import {
  baseUrl,
  fetchJson,
  isErrorResult,
  logToolInvocation,
  type ToolContext,
  type ToolResult,
} from './shared';

export const queryDocumentsInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  className: z.string().min(1, 'className is required'),
  /**
   * Max rows to return. Capped at 30 (was 100 — but at 100, a
   * `subject` query with ~5K rows in the dataset fed back 200KB of
   * row data and tripped Claude's 200K-token context limit). 30 rows
   * is a comfortable survey cap — for "give me the distinct values
   * across all rows" the model should make multiple narrower queries
   * or call get_facets instead. Default is 10 to keep tool-call
   * payloads small unless the model explicitly asks for more.
   */
  limit: z.number().int().positive().max(30).optional(),
});

export interface TableColumn {
  key: string;
  label: string;
}

/**
 * Per-column cardinality + top-K values across ALL rows the backend
 * built (NOT just the page we slice for the LLM). Lets the model say
 * "9 distinct strains across 215 subjects" without sampling every row.
 *
 * When the backing table has more than ~10K rows the backend skips the
 * scan and returns `{_meta: "skipped due to large row count"}` instead;
 * the LLM should pivot to `ndi_query` or `get_facets` at that scale.
 *
 * Surfaced 2026-05-14 after a smoke test where `query_documents(
 * className=treatment)` on Dabrowska BNST returned 49 rows all named
 * "Optogenetic Tetanus Stimulation Target Location"; the LLM assumed
 * only optogenetic treatments existed because every row looked the
 * same. distinct_summary shows the collapse — see
 * `lib/ai/system-prompt.ts` for the guidance text.
 */
export interface DistinctSummaryEntry {
  distinct_count: number;
  top_values: Array<{ value: unknown; count: number }>;
}

export type DistinctSummary =
  | Record<string, DistinctSummaryEntry>
  | { _meta: string };

interface RawTableResponse {
  columns?: TableColumn[];
  rows?: Array<Record<string, unknown>>;
  /**
   * Legacy unpaged envelopes expose `total`; paged envelopes (Stream 5.8,
   * 2026-05-16) expose `totalRows`. Accept either so this handler works
   * against both deployments during the rollout window.
   */
  total?: number;
  totalRows?: number;
  /** Paginated envelope fields (Stream 5.8). Optional for backward compat. */
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  distinct_summary?: DistinctSummary;
}

export interface QueryDocumentsResult {
  className: string;
  columns: TableColumn[];
  rows: Array<Record<string, unknown> & { _reference: Reference }>;
  /** Total number of rows available; the `rows` array may be a paged subset. */
  totalRows: number;
  /**
   * Per-column distinct-value summary computed over ALL backend rows
   * (not the page slice). Use this to detect single-value collapse
   * (e.g. `treatmentName: [{value: 'Optogenetic…', count: 49}]` —
   * conceptual question may need a different className).
   */
  distinctSummary?: DistinctSummary;
  /** Cardinal references — same set the row-level `_reference` fields point at. */
  references: Reference[];
}

/**
 * Find the column key that represents the row's own document ID, if
 * any. NDI's table-builder names this column `<class>DocumentIdentifier`
 * — e.g. `subjectDocumentIdentifier` for subject rows. The value is the
 * NDI ID (the `412...` form). When no such column exists the row has
 * no clean self-citation; we fall back to the dataset reference.
 */
function findDocIdColumn(columns: TableColumn[]): string | null {
  // Prefer the exact `<className>DocumentIdentifier` pattern first.
  for (const col of columns) {
    if (col.key.endsWith('DocumentIdentifier')) return col.key;
  }
  return null;
}

function rowDocId(row: Record<string, unknown>, key: string | null): string | null {
  if (!key) return null;
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function queryDocumentsHandler(
  input: z.infer<typeof queryDocumentsInput>,
  ctx?: ToolContext,
): Promise<ToolResult<QueryDocumentsResult>> {
  logToolInvocation('query_documents', {
    datasetId: input?.datasetId,
    className: input?.className,
    limit: input?.limit,
  });
  const parsed = queryDocumentsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const { datasetId, className } = parsed.data;
  const limit = parsed.data.limit ?? 10;
  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}` +
    `/tables/${encodeURIComponent(className)}?page=1&pageSize=${limit}`;

  const result = await fetchJson<RawTableResponse>(url, ctx);
  if (isErrorResult(result)) return result;

  const columns = result.columns ?? [];
  const allRawRows = result.rows ?? [];
  // Stream 5.8 (2026-05-16): the FastAPI `/tables/{class}` endpoint
  // now honors `page` + `pageSize` query params and returns a paginated
  // envelope `{rows, totalRows, hasMore, page, pageSize}`. We pass
  // pageSize=limit above, so `rows` is already server-sliced.
  //
  // Prefer the new `totalRows` field; fall back to `total` (legacy
  // pre-pagination envelope still in use until Railway redeploys); fall
  // back to `allRawRows.length` (sealed envelope without either field).
  //
  // The client-side `.slice(0, limit)` we used to apply is now a safety
  // net only — when the backend respects pagination, `allRawRows` is
  // already capped at `limit`, so this slice is a no-op. We keep it to
  // defensively bound the LLM-visible rows even if a future backend
  // regression starts returning all rows again.
  const totalAvailable =
    result.totalRows ?? result.total ?? allRawRows.length;
  const rawRows = allRawRows.slice(0, limit);
  const docIdKey = findDocIdColumn(columns);

  const rows = rawRows.map((row) => {
    const docId = rowDocId(row, docIdKey);
    const reference: Reference = docId
      ? makeReference({
          datasetId,
          doc_id: docId,
          class: className,
          title: humanizeRowTitle(row, className),
          snippet: humanizeRowSnippet(row, columns),
        })
      : {
          doc_id: datasetId,
          url: `/datasets/${datasetId}/overview`,
          class: 'dataset',
          title: '(row has no self document id)',
          snippet: humanizeRowSnippet(row, columns),
        };
    return { ...row, _reference: reference };
  });

  const references = rows.map((r) => r._reference);

  return {
    className,
    columns,
    rows,
    totalRows: totalAvailable,
    distinctSummary: result.distinct_summary,
    references,
  };
}

/**
 * Build a short, human-readable title for a row's citation chip.
 *
 * Priority: a `name`-like column → an identifier column → fallback to
 * the class name + a row index. The chip is small; a 60-char cap keeps
 * it readable on hover.
 */
function humanizeRowTitle(row: Record<string, unknown>, className: string): string {
  const candidates = [
    row.name,
    row.subjectLocalIdentifier,
    row.subjectIdentifier,
    row.elementName,
    row.probeName,
    row.localIdentifier,
    row.identifier,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c.slice(0, 80);
  }
  return `${className} row`;
}

/**
 * Build a one-liner preview snippet by joining 2-3 informative fields.
 * Keeps the chip's hover preview useful without dumping the full row.
 */
function humanizeRowSnippet(
  row: Record<string, unknown>,
  columns: TableColumn[],
): string {
  const preferredKeys = [
    'speciesName',
    'strainName',
    'probeType',
    'brainRegion',
    'biologicalSexName',
    'stimulusType',
  ];
  const parts: string[] = [];
  for (const key of preferredKeys) {
    const v = row[key];
    if (typeof v === 'string' && v.length > 0) parts.push(v);
    if (parts.length >= 3) break;
  }
  if (parts.length === 0) {
    // Last resort — take the first 2 string-valued columns from the
    // columns array, in display order.
    for (const col of columns) {
      const v = row[col.key];
      if (typeof v === 'string' && v.length > 0 && v.length < 80) {
        parts.push(`${col.label}: ${v}`);
        if (parts.length >= 2) break;
      }
    }
  }
  return parts.join(' · ').slice(0, 120);
}

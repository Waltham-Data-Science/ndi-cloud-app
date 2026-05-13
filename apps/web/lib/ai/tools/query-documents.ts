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
import { baseUrl, fetchJson, isErrorResult, type ToolResult } from './shared';

export const queryDocumentsInput = z.object({
  datasetId: z.string().min(1, 'datasetId is required'),
  className: z.string().min(1, 'className is required'),
  limit: z.number().int().positive().max(100).optional(),
});

export interface TableColumn {
  key: string;
  label: string;
}

interface RawTableResponse {
  columns?: TableColumn[];
  rows?: Array<Record<string, unknown>>;
  total?: number;
}

export interface QueryDocumentsResult {
  className: string;
  columns: TableColumn[];
  rows: Array<Record<string, unknown> & { _reference: Reference }>;
  /** Total number of rows available; the `rows` array may be a paged subset. */
  totalRows: number;
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
): Promise<ToolResult<QueryDocumentsResult>> {
  const parsed = queryDocumentsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const { datasetId, className } = parsed.data;
  const limit = parsed.data.limit ?? 20;
  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}` +
    `/tables/${encodeURIComponent(className)}?page=1&pageSize=${limit}`;

  const result = await fetchJson<RawTableResponse>(url);
  if (isErrorResult(result)) return result;

  const columns = result.columns ?? [];
  const rawRows = result.rows ?? [];
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
    totalRows: result.total ?? rows.length,
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

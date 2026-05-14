/**
 * `get_document` — fetch the FULL body of a single NDI document.
 *
 * Companion to `ndi_query` / `query_documents`, which both surface
 * compact per-doc projections. When the LLM identifies a specific doc
 * of interest from a query result and needs the FULL body
 * (`data.<class>.<full payload>`, including nested objects + arrays
 * the projection trimmed), it chains into `get_document` by docId.
 *
 * This tool was referenced for months in `ndi_query`'s description and
 * the system prompt (`"chain into get_document"`) before being
 * implemented — its absence meant the LLM's natural follow-up call
 * silently failed with "unknown tool," confusing the model and
 * producing degraded answers. Cross-cutting code-review agent caught it.
 *
 * Backend route: `GET /api/datasets/:datasetId/documents/:documentId`
 * (already exists; same path the Document Explorer uses).
 */
import { z } from 'zod';

import { makeReference, type Reference } from '../references';
import { baseUrl, fetchJson, isErrorResult, type ToolResult } from './shared';

export const getDocumentInput = z.object({
  /** Dataset ID (24-char hex). */
  datasetId: z
    .string()
    .min(1, 'datasetId is required')
    .max(64),
  /** Document ID. NDI doc IDs vary in format but are short ASCII strings. */
  docId: z
    .string()
    .min(1, 'docId is required')
    .max(256),
});

export type GetDocumentInput = z.infer<typeof getDocumentInput>;

interface BackendDocumentResponse {
  id?: string;
  _id?: string;
  ndiId?: string;
  datasetId?: string;
  document_class?: { class_name?: string; superclasses?: unknown };
  data?: Record<string, unknown>;
  depends_on?: unknown;
  files?: unknown;
  [k: string]: unknown;
}

export interface GetDocumentToolResult {
  /** Echo of the input docId for round-trip clarity. */
  doc_id: string;
  /** The full document body as returned by the backend. */
  document: BackendDocumentResponse;
  /** Backend-reported class name (top of the lineage). */
  class: string | null;
  references: Reference[];
}

export async function getDocumentHandler(
  input: GetDocumentInput,
): Promise<ToolResult<GetDocumentToolResult>> {
  const parsed = getDocumentInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }
  const { datasetId, docId } = parsed.data;

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const url =
    `${base}/api/datasets/${encodeURIComponent(datasetId)}/documents/` +
    `${encodeURIComponent(docId)}`;
  const res = await fetchJson<BackendDocumentResponse>(url);
  if (isErrorResult(res)) return res;

  const cls =
    typeof res.document_class?.class_name === 'string'
      ? res.document_class.class_name
      : null;
  const reference = makeReference({
    datasetId,
    doc_id: docId,
    class: cls ?? 'document',
    title: `Document ${docId}${cls ? ` (${cls})` : ''}`,
    snippet: 'Full document body fetched on demand',
  });

  return {
    doc_id: docId,
    document: res,
    class: cls,
    references: [reference],
  };
}

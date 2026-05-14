/**
 * `ndi_query` — structured Query DSL across one OR many NDI datasets.
 *
 * This is the TIER 2 cross-dataset query tool — the killer "AI-readiness"
 * demo that proves NDI's curated metadata schema is queryable like a
 * graph database. Under the hood:
 *
 *   chat tool (this file)
 *     → ndb-v2  POST /api/query (auto-paginates up to 50k docs, returns
 *                                {documents, totalItems, page, pageSize})
 *       → cloud-node POST /ndiquery (Mongo query via NDIQueryTranslator)
 *
 * Scope can be:
 *   - "public"  → every published dataset (anonymous-friendly)
 *   - CSV of 24-char hex dataset IDs (e.g. "ID1,ID2,ID3") for a curated
 *     cross-dataset query
 *   - "all" / "private" → require auth; we surface a typed error in the
 *     chat (the /ask preview is anonymous-only)
 *
 * Search structure follows NDI's `ndi.query.Query` DSL — flat array of
 * clauses, each a typed operation. Cloud-node hardens the inputs against
 * NoSQL operator injection, regex DoS, and deep `or` recursion, so this
 * tool stays a thin pass-through. We do echo the same operation allowlist
 * client-side to fail fast before a round-trip on obvious typos.
 *
 * Returns a compact projection of each matching document — full bodies
 * would blow the chat's token budget on a 10k-row query. The LLM is
 * taught to chain into `get_document` (single-doc full fetch) when it
 * needs the full body of a specific match.
 */
import { z } from 'zod';

import {
  makeReference,
  makeDatasetReference,
  type Reference,
} from '../references';
import { baseUrl, type ToolError, type ToolResult } from './shared';

const TOOL_TIMEOUT_MS = 12_000; // bigger than catalog tools — ndiquery can fetch up to 50k docs

// Operation allowlist — MUST stay in sync with ndb-v2's
// `backend/services/query_service.py:ALLOWED_OPS` (which itself mirrors
// cloud-node's NDIQueryTranslator). Negated variants prefix `~`; `~or`
// is intentionally rejected on both sides (it'd silently narrow rather
// than negate). Documented in NDI-python `query/ndi_query.py`.
const ALLOWED_OPS = [
  'isa',
  'depends_on',
  'or',
  'exact_string',
  'exact_string_anycase',
  'contains_string',
  'regexp',
  'exact_number',
  'lessthan',
  'lessthaneq',
  'greaterthan',
  'greaterthaneq',
  'hasfield',
  'hasmember',
  'hasanysubfield_contains_string',
  'hasanysubfield_exact_string',
] as const;

const opSchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (v) => {
      const base = v.startsWith('~') ? v.slice(1) : v;
      return (ALLOWED_OPS as readonly string[]).includes(base);
    },
    {
      message:
        `operation must be one of: ${ALLOWED_OPS.join(', ')} (optionally prefixed with ~ for negation; ~or is not allowed)`,
    },
  )
  .refine((v) => v !== '~or', { message: '~or is not allowed' });

// One clause in the search tree. `param1` / `param2` are deliberately
// permissive (`unknown`) because operations have heterogeneous shapes:
//   - exact_string  → param1: string
//   - greaterthan   → param1: number
//   - or            → param1, param2: QueryNode[]
//   - depends_on    → param1: edge-name string ("*" for any), param2: docId
// Cloud-node does the per-op type check; we keep the client schema thin
// to avoid duplicating that table.
const queryNodeSchema: z.ZodType<QueryNode> = z.lazy(() =>
  z.object({
    operation: opSchema,
    field: z.string().min(1).max(256).optional(),
    param1: z.unknown().optional(),
    param2: z.unknown().optional(),
  }),
);

interface QueryNode {
  operation: string;
  field?: string;
  param1?: unknown;
  param2?: unknown;
}

const scopeSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (v) => {
      if (v === 'public' || v === 'private' || v === 'all') return true;
      const parts = v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return (
        parts.length > 0 &&
        parts.every((p) => /^[a-fA-F0-9]{24}$/.test(p))
      );
    },
    {
      message:
        'scope must be "public", or a comma-separated list of 24-char hex dataset IDs (for cross-dataset queries)',
    },
  );

export const ndiQueryInput = z.object({
  /**
   * Scope of the query:
   *   - "public"           → every published dataset (anonymous-friendly)
   *   - "ID1,ID2,ID3"      → curated CSV of 24-char hex dataset IDs
   *
   * "private" and "all" require auth and will return an error in the
   * anonymous /ask preview.
   */
  scope: scopeSchema,
  /**
   * Search structure — array of NDI Query clauses (matches MATLAB
   * ndi.query and Python ndi.query.Query semantics).
   *
   * Each clause: { operation, field?, param1?, param2? }
   *
   * Common patterns:
   *   - isa class:                      { operation: "isa", param1: "probe" }
   *   - field equals string:            { operation: "exact_string", field: "probe.type", param1: "n-trode" }
   *   - field contains substring:       { operation: "contains_string", field: "subject.strain", param1: "C57" }
   *   - numeric comparison:             { operation: "greaterthan", field: "trial.duration", param1: 30 }
   *   - field exists:                   { operation: "hasfield", field: "subject.dob" }
   *   - depends on a doc:               { operation: "depends_on", param1: "*", param2: "<docId>" }
   *   - OR sub-trees:                   { operation: "or", param1: [{...}], param2: [{...}] }
   *   - negate any of the above:        prefix the operation with "~" (e.g. "~isa", "~contains_string")
   *
   * Top-level clauses are AND-combined.
   */
  searchstructure: z
    .array(queryNodeSchema)
    .min(1, 'searchstructure must contain at least one clause')
    .max(20, 'searchstructure capped at 20 top-level clauses'),
  /**
   * Max documents returned to the chat. Backend can match up to 50k —
   * we cap the LLM-visible slice to keep the token budget sane. The
   * `total_items` field surfaces the true count for accurate answers.
   */
  limit: z.number().int().positive().max(200).optional(),
});

export type NdiQueryInput = z.infer<typeof ndiQueryInput>;

interface BackendDocument {
  id?: string;
  _id?: string;
  ndiId?: string;
  datasetId?: string;
  dataset?: string;
  document_class?: { class_name?: string };
  classLineage?: string[];
  data?: Record<string, unknown>;
  depends_on?: unknown;
  [k: string]: unknown;
}

interface BackendQueryResponse {
  documents: BackendDocument[];
  totalItems: number;
  page: number;
  pageSize: number;
}

/** Compact per-doc projection the LLM sees. */
interface NdiQueryDocSummary {
  id: string;
  class: string;
  datasetId: string;
  /**
   * Most identifying field for the class (best-effort): for probe →
   * type/name; for subject → subjectName / local_identifier; etc.
   * `null` when we couldn't extract a sensible label.
   */
  label: string | null;
  /**
   * Top-level `data.<class>` payload trimmed to keep the doc <~600
   * bytes serialized. The LLM can chain into `get_document` for the
   * full body when needed.
   */
  data_preview: Record<string, unknown> | null;
}

export interface NdiQueryToolResult {
  documents: NdiQueryDocSummary[];
  /** Backend's true total — may exceed `documents.length` if capped. */
  total_items: number;
  /** True when `total_items > documents.length`. */
  truncated: boolean;
  /**
   * Echo of the scope used — handy for the LLM to mention in answers
   * ("across 8 public datasets" vs "across 3 selected datasets").
   */
  scope: string;
  references: Reference[];
}

export async function ndiQueryHandler(
  input: NdiQueryInput,
): Promise<ToolResult<NdiQueryToolResult>> {
  const parsed = ndiQueryInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { scope, searchstructure, limit } = parsed.data;
  if (scope === 'private' || scope === 'all') {
    return {
      error:
        'scope="private" and scope="all" require authentication; the /ask preview is anonymous-only. Use scope="public" for catalog-wide queries, or a CSV of dataset IDs for a curated cross-dataset query.',
    };
  }

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const visibleCap = Math.min(limit ?? 50, 200);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  let body: BackendQueryResponse;
  try {
    const res = await fetch(`${base}/api/query`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
      body: JSON.stringify({ scope, searchstructure }),
    });
    if (!res.ok) {
      // Try to surface the backend's typed-error message — ndb-v2
      // returns 422 for invalid Query DSL and 413/504 for too-large /
      // timed-out queries.
      let detail = '';
      try {
        const errBody = (await res.json()) as { detail?: unknown; message?: unknown };
        if (typeof errBody.detail === 'string') detail = errBody.detail;
        else if (typeof errBody.message === 'string') detail = errBody.message;
      } catch {
        // body wasn't JSON; fall back to status only
      }
      return {
        error: `Query failed (${res.status}${detail ? `: ${detail}` : ''})`,
      };
    }
    body = (await res.json()) as BackendQueryResponse;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { error: `Network timeout (${TOOL_TIMEOUT_MS / 1000}s exceeded)` };
    }
    return { error: `Network error contacting query service: ${errMsg(e)}` };
  } finally {
    clearTimeout(timer);
  }

  const allDocs = Array.isArray(body.documents) ? body.documents : [];
  const totalItems = typeof body.totalItems === 'number' ? body.totalItems : allDocs.length;
  const sliced = allDocs.slice(0, visibleCap);

  const summaries: NdiQueryDocSummary[] = sliced.map(projectDoc);
  // One reference per surfaced doc up to a soft cap of 20 — beyond that
  // the chat panel becomes a wall of chips. The LLM is taught to focus
  // its citations on the docs it actually mentions in prose.
  const references: Reference[] = summaries
    .slice(0, 20)
    .map((d) =>
      d.datasetId
        ? makeReference({
            datasetId: d.datasetId,
            doc_id: d.id,
            class: d.class,
            title: d.label ?? `${d.class} document`,
            snippet: refSnippet(d),
          })
        : null,
    )
    .filter((r): r is Reference => r !== null);

  // Fallback dataset-level reference if no per-doc references were
  // buildable (e.g. cloud-node didn't surface datasetId for the result
  // shape). Doesn't apply for empty result sets — those don't need refs.
  if (references.length === 0 && summaries.length > 0 && scope.match(/^[a-fA-F0-9]{24}$/)) {
    references.push(
      makeDatasetReference({
        datasetId: scope,
        title: `Query results (${totalItems} match${totalItems === 1 ? '' : 'es'})`,
        snippet: `ndi_query over ${scope.slice(0, 8)}…`,
      }),
    );
  }

  return {
    documents: summaries,
    total_items: totalItems,
    truncated: totalItems > summaries.length,
    scope,
    references,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function projectDoc(d: BackendDocument): NdiQueryDocSummary {
  const id = (d.id ?? d._id ?? d.ndiId ?? '').toString();
  const datasetId = (d.datasetId ?? d.dataset ?? '').toString();
  const cls = extractClass(d);
  const data = (d.data ?? null) as Record<string, unknown> | null;
  return {
    id,
    class: cls,
    datasetId,
    label: extractLabel(d, cls),
    data_preview: trimDataForLlm(data, cls),
  };
}

function extractClass(d: BackendDocument): string {
  if (d.document_class?.class_name) return d.document_class.class_name;
  if (Array.isArray(d.classLineage) && d.classLineage.length > 0) {
    return d.classLineage[d.classLineage.length - 1] ?? 'unknown';
  }
  return 'unknown';
}

function extractLabel(d: BackendDocument, cls: string): string | null {
  const data = d.data ?? null;
  if (!data || typeof data !== 'object') return null;
  // The per-class projection: `data` is keyed by class name, e.g.
  // `data.probe = {type, name, ...}`. Try a few common identifying
  // fields in order of usefulness.
  const inner = (data as Record<string, unknown>)[cls];
  if (inner && typeof inner === 'object') {
    const obj = inner as Record<string, unknown>;
    for (const key of [
      'name',
      'type',
      'subjectName',
      'local_identifier',
      'label',
      'value',
      'reference',
    ]) {
      const v = obj[key];
      if (typeof v === 'string' && v.length > 0) {
        return v.slice(0, 80);
      }
    }
  }
  return null;
}

// Token-budget guard: serialize `data.<class>` payload to JSON and
// truncate to ~600 chars. The LLM can ask for the full body via
// `get_document` if it needs more.
const DATA_PREVIEW_CHAR_CAP = 600;

function trimDataForLlm(
  data: Record<string, unknown> | null,
  cls: string,
): Record<string, unknown> | null {
  if (!data) return null;
  const inner = data[cls];
  if (!inner || typeof inner !== 'object') {
    // Class-keyed projection not present — just truncate the whole
    // serialized blob and surface a synthetic key so the LLM still
    // sees something.
    const serialized = JSON.stringify(data);
    return {
      _truncated_preview:
        serialized.length > DATA_PREVIEW_CHAR_CAP
          ? `${serialized.slice(0, DATA_PREVIEW_CHAR_CAP)}…`
          : serialized,
    };
  }
  // Walk the inner object and skip any field whose serialized form is
  // huge (raw value arrays, embedded blobs, etc.).
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inner as Record<string, unknown>)) {
    const serialized = JSON.stringify(v);
    if (serialized && serialized.length > DATA_PREVIEW_CHAR_CAP) {
      out[k] = `<truncated: ${serialized.length} bytes>`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function refSnippet(d: NdiQueryDocSummary): string {
  if (d.label) return `${d.class}: ${d.label}`;
  return `${d.class} document`;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Re-export the error type for the registry's typings.
export type { ToolError };

/**
 * `aggregate_documents` — compute per-field summary statistics across an
 * `ndi_query`-matched set of NDI documents.
 *
 * Stream 4.9 (2026-05-16): aggregation moved server-side per ADR-001
 * (Heart-on-Railway). This file is now a THIN CLIENT — input validation
 * + POST to FastAPI + Reference assembly from the backend's per-group
 * sample-doc projection. The 400+ lines of numeric extraction / grouping
 * / stats math that lived here pre-2026-05-16 are gone; they live in
 * `backend/services/aggregate_documents_service.py` now.
 *
 * The LLM-facing contract is unchanged so the system prompt + chat-tool
 * descriptions stay untouched:
 *
 *   - input shape (scope, searchstructure, valueField, groupBy?, maxDocs?)
 *   - output shape (total_items, numeric_matches, truncated, valueField,
 *     groups[{group, count, mean, median, std, min, max}], references,
 *     references_summary)
 */
import { z } from 'zod';

import {
  makeDatasetReference,
  makeReference,
  type Reference,
} from '../references';
import {
  baseUrl,
  logToolInvocation,
  postJson,
  isErrorResult,
  type ToolContext,
  type ToolResult,
} from './shared';

// Mirror the operation allowlist from ndi-query / aggregate-documents
// service — kept identical to the backend's pydantic schema so the LLM's
// pre-flight validation matches what the server will accept.
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
      message: `operation must be one of: ${ALLOWED_OPS.join(', ')} (optionally prefixed with ~ for negation; ~or is not allowed)`,
    },
  )
  .refine((v) => v !== '~or', { message: '~or is not allowed' });

interface QueryNode {
  operation: string;
  field?: string;
  param1?: unknown;
  param2?: unknown;
}

const queryNodeSchema: z.ZodType<QueryNode> = z.lazy(() =>
  z.object({
    operation: opSchema,
    field: z.string().min(1).max(256).optional(),
    param1: z.unknown().optional(),
    param2: z.unknown().optional(),
  }),
);

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
      return parts.length > 0 && parts.every((p) => /^[a-fA-F0-9]{24}$/.test(p));
    },
    {
      message:
        'scope must be "public", or a comma-separated list of 24-char hex dataset IDs',
    },
  );

export const aggregateDocumentsInput = z.object({
  scope: scopeSchema,
  searchstructure: z
    .array(queryNodeSchema)
    .min(1, 'searchstructure must contain at least one clause')
    .max(20, 'searchstructure capped at 20 top-level clauses'),
  /**
   * Dotted field path to the NUMERIC value to aggregate. Looked up
   * relative to each matching doc — typically `data.<class>.<key>`,
   * e.g. "data.vmspikesummary.mean_firing_rate" or
   * "data.subject.weight_grams".
   */
  valueField: z
    .string()
    .min(1, 'valueField is required (dotted path to the numeric field, e.g. "data.subject.weight_grams")')
    .max(256),
  /**
   * Optional dotted field path to a CATEGORICAL grouping field. When
   * set, the response returns one stats block per distinct value
   * (e.g. groupBy="data.subject.strain" splits by strain). When unset,
   * returns one block over all matches.
   */
  groupBy: z.string().min(1).max(256).optional(),
  /**
   * Hard cap on docs scanned. Default 5000 (matches server-side); the
   * backend's auto-pagination ceiling is 50000 but very large queries
   * are usually a sign of an under-constrained filter — the LLM gets a
   * more useful answer faster from a tighter query.
   */
  maxDocs: z.number().int().positive().max(50_000).optional(),
});

export type AggregateDocumentsInput = z.infer<typeof aggregateDocumentsInput>;

// ---------------------------------------------------------------------
// Backend envelope (matches AggregateDocumentsService.aggregate response)
// ---------------------------------------------------------------------

interface BackendGroupSampleDoc {
  id: string;
  dataset_id: string;
  class: string;
}

interface BackendGroup {
  group: string;
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  sample_doc: BackendGroupSampleDoc | null;
}

interface BackendAggregateResponse {
  total_items: number;
  numeric_matches: number;
  truncated: boolean;
  valueField: string;
  scanned_docs: number;
  groups: BackendGroup[];
  datasets_contributing: string[];
}

// ---------------------------------------------------------------------
// LLM-facing return shape — unchanged contract from pre-2026-05-16
// ---------------------------------------------------------------------

export interface GroupStats {
  group: string;
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
}

export interface AggregateDocumentsToolResult {
  total_items: number;
  numeric_matches: number;
  truncated: boolean;
  valueField: string;
  groups: GroupStats[];
  references: Reference[];
  references_summary: {
    cited: number;
    datasets_cited: number;
    groups_cited: number;
    scanned_docs: number;
    total_available: number;
    truncated: boolean;
    cap: number;
  };
}

const REFERENCE_CAP = 30;

export async function aggregateDocumentsHandler(
  input: AggregateDocumentsInput,
  ctx?: ToolContext,
): Promise<ToolResult<AggregateDocumentsToolResult>> {
  logToolInvocation('aggregate_documents', {
    scope: input?.scope,
    clauseCount: Array.isArray(input?.searchstructure)
      ? input.searchstructure.length
      : 0,
    valueField: input?.valueField,
    hasGroupBy: typeof input?.groupBy === 'string' && input.groupBy.length > 0,
    maxDocs: input?.maxDocs,
  });
  const parsed = aggregateDocumentsInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const { scope, searchstructure, valueField, groupBy, maxDocs } = parsed.data;
  if (scope === 'private' || scope === 'all') {
    return {
      error:
        'scope="private" and scope="all" require authentication; the /ask preview is anonymous-only. Use scope="public" for catalog-wide queries, or a CSV of dataset IDs for a curated cross-dataset query.',
    };
  }

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  // Stream 4.9 (2026-05-16): aggregation lives on Railway. The backend
  // returns per-group stats + sample-doc projections; we just translate
  // those into Reference chips for the chat UI.
  const result = await postJson<BackendAggregateResponse>(
    `${base}/api/aggregate-documents`,
    {
      scope,
      searchstructure,
      valueField,
      ...(groupBy ? { groupBy } : {}),
      ...(maxDocs !== undefined ? { maxDocs } : {}),
    },
    ctx,
  );
  if (isErrorResult(result)) return result;

  // Strip sample_doc from each group for the LLM-facing groups array —
  // the chat doesn't need per-group sample-doc IDs in its prose; they're
  // expressed via References instead.
  const groups: GroupStats[] = result.groups.map((g) => ({
    group: g.group,
    count: g.count,
    mean: g.mean,
    median: g.median,
    std: g.std,
    min: g.min,
    max: g.max,
  }));

  // Build references — layered for granular traceability, matching the
  // pre-port surface:
  //
  // 1. Per-group sample chips when groupBy is set AND we have >1 group
  //    (gives the user "one example from each bucket" drill-in).
  // 2. Per-dataset chips for every distinct contributing dataset (capped
  //    at REFERENCE_CAP — backend already capped, this is belt-and-
  //    suspenders).
  // 3. Single-doc fallback when n=1 across the whole aggregation.
  const refs: Reference[] = [];

  if (groupBy && result.groups.length > 1) {
    for (const g of result.groups) {
      if (!g.sample_doc) continue;
      refs.push(
        makeReference({
          datasetId: g.sample_doc.dataset_id,
          doc_id: g.sample_doc.id,
          class: g.sample_doc.class,
          title: `Sample ${g.group}: ${g.sample_doc.class}`,
          snippet:
            `One of ${g.count} doc${g.count === 1 ? '' : 's'} contributing to the ` +
            `${g.group} group (${valueField}=${
              Number.isFinite(g.mean) ? g.mean.toFixed(2) : 'NaN'
            } mean). Click to inspect.`,
        }),
      );
    }
  }

  for (const ds of result.datasets_contributing) {
    if (refs.length >= REFERENCE_CAP) break;
    refs.push(
      makeDatasetReference({
        datasetId: ds,
        title: `Aggregation source (${valueField})`,
        snippet: `Contributed to ${valueField} stats — n=${result.numeric_matches}`,
      }),
    );
  }

  // Single-source fallback: an aggregation of exactly one match deserves
  // a doc-level chip so the user can verify the one number directly.
  if (result.numeric_matches === 1 && refs.length < REFERENCE_CAP) {
    const sample = result.groups.find((g) => g.sample_doc)?.sample_doc;
    if (sample) {
      refs.push(
        makeReference({
          datasetId: sample.dataset_id,
          doc_id: sample.id,
          class: sample.class,
          title: `${sample.class} contributing to ${valueField}`,
          snippet: 'Single source for the aggregate (n=1)',
        }),
      );
    }
  }

  // Dataset-fallback when scope is a single 24-char id AND no refs were
  // built (e.g. empty groups). Keeps a clickable handle in the citation
  // panel even on empty results.
  if (refs.length === 0 && /^[a-fA-F0-9]{24}$/.test(scope) && groups.length > 0) {
    refs.push(
      makeDatasetReference({
        datasetId: scope,
        title: `Aggregation source (${valueField})`,
        snippet: `n=${result.numeric_matches} of ${result.total_items} match${result.total_items === 1 ? '' : 'es'}`,
      }),
    );
  }

  return {
    total_items: result.total_items,
    numeric_matches: result.numeric_matches,
    truncated: result.truncated,
    valueField: result.valueField,
    groups,
    references: refs,
    references_summary: {
      cited: refs.length,
      datasets_cited: result.datasets_contributing.length,
      groups_cited: groupBy ? groups.length : 0,
      scanned_docs: result.scanned_docs,
      total_available: result.total_items,
      truncated: result.truncated,
      cap: REFERENCE_CAP,
    },
  };
}

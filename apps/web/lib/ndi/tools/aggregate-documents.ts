/**
 * `aggregate_documents` — compute per-field summary statistics across a
 * Query-matched set of NDI documents.
 *
 * Companion to `ndi_query`. Where `ndi_query` returns the raw match
 * projection (capped at 200 docs visible to the LLM), this tool runs the
 * SAME query but aggregates a numeric field across ALL matches (up to
 * 50k via ndb-v2's auto-pagination) and returns just the stats. Token
 * cost is constant regardless of match count — `total_items` says how
 * many docs went into the stats so the LLM can claim "across 215
 * subjects, …".
 *
 * Why a separate tool instead of teaching the LLM to do arithmetic on
 * `ndi_query` results: LLMs reliably mis-aggregate >50 numbers (drift,
 * precision loss, silent dropouts). Doing the math server-side is
 * deterministic and cheap.
 *
 * Optional `groupBy` field path enables "average X grouped by Y"
 * patterns (e.g. "average input resistance grouped by strain"). When
 * unset, returns a single aggregate over all matches.
 */
import { z } from 'zod';

import {
  makeDatasetReference,
  makeReference,
  type Reference,
} from '../references';
import {
  baseUrl,
  freshRequestId,
  logToolInvocation,
  type ToolContext,
  type ToolResult,
} from './shared';

const TOOL_TIMEOUT_MS = 15_000; // longer than ndi_query — we may fetch up to 50k docs

// Mirror the operation allowlist from ndi-query — same backend contract
// (the cloud's NDIQueryTranslator). Kept duplicated rather than imported
// so each tool file is self-contained.
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
   * Hard cap on docs scanned. Default 5000; the backend's auto-
   * pagination ceiling is 50000 but very large queries are usually a
   * sign of an under-constrained filter — the LLM gets a more useful
   * answer faster from a tighter query.
   */
  maxDocs: z.number().int().positive().max(50_000).optional(),
});

export type AggregateDocumentsInput = z.infer<typeof aggregateDocumentsInput>;

interface BackendDocument {
  id?: string;
  _id?: string;
  ndiId?: string;
  datasetId?: string;
  dataset?: string;
  document_class?: { class_name?: string };
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

interface BackendQueryResponse {
  documents: BackendDocument[];
  totalItems: number;
  page: number;
  pageSize: number;
}

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
  /** Number of docs that contributed to the stats (had a finite numeric value at `valueField`). */
  numeric_matches: number;
  /** True when the cap was hit before fetching all matches. */
  truncated: boolean;
  /** Echo of the value field path used. */
  valueField: string;
  /** Per-group stats. Single entry with group="all" when groupBy is unset. */
  groups: GroupStats[];
  references: Reference[];
  /**
   * Citation coverage metadata. The LLM is taught to disclose this
   * in prose when truncated=true so users know the aggregation may
   * be over a SAMPLE of matching docs, not all of them.
   */
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

  const cap = maxDocs ?? 5000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  let body: BackendQueryResponse;
  try {
    const res = await fetch(`${base}/api/query`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // See identical comment in ndi-query.ts — Railway's
        // OriginEnforcementMiddleware rejects POST without an
        // allowlisted Origin. ndi-cloud.com is on the default list.
        Origin: 'https://ndi-cloud.com',
        // Match postJson contract: always emit X-Request-Id; forward
        // auth headers when the caller supplied a context (workspace
        // wrapper routes pass them; the chat path leaves ctx undefined).
        'X-Request-Id': ctx?.requestId ?? freshRequestId(),
        ...(ctx?.authHeaders ?? {}),
      },
      signal: controller.signal,
      cache: 'no-store',
      body: JSON.stringify({ scope, searchstructure }),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const errBody = (await res.json()) as { detail?: unknown; message?: unknown };
        if (typeof errBody.detail === 'string') detail = errBody.detail;
        else if (typeof errBody.message === 'string') detail = errBody.message;
      } catch {
        // body wasn't JSON
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
  const scanned = allDocs.slice(0, cap);
  const truncated = totalItems > scanned.length || allDocs.length > cap;

  // Bucket values by group. When groupBy is unset, everything goes
  // to "all". We ALSO track one sample doc per bucket (first
  // contributing) so the frontend can build per-group sample-doc
  // citation chips — granular sourcing so users can verify "what
  // does ONE Saline subject look like" vs "what does ONE CNO
  // subject look like" without manually paging.
  const buckets = new Map<string, number[]>();
  const bucketSampleDocs = new Map<string, BackendDocument>();
  const groupOrder: string[] = [];
  let numericMatches = 0;

  for (const doc of scanned) {
    const v = extractNumeric(doc, valueField);
    if (v === null) continue;

    let groupKey = 'all';
    if (groupBy) {
      const g = extractString(doc, groupBy);
      // Doc has a valid numeric value but no group label — skip
      // entirely so it doesn't inflate numericMatches. Pre-this-fix,
      // numericMatches was incremented BEFORE the group-null check,
      // producing claims like "across 215 subjects" when only a
      // subset actually got bucketed.
      if (g === null) continue;
      groupKey = g;
    }
    // Only count after we've confirmed the doc will be bucketed.
    numericMatches++;
    if (!buckets.has(groupKey)) {
      buckets.set(groupKey, []);
      groupOrder.push(groupKey);
      // First contributing doc per group is the sample for the chip.
      bucketSampleDocs.set(groupKey, doc);
    }
    buckets.get(groupKey)!.push(v);
  }

  const groups: GroupStats[] = groupOrder
    .map((name) => {
      const vals = buckets.get(name) ?? [];
      if (vals.length === 0) return null;
      return { group: name, ...summaryStats(vals) };
    })
    .filter((g): g is GroupStats => g !== null);

  // References, layered for granular traceability:
  //
  // 1. PER-GROUP sample docs (only when groupBy is set AND we have
  //    multiple groups): one chip per group, pointing at the first
  //    contributing document so the user can drill into a concrete
  //    example of what each bucket looks like.
  //
  // 2. DATASET-LEVEL refs: one per distinct contributing dataset
  //    (capped at 20). Lets the user verify scope coverage —
  //    "which datasets did this aggregation pull from?"
  //
  // 3. SINGLE-doc fallback: when only one doc contributed at all,
  //    surface it as a clickable chip (n=1 aggregations need to be
  //    cited specifically, not as a dataset-level claim).
  const REFERENCE_CAP = 30;
  const refs: Reference[] = [];

  if (groupBy && groups.length > 1) {
    for (const groupStat of groups) {
      const sampleDoc = bucketSampleDocs.get(groupStat.group);
      if (!sampleDoc) continue;
      const id = (sampleDoc.id ?? sampleDoc._id ?? sampleDoc.ndiId ?? '').toString();
      const ds = (sampleDoc.datasetId ?? sampleDoc.dataset ?? '').toString();
      const cls = sampleDoc.document_class?.class_name ?? 'document';
      if (id && ds) {
        refs.push(
          makeReference({
            datasetId: ds,
            doc_id: id,
            class: cls,
            title: `Sample ${groupStat.group}: ${cls}`,
            snippet:
              `One of ${groupStat.count} ` +
              `doc${groupStat.count === 1 ? '' : 's'} contributing to the ` +
              `${groupStat.group} group (${valueField}=${
                Number.isFinite(groupStat.mean)
                  ? groupStat.mean.toFixed(2)
                  : 'NaN'
              } mean). Click to inspect.`,
          }),
        );
      }
    }
  }

  const seenDatasets = new Set<string>();
  for (const doc of scanned) {
    const ds = (doc.datasetId ?? doc.dataset ?? '').toString();
    if (!ds || seenDatasets.has(ds) || refs.length >= REFERENCE_CAP) continue;
    seenDatasets.add(ds);
    refs.push(
      makeDatasetReference({
        datasetId: ds,
        title: `Aggregation source (${valueField})`,
        snippet: `Contributed to ${valueField} stats — n=${numericMatches}`,
      }),
    );
  }
  if (refs.length === 0 && /^[a-fA-F0-9]{24}$/.test(scope)) {
    refs.push(
      makeDatasetReference({
        datasetId: scope,
        title: `Aggregation source (${valueField})`,
        snippet: `n=${numericMatches} of ${totalItems} match${totalItems === 1 ? '' : 'es'}`,
      }),
    );
  }
  // For groups dominated by a single doc, surface a doc-level ref to make
  // the chip a useful entry point.
  if (numericMatches === 1 && refs.length < REFERENCE_CAP) {
    const doc = scanned.find((d) => extractNumeric(d, valueField) !== null);
    if (doc) {
      const id = (doc.id ?? doc._id ?? doc.ndiId ?? '').toString();
      const ds = (doc.datasetId ?? doc.dataset ?? '').toString();
      const cls = doc.document_class?.class_name ?? 'document';
      if (id && ds) {
        refs.push(
          makeReference({
            datasetId: ds,
            doc_id: id,
            class: cls,
            title: `${cls} contributing to ${valueField}`,
            snippet: `Single source for the aggregate (n=1)`,
          }),
        );
      }
    }
  }

  return {
    total_items: totalItems,
    numeric_matches: numericMatches,
    truncated,
    valueField,
    groups,
    references: refs,
    // Granular citation transparency. When truncated=true, the LLM
    // is taught to disclose the ratio so the user knows the
    // aggregation may be over a SAMPLE of matching docs.
    references_summary: {
      cited: refs.length,
      datasets_cited: seenDatasets.size,
      groups_cited: groupBy ? groups.length : 0,
      scanned_docs: scanned.length,
      total_available: totalItems,
      truncated,
      cap: REFERENCE_CAP,
    },
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function extractNumeric(doc: BackendDocument, path: string): number | null {
  const raw = lookupPath(doc, path);
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractString(doc: BackendDocument, path: string): string | null {
  const raw = lookupPath(doc, path);
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return null;
}

function lookupPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function summaryStats(values: number[]): Omit<GroupStats, 'group'> {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const median =
    n % 2 === 1
      ? sorted[(n - 1) / 2]!
      : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  let varSum = 0;
  for (const v of values) varSum += (v - mean) * (v - mean);
  const std = n >= 2 ? Math.sqrt(varSum / (n - 1)) : 0;
  return {
    count: n,
    mean,
    median,
    std,
    min: sorted[0]!,
    max: sorted[n - 1]!,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

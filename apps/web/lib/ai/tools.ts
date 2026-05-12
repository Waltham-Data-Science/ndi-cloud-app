/**
 * Tool handlers for the experimental /ask chat.
 *
 * Each handler:
 *   - Validates input via zod
 *   - Constructs the FastAPI URL from `INTERNAL_API_URL`
 *   - Times out after TOOL_TIMEOUT_MS
 *   - Returns the parsed JSON body OR `{ error: string }` on failure
 *
 * Returning `{ error }` rather than throwing keeps the AI SDK happy —
 * tool execution errors get fed back to Claude as content, and the
 * system prompt instructs the model to handle these gracefully in
 * natural language. The user sees a polite "I couldn't fetch X" rather
 * than a 500.
 *
 * Anonymous-public endpoints only — no cookies, no CSRF, no auth.
 */
import { tool } from 'ai';
import { z } from 'zod';

import {
  getIndexInfo,
  isIndexEmpty,
  topKByVector,
  type ScoredEntry,
} from './index-loader';
import { embedQuery } from './voyage-client';

const TOOL_TIMEOUT_MS = 8_000;

type ToolError = { error: string };
type ToolResult<T> = T | ToolError;

function baseUrl(): string | null {
  const u = process.env.INTERNAL_API_URL;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

async function fetchJson<T>(url: string): Promise<ToolResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      // Anonymous-only — no cookies forwarded.
      cache: 'no-store',
    });
    if (!res.ok) {
      return { error: `Upstream returned ${res.status}` };
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { error: 'Network timeout (8s exceeded)' };
    }
    return { error: 'Network error contacting catalog service' };
  } finally {
    clearTimeout(timer);
  }
}

// ─── list_published_datasets ────────────────────────────────────────

export const listPublishedDatasetsInput = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  query: z.string().min(1).optional(),
});

export async function listPublishedDatasetsHandler(
  input: z.infer<typeof listPublishedDatasetsInput>,
): Promise<ToolResult<{ totalNumber: number; datasets: unknown[] }>> {
  const parsed = listPublishedDatasetsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  const page = parsed.data.page ?? 1;
  const pageSize = Math.min(parsed.data.pageSize ?? 20, 100);
  let url = `${base}/api/datasets/published?page=${page}&pageSize=${pageSize}`;
  if (parsed.data.query) {
    url += `&q=${encodeURIComponent(parsed.data.query)}`;
  }
  return fetchJson(url);
}

// ─── get_dataset ────────────────────────────────────────────────────

export const getDatasetInput = z.object({
  id: z.string().min(1, 'id is required'),
});

export async function getDatasetHandler(
  input: z.infer<typeof getDatasetInput>,
): Promise<ToolResult<unknown>> {
  const parsed = getDatasetInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  return fetchJson(`${base}/api/datasets/${encodeURIComponent(parsed.data.id)}`);
}

// ─── get_dataset_summary ────────────────────────────────────────────

export const getDatasetSummaryInput = getDatasetInput;

export async function getDatasetSummaryHandler(
  input: z.infer<typeof getDatasetSummaryInput>,
): Promise<ToolResult<unknown>> {
  const parsed = getDatasetSummaryInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  return fetchJson(
    `${base}/api/datasets/${encodeURIComponent(parsed.data.id)}/summary`,
  );
}

// ─── get_dataset_class_counts ───────────────────────────────────────

export const getDatasetClassCountsInput = getDatasetInput;

export async function getDatasetClassCountsHandler(
  input: z.infer<typeof getDatasetClassCountsInput>,
): Promise<ToolResult<unknown>> {
  const parsed = getDatasetClassCountsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };

  return fetchJson(
    `${base}/api/datasets/${encodeURIComponent(parsed.data.id)}/class-counts`,
  );
}

// ─── get_facets ─────────────────────────────────────────────────────

export const getFacetsInput = z.object({});

export async function getFacetsHandler(
  _input: z.infer<typeof getFacetsInput>,
): Promise<ToolResult<unknown>> {
  const base = baseUrl();
  if (!base) return { error: 'Catalog service not configured' };
  return fetchJson(`${base}/api/facets`);
}

// ─── semantic_search_datasets ───────────────────────────────────────
//
// RAG layer. Embeds the query via Voyage AI (voyage-4-large, 1024-d),
// cosine-ranks against the pre-baked index of dataset chunks +
// curated metadata, returns top-K. Each chunk is the same string the
// build-time script embedded: catalog fields (name, description,
// species, brain regions, contributors, etc.) + sidecar additions
// (highlights, keywords, methods, PI context).
//
// Use this when the user's question is fuzzy / topical / synonymous
// — when literal substring search via `list_published_datasets`
// would miss relevant datasets. Examples: "datasets about memory"
// (matches hippocampus work), "primate-like vision" (matches tree
// shrew), "extracellular methods" (matches descriptions where the
// method is mentioned but not in any structured field).

export const semanticSearchDatasetsInput = z.object({
  query: z.string().min(1, 'query is required'),
  limit: z.number().int().positive().max(10).optional(),
});

export interface SemanticSearchResultEntry {
  id: string;
  name: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

export async function semanticSearchDatasetsHandler(
  input: z.infer<typeof semanticSearchDatasetsInput>,
): Promise<ToolResult<{ results: SemanticSearchResultEntry[]; indexInfo: ReturnType<typeof getIndexInfo> }>> {
  const parsed = semanticSearchDatasetsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (isIndexEmpty()) {
    return {
      error:
        'Semantic search index is empty. Run `pnpm build-ask-index` to populate.',
    };
  }
  if (!process.env.VOYAGE_API_KEY) {
    return {
      error:
        'Semantic search not available — VOYAGE_API_KEY not configured on this environment.',
    };
  }

  const limit = parsed.data.limit ?? 5;

  let queryVec: Float32Array;
  try {
    queryVec = await embedQuery(parsed.data.query);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return { error: `Embedding failed: ${message}` };
  }

  const indexInfo = getIndexInfo();
  if (queryVec.length !== indexInfo.dim) {
    // This would only happen if the build-script model and the
    // runtime model drifted apart. Caught by the dim mismatch in
    // cosineSimilarity, but we return a typed error here so Claude
    // can communicate the situation without a stack trace.
    return {
      error: `Embedding dimension mismatch (query ${queryVec.length} vs index ${indexInfo.dim}). Rebuild the index.`,
    };
  }

  let scored: ScoredEntry[];
  try {
    scored = topKByVector(queryVec, limit);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown';
    return { error: `Search failed: ${message}` };
  }

  return {
    results: scored.map((s) => ({
      id: s.id,
      name: s.name,
      text: s.text,
      score: s.score,
      metadata: s.metadata,
    })),
    indexInfo,
  };
}

// ─── Tool definitions for the AI SDK ────────────────────────────────

export const tools = {
  list_published_datasets: tool({
    description:
      'List published datasets in the NDI Commons catalog. Use this to ' +
      'answer "how many datasets" (set pageSize=1, read totalNumber) or ' +
      '"what datasets cover X" (set query).',
    inputSchema: listPublishedDatasetsInput,
    execute: listPublishedDatasetsHandler,
  }),
  get_dataset: tool({
    description:
      'Fetch the full record for a single dataset by ID. Includes ' +
      'contributors, DOI, license, and other metadata.',
    inputSchema: getDatasetInput,
    execute: getDatasetHandler,
  }),
  get_dataset_summary: tool({
    description:
      'Fetch a compact summary of a dataset (counts + key metadata). ' +
      'Prefer this over get_dataset when full record is overkill.',
    inputSchema: getDatasetSummaryInput,
    execute: getDatasetSummaryHandler,
  }),
  get_dataset_class_counts: tool({
    description:
      'Fetch per-class document counts for a dataset (e.g., how many ' +
      'epochs, probes, subjects).',
    inputSchema: getDatasetClassCountsInput,
    execute: getDatasetClassCountsHandler,
  }),
  get_facets: tool({
    description:
      'Fetch top-level facet aggregations across the catalog: species, ' +
      'brain regions, strains, etc. Use for "what species/regions are ' +
      'represented?".',
    inputSchema: getFacetsInput,
    execute: getFacetsHandler,
  }),
  semantic_search_datasets: tool({
    description:
      'Semantic / topical search over the dataset catalog. Use when ' +
      'the user asks about a CONCEPT or TOPIC that may not appear as ' +
      'a literal substring in the catalog (e.g. "memory", "primate-like ' +
      'vision", "extracellular methods", "datasets like Bhar"). Each ' +
      'result includes the dataset name, full ID, and a chunk of text ' +
      'that combines the catalog metadata with curated highlights and ' +
      'methods notes. Returns top-K (default 5, max 10) ranked by ' +
      'cosine similarity. Prefer this over list_published_datasets ' +
      'whenever the query is fuzzy or synonym-heavy.',
    inputSchema: semanticSearchDatasetsInput,
    execute: semanticSearchDatasetsHandler,
  }),
} as const;

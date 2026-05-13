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

import { hybridSearch, type RetrievedChunk } from './hybrid-retrieval';
import { embedQuery, rerank } from './voyage-client';

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
// Full RAG pipeline matching vh-lab + shrek-lab:
//
//   1. Embed the query via Voyage voyage-4-large (1024d, input_type=query)
//   2. Hybrid retrieval — top-20 vector (`<=>`) + top-20 BM25
//      (tsvector / plainto_tsquery) — in parallel
//   3. Reciprocal Rank Fusion (k=60) to merge the two lanes
//   4. Cross-encoder rerank via Voyage rerank-2.5 — feeds ~20-30
//      candidates, returns top-K with relevance scores
//
// Returns top-K (default 5, max 10) reranked chunks with their full
// content + curated metadata.
//
// Use this when the user's question is fuzzy / topical / synonymous
// — when literal substring search would miss relevant datasets.
// Examples: "datasets about memory" (hits hippocampus work),
// "primate-like vision" (hits tree shrew via curated keywords),
// "extracellular methods" (hits descriptions where the method is
// mentioned but not in any structured field).

export const semanticSearchDatasetsInput = z.object({
  query: z.string().min(1, 'query is required'),
  limit: z.number().int().positive().max(10).optional(),
});

export interface SemanticSearchResultEntry {
  id: string;
  name: string | null;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

const CANDIDATES_PER_LANE = 20;

export async function semanticSearchDatasetsHandler(
  input: z.infer<typeof semanticSearchDatasetsInput>,
): Promise<ToolResult<{ results: SemanticSearchResultEntry[]; pipeline: PipelineInfo }>> {
  const parsed = semanticSearchDatasetsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!process.env.DATABASE_URL) {
    return {
      error:
        'Semantic search not available — DATABASE_URL not configured. The /ask RAG index lives in Postgres + pgvector.',
    };
  }
  if (!process.env.VOYAGE_API_KEY) {
    return {
      error:
        'Semantic search not available — VOYAGE_API_KEY not configured on this environment.',
    };
  }

  const limit = parsed.data.limit ?? 5;
  const pipeline: PipelineInfo = { stage: 'init' };

  // 1. Embed the query.
  let queryVec: Float32Array;
  try {
    pipeline.stage = 'embed';
    queryVec = await embedQuery(parsed.data.query);
  } catch (e) {
    return { error: `Embedding failed: ${errMsg(e)}` };
  }

  // 2 + 3. Hybrid retrieval + RRF.
  let candidates: RetrievedChunk[];
  try {
    pipeline.stage = 'hybridSearch';
    candidates = await hybridSearch(
      parsed.data.query,
      Array.from(queryVec),
      CANDIDATES_PER_LANE,
    );
  } catch (e) {
    return { error: `Retrieval failed: ${errMsg(e)}` };
  }
  pipeline.candidatesAfterRrf = candidates.length;

  if (candidates.length === 0) {
    return { results: [], pipeline };
  }

  // 4. Rerank.
  try {
    pipeline.stage = 'rerank';
    const rerankInputs = candidates.map((c) => c.content);
    const reranked = await rerank(parsed.data.query, rerankInputs, limit);
    const finalResults: SemanticSearchResultEntry[] = reranked.map((r) => {
      const chunk = candidates[r.index]!;
      return {
        id: chunk.doc_id,
        name: chunk.doc_title,
        text: chunk.content,
        score: r.relevanceScore,
        metadata: chunk.metadata,
      };
    });
    return { results: finalResults, pipeline };
  } catch (e) {
    // Soft-degrade: if reranking fails, return the top-K from RRF
    // alone. The user gets an answer based on hybrid retrieval, just
    // not as well-tuned. This matches vh-lab's behavior — they catch
    // rerank failures and fall through to RRF scores.
    const fallback: SemanticSearchResultEntry[] = candidates
      .slice(0, limit)
      .map((c) => ({
        id: c.doc_id,
        name: c.doc_title,
        text: c.content,
        score: c.score,
        metadata: { ...c.metadata, rerankFailed: errMsg(e) },
      }));
    pipeline.rerankFallback = true;
    return { results: fallback, pipeline };
  }
}

interface PipelineInfo {
  stage: 'init' | 'embed' | 'hybridSearch' | 'rerank';
  candidatesAfterRrf?: number;
  rerankFallback?: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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

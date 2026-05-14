/**
 * Voyage AI runtime client for the experimental /ask chat.
 *
 * Two operations exposed:
 *
 *   - `embedQuery(text)` — single-query embedding via the
 *     /v1/embeddings endpoint. Used to project the user's question
 *     into the same 1024-d space as the indexed chunks.
 *
 *   - `rerank(query, documents, topK)` — cross-encoder reranking
 *     via the /v1/rerank endpoint. Takes the hybrid-search candidate
 *     pool (typically ~20-30 chunks after RRF) and re-scores with a
 *     cross-encoder that's smarter than the bi-encoder embedding
 *     match but slower per-call. Returns top-K with relevance scores.
 *
 * Both call the REST API directly (no SDK at runtime). The build-time
 * script uses the `voyageai` Node SDK; at request time we go raw
 * `fetch` so the bundle stays clean and the runtime stays portable.
 *
 * Models match vh-lab + shrek-lab exactly:
 *   - voyage-4-large for embeddings (1024 dims, L2-normalized)
 *   - rerank-2.5 for cross-encoder reranking
 *
 * 8s timeout matches the other tool handlers in lib/ai/tools.ts.
 */
import { env } from '@/lib/env';

const VOYAGE_EMBED_API = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_RERANK_API = 'https://api.voyageai.com/v1/rerank';
const VOYAGE_EMBED_MODEL = 'voyage-4-large';
const VOYAGE_RERANK_MODEL = 'rerank-2.5';
const TIMEOUT_MS = 8_000;

interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

interface VoyageRerankResponse {
  data: Array<{
    index: number;
    relevance_score: number;
    document?: string;
  }>;
}

export interface RerankResult {
  /** Original index into the `documents` array passed in. */
  index: number;
  relevanceScore: number;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const apiKey = requireApiKey();
  const body = await voyageFetch<VoyageEmbeddingResponse>(VOYAGE_EMBED_API, apiKey, {
    input: [text],
    model: VOYAGE_EMBED_MODEL,
    input_type: 'query',
  });
  const first = body.data?.[0]?.embedding;
  if (!Array.isArray(first)) {
    throw new Error('Voyage response missing embedding');
  }
  return Float32Array.from(first);
}

/**
 * Cross-encoder rerank. Returns relevance scores indexed back into the
 * original `documents` array so the caller can apply them to chunk
 * records.
 */
export async function rerank(
  query: string,
  documents: string[],
  topK: number,
): Promise<RerankResult[]> {
  const apiKey = requireApiKey();
  if (documents.length === 0) return [];
  const body = await voyageFetch<VoyageRerankResponse>(VOYAGE_RERANK_API, apiKey, {
    query,
    documents,
    model: VOYAGE_RERANK_MODEL,
    top_k: Math.min(topK, documents.length),
  });
  return (body.data ?? []).map((r) => ({
    index: r.index,
    relevanceScore: r.relevance_score,
  }));
}

function requireApiKey(): string {
  const k = env.VOYAGE_API_KEY;
  if (!k) {
    throw new Error('VOYAGE_API_KEY not configured');
  }
  return k;
}

/**
 * Shared fetch wrapper — auth header, JSON serialize, timeout,
 * uniform error messages so callers can rely on `/Voyage/` regex
 * matches in catch blocks.
 */
async function voyageFetch<T>(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Voyage returned ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Voyage timeout (8s)');
    }
    if (e instanceof Error && /^Voyage/.test(e.message)) throw e;
    throw new Error(`Voyage network error: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

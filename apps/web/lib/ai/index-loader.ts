/**
 * RAG index loader for the experimental /ask chat.
 *
 * Loads the pre-baked dataset-index.json (built by
 * `scripts/build-ask-index.mjs`), converts the embeddings to
 * Float32Array on first access, and exposes:
 *
 *   - cosineSimilarity(a, b): dot product (Voyage embeddings are
 *     L2-normalized by default, so dot product = cosine similarity)
 *   - topKByVector(queryVec, k): returns the top-K entries by score,
 *     each with the score attached
 *   - isIndexEmpty(): true if the index hasn't been populated yet,
 *     so callers can short-circuit with a graceful "not indexed" error
 *   - getIndexInfo(): non-PII metadata (model, dim, count) for logs +
 *     debug headers
 *
 * Why no DB / pgvector: at 500 datasets × 1024d × 4 bytes ≈ 2 MB raw,
 * the whole index sits comfortably in a Node serverless function's
 * memory. Cosine over 500 entries is sub-millisecond. The vh-lab /
 * shrek-lab chatbots use pgvector because they index thousands of
 * grant-document chunks; we don't need that scale.
 */
import indexData from './dataset-index.json';

export interface IndexEntry {
  id: string;
  name: string;
  text: string;
  metadata: Record<string, unknown>;
}

interface RawEntry extends IndexEntry {
  embedding: number[];
}

interface RawIndex {
  schemaVersion: number;
  model: string | null;
  dim: number;
  createdAt: string | null;
  entries: RawEntry[];
}

const RAW = indexData as unknown as RawIndex;

// Lazily build Float32Array embeddings on first use. JSON.parse gives
// us regular arrays; cosineSimilarity is ~3× faster with typed arrays.
let _vectors: Float32Array[] | null = null;
let _records: IndexEntry[] | null = null;

function ensureLoaded(): { vectors: Float32Array[]; records: IndexEntry[] } {
  if (_vectors && _records) return { vectors: _vectors, records: _records };
  _vectors = RAW.entries.map((e) => Float32Array.from(e.embedding));
  _records = RAW.entries.map(({ embedding: _ignored, ...rest }) => rest);
  return { vectors: _vectors, records: _records };
}

/**
 * Cosine similarity for L2-normalized vectors — collapses to dot
 * product. Both inputs must have the same dimension or this throws.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`,
    );
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

export interface ScoredEntry extends IndexEntry {
  score: number;
}

/**
 * Return the top-K entries by descending cosine similarity to the
 * query vector. Empty index → empty result.
 */
export function topKByVector(queryVec: Float32Array, k: number): ScoredEntry[] {
  const { vectors, records } = ensureLoaded();
  if (vectors.length === 0) return [];

  const scored: ScoredEntry[] = vectors.map((vec, i) => ({
    ...records[i]!,
    score: cosineSimilarity(queryVec, vec),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function isIndexEmpty(): boolean {
  return RAW.entries.length === 0;
}

export function getIndexInfo(): {
  model: string | null;
  dim: number;
  count: number;
  createdAt: string | null;
} {
  return {
    model: RAW.model,
    dim: RAW.dim,
    count: RAW.entries.length,
    createdAt: RAW.createdAt,
  };
}

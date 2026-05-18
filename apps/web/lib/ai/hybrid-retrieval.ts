/**
 * Hybrid retrieval for the experimental /ask chat — vector + BM25
 * combined via Reciprocal Rank Fusion (RRF), then handed off to the
 * Voyage reranker.
 *
 * Mirrors vh-lab + shrek-lab `api/services/retrieval.py`:
 *   - Vector lane: `1 - (embedding <=> $vec)` (cosine similarity)
 *   - BM25  lane: `ts_rank(search_vector, plainto_tsquery('english', $q))`
 *   - Combined with RRF at k=60 (the canonical value from the
 *     Reciprocal Rank Fusion paper — neither repo deviates from it)
 *   - IVFFlat probes bumped from default 1 → 10 at query time for
 *     better recall (same `SET ivfflat.probes = 10` both repos use)
 *
 * The candidate pool size (`topPerLane`) defaults to 20 per lane,
 * RRF'd to ~30 unique candidates, which the reranker chews on. The
 * final top-K returned to the LLM is typically 5.
 */
import { getPool } from './db/pool';

export interface RetrievedChunk {
  id: number;
  doc_id: string;
  doc_title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  /** Score from the combining stage (RRF), then overwritten by rerank. */
  score: number;
}

interface LaneRow {
  id: number;
  doc_id: string;
  doc_title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

/**
 * Vector search lane. Returns top-K rows by cosine similarity.
 *
 * pgvector's `<=>` is cosine DISTANCE, so we convert to similarity
 * with `1 - distance` for a consistent "higher = better" semantic
 * across both lanes.
 */
async function vectorSearch(
  queryVec: number[],
  topK: number,
): Promise<LaneRow[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    // Bump IVFFlat probes — default 1 gives poor recall on a 100-list
    // index. 10 is what vh-lab + shrek-lab both use; tested to give
    // ~95% of brute-force recall at this scale.
    await client.query('SET LOCAL ivfflat.probes = 10');
    const res = await client.query(
      `
      SELECT
        id, doc_id, doc_title, content, metadata,
        1 - (embedding <=> $1::vector) AS score
      FROM chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2
      `,
      [vectorLiteral(queryVec), topK],
    );
    return res.rows as LaneRow[];
  } finally {
    client.release();
  }
}

/**
 * BM25 / fulltext lane via Postgres `tsvector` + `ts_rank`. Returns
 * top-K rows by lexical relevance.
 *
 * `plainto_tsquery` is lenient — it doesn't require special operators,
 * just space-separated words. Matches vh-lab + shrek-lab.
 */
async function bm25Search(query: string, topK: number): Promise<LaneRow[]> {
  const pool = getPool();
  const res = await pool.query(
    `
    SELECT
      id, doc_id, doc_title, content, metadata,
      ts_rank(search_vector, plainto_tsquery('english', $1)) AS score
    FROM chunks
    WHERE search_vector @@ plainto_tsquery('english', $1)
    ORDER BY score DESC
    LIMIT $2
    `,
    [query, topK],
  );
  return res.rows as LaneRow[];
}

/**
 * Reciprocal Rank Fusion. Each input list is treated as a ranking;
 * each item's contribution is `1 / (k + rank)` where k=60 is the
 * paper's canonical constant. Sum across lists, sort descending.
 *
 * Returns a deduplicated list ordered by RRF score.
 *
 * Reference: Cormack, Clarke, Buettcher (2009), "Reciprocal rank fusion
 * outperforms condorcet and individual rank learning methods" — and
 * lines 525-557 of `vh-lab-chatbot/api/services/retrieval.py`.
 */
const RRF_K = 60;

function reciprocalRankFusion(lanes: LaneRow[][]): RetrievedChunk[] {
  const byKey = new Map<number, { row: LaneRow; rrfScore: number }>();
  for (const lane of lanes) {
    lane.forEach((row, rank) => {
      const score = 1 / (RRF_K + rank + 1);
      const existing = byKey.get(row.id);
      if (existing) {
        existing.rrfScore += score;
      } else {
        byKey.set(row.id, { row, rrfScore: score });
      }
    });
  }
  const merged: RetrievedChunk[] = [...byKey.values()].map(({ row, rrfScore }) => ({
    id: row.id,
    doc_id: row.doc_id,
    doc_title: row.doc_title,
    content: row.content,
    metadata: row.metadata,
    score: rrfScore,
  }));
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

/**
 * Public entrypoint. Runs both lanes in parallel and merges with RRF.
 *
 * Returns the RRF-ordered candidate pool (deduped) — the caller is
 * expected to rerank this set and slice to the final top-K.
 */
export async function hybridSearch(
  query: string,
  queryVec: number[],
  topPerLane = 20,
): Promise<RetrievedChunk[]> {
  const [vec, bm25] = await Promise.all([
    vectorSearch(queryVec, topPerLane),
    bm25Search(query, topPerLane),
  ]);
  return reciprocalRankFusion([vec, bm25]);
}

/**
 * Format a JS number array as a pgvector literal: '[0.123, 0.456, ...]'.
 * pgvector accepts this string form via `::vector` cast.
 */
function vectorLiteral(vec: number[]): string {
  return '[' + vec.join(',') + ']';
}

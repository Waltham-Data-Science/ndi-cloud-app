/**
 * hybrid-retrieval.ts — verifies the RRF math against the canonical
 * Cormack/Clarke formula at k=60. We don't exercise the SQL itself
 * here (that's an integration concern); we mock the pg pool and
 * focus on the merge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeQuery = vi.fn();
const fakeRelease = vi.fn();
const fakeConnect = vi.fn(async () => ({ query: fakeQuery, release: fakeRelease }));

vi.mock('@/lib/ai/db/pool', () => ({
  getPool: vi.fn(() => ({
    connect: fakeConnect,
    query: fakeQuery,
  })),
}));

import { hybridSearch } from '@/lib/ai/hybrid-retrieval';

function row(id: number, doc_id: string, score: number) {
  return {
    id,
    doc_id,
    doc_title: `Title ${id}`,
    content: `Content ${id}`,
    metadata: { i: id },
    score,
  };
}

/**
 * Helper: route fakeQuery responses by SQL content so the test is
 * insensitive to the parallel-Promise.all interleaving of the vector
 * and BM25 lanes.
 */
function routeQueriesBy(handlers: {
  vector: ReturnType<typeof row>[];
  bm25: ReturnType<typeof row>[];
}) {
  fakeQuery.mockImplementation((sql: string) => {
    if (typeof sql !== 'string') return Promise.resolve({ rows: [] });
    if (sql.includes('SET LOCAL ivfflat')) return Promise.resolve({ rows: [] });
    if (sql.includes('embedding <=>')) return Promise.resolve({ rows: handlers.vector });
    if (sql.includes('plainto_tsquery')) return Promise.resolve({ rows: handlers.bm25 });
    return Promise.resolve({ rows: [] });
  });
}

describe('hybridSearch — RRF merge', () => {
  beforeEach(() => {
    fakeQuery.mockReset();
    fakeConnect.mockClear();
    fakeRelease.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues a vector + a BM25 query and merges results by RRF k=60', async () => {
    routeQueriesBy({
      vector: [row(1, 'd1', 0.9), row(2, 'd2', 0.7), row(3, 'd3', 0.6)],
      bm25: [row(2, 'd2', 0.4), row(4, 'd4', 0.3)],
    });

    const result = await hybridSearch('memory tasks', [0.1, 0.2, 0.3], 3);

    // RRF at k=60:
    //   d1: 1/(60+1)            = 0.01639  (vector rank 0)
    //   d2: 1/(60+2) + 1/(60+1) = 0.03253  (vector r1, bm25 r0)
    //   d3: 1/(60+3)            = 0.01587  (vector rank 2)
    //   d4: 1/(60+2)            = 0.01613  (bm25 rank 1)
    // Ranking: d2 > d1 > d4 > d3
    expect(result.map((r) => r.doc_id)).toEqual(['d2', 'd1', 'd4', 'd3']);
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it('bumps ivfflat.probes to 10 at query time', async () => {
    routeQueriesBy({ vector: [], bm25: [] });
    await hybridSearch('q', [0.1], 5);
    const sets = fakeQuery.mock.calls.filter((c) =>
      typeof c[0] === 'string' && c[0].includes('SET LOCAL ivfflat.probes = 10'),
    );
    expect(sets).toHaveLength(1);
  });

  it('passes the queryVec as a pgvector literal to the vector SQL', async () => {
    routeQueriesBy({ vector: [], bm25: [] });
    await hybridSearch('q', [0.1, 0.2, 0.3], 5);

    const vectorCalls = fakeQuery.mock.calls.filter((c) =>
      typeof c[0] === 'string' && c[0].includes('embedding <=>'),
    );
    expect(vectorCalls).toHaveLength(1);
    expect(vectorCalls[0]![1][0]).toBe('[0.1,0.2,0.3]');
  });

  it('passes the raw query string to the BM25 SQL', async () => {
    routeQueriesBy({ vector: [], bm25: [] });
    await hybridSearch('hippocampus AND memory', [0.1], 5);

    const bm25Calls = fakeQuery.mock.calls.filter((c) =>
      typeof c[0] === 'string' && c[0].includes('plainto_tsquery'),
    );
    expect(bm25Calls).toHaveLength(1);
    expect(bm25Calls[0]![1][0]).toBe('hippocampus AND memory');
  });

  it('returns empty array when both lanes are empty', async () => {
    routeQueriesBy({ vector: [], bm25: [] });
    const result = await hybridSearch('q', [0.1], 5);
    expect(result).toEqual([]);
  });
});

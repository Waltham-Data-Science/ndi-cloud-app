/**
 * semantic_search_datasets handler — orchestrates embedding,
 * hybrid retrieval, and reranking. Tests mock the three dependencies
 * and verify the orchestration: order of calls, graceful fallbacks,
 * and result shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/voyage-client', () => ({
  embedQuery: vi.fn(),
  rerank: vi.fn(),
}));

vi.mock('@/lib/ai/hybrid-retrieval', () => ({
  hybridSearch: vi.fn(),
}));

import { semanticSearchDatasetsHandler } from '@/lib/ai/chat-tools';
import { embedQuery, rerank } from '@/lib/ai/voyage-client';
import { hybridSearch } from '@/lib/ai/hybrid-retrieval';

const mockedEmbed = vi.mocked(embedQuery);
const mockedRerank = vi.mocked(rerank);
const mockedHybridSearch = vi.mocked(hybridSearch);

function fakeChunk(id: string, content: string, score = 0.5) {
  return {
    id: parseInt(id.replace(/\D/g, ''), 10) || 1,
    doc_id: id,
    doc_title: `Title for ${id}`,
    content,
    metadata: { species: ['mouse'] },
    score,
  };
}

describe('semanticSearchDatasetsHandler', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VOYAGE_API_KEY', 'pa-test-1234567890'); // gitleaks:allow — test stub, not a real key
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/test');
    mockedEmbed.mockReset();
    mockedRerank.mockReset();
    mockedHybridSearch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs embed → hybridSearch → rerank in order on the happy path', async () => {
    mockedEmbed.mockResolvedValueOnce(Float32Array.from([0.1, 0.2, 0.3]));
    mockedHybridSearch.mockResolvedValueOnce([
      fakeChunk('d1', 'about mice'),
      fakeChunk('d2', 'about rats'),
      fakeChunk('d3', 'about birds'),
    ]);
    mockedRerank.mockResolvedValueOnce([
      { index: 0, relevanceScore: 0.95 },
      { index: 2, relevanceScore: 0.71 },
    ]);

    const result = await semanticSearchDatasetsHandler({
      query: 'rodent behavior',
    });

    if ('error' in result) throw new Error(`expected success, got ${result.error}`);
    expect(mockedEmbed).toHaveBeenCalledWith('rodent behavior');
    expect(mockedHybridSearch).toHaveBeenCalledWith(
      'rodent behavior',
      expect.any(Array),
      20,
    );
    expect(mockedRerank).toHaveBeenCalledWith(
      'rodent behavior',
      ['about mice', 'about rats', 'about birds'],
      5,
    );
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      id: 'd1',
      name: 'Title for d1',
      text: 'about mice',
      score: 0.95,
    });
    expect(result.results[1]).toMatchObject({
      id: 'd3',
      text: 'about birds',
      score: 0.71,
    });
    expect(result.pipeline.stage).toBe('rerank');
    // Day 1: each reranked hit attaches a Reference pointing to the
    // dataset's overview page. The doc_id matches the dataset id.
    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({
      doc_id: 'd1',
      url: '/datasets/d1/overview',
      class: 'dataset',
    });
  });

  it('returns { error } when DATABASE_URL is unset', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VOYAGE_API_KEY', 'pa-test-1234567890'); // gitleaks:allow — test stub, not a real key
    const result = await semanticSearchDatasetsHandler({ query: 'anything' });
    expect(result).toEqual({ error: expect.stringMatching(/DATABASE_URL/) });
  });

  it('returns { error } when VOYAGE_API_KEY is unset', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/test');
    const result = await semanticSearchDatasetsHandler({ query: 'anything' });
    expect(result).toEqual({ error: expect.stringMatching(/VOYAGE_API_KEY/) });
  });

  it('returns { error } when query is empty', async () => {
    const result = await semanticSearchDatasetsHandler({ query: '' });
    expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('returns { error } when embedding fails', async () => {
    mockedEmbed.mockRejectedValueOnce(new Error('Voyage returned 502'));
    const result = await semanticSearchDatasetsHandler({ query: 'x' });
    expect(result).toEqual({ error: expect.stringMatching(/embedding/i) });
  });

  it('returns { error } when hybrid retrieval throws', async () => {
    mockedEmbed.mockResolvedValueOnce(Float32Array.from([0.1, 0.2]));
    mockedHybridSearch.mockRejectedValueOnce(new Error('db connection refused'));
    const result = await semanticSearchDatasetsHandler({ query: 'x' });
    expect(result).toEqual({ error: expect.stringMatching(/retrieval/i) });
  });

  it('soft-degrades to RRF-only ranking when rerank fails', async () => {
    mockedEmbed.mockResolvedValueOnce(Float32Array.from([0.1, 0.2]));
    mockedHybridSearch.mockResolvedValueOnce([
      fakeChunk('d1', 'top from rrf', 0.9),
      fakeChunk('d2', 'second from rrf', 0.4),
    ]);
    mockedRerank.mockRejectedValueOnce(new Error('rerank 500'));

    const result = await semanticSearchDatasetsHandler({ query: 'x', limit: 2 });
    if ('error' in result) throw new Error('expected success despite rerank fail');
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.id).toBe('d1');
    expect(result.results[0]!.score).toBe(0.9); // RRF score, not rerank
    expect(result.results[0]!.metadata.rerankFailed).toMatch(/rerank/i);
    expect(result.pipeline.rerankFallback).toBe(true);
  });

  it('returns empty results (no error) when hybridSearch yields zero candidates', async () => {
    mockedEmbed.mockResolvedValueOnce(Float32Array.from([0.1, 0.2]));
    mockedHybridSearch.mockResolvedValueOnce([]);
    const result = await semanticSearchDatasetsHandler({ query: 'x' });
    if ('error' in result) throw new Error('expected success');
    expect(result.results).toEqual([]);
    expect(mockedRerank).not.toHaveBeenCalled();
  });

  it('honors the limit parameter', async () => {
    mockedEmbed.mockResolvedValueOnce(Float32Array.from([0.1, 0.2]));
    mockedHybridSearch.mockResolvedValueOnce([fakeChunk('d1', 'a')]);
    mockedRerank.mockResolvedValueOnce([{ index: 0, relevanceScore: 1 }]);
    await semanticSearchDatasetsHandler({ query: 'x', limit: 3 });
    expect(mockedRerank).toHaveBeenCalledWith('x', ['a'], 3);
  });
});

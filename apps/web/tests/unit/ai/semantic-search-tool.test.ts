/**
 * semantic_search_datasets handler — verifies graceful fallbacks
 * (empty index, missing API key, embedding failure, dim mismatch)
 * and the happy path with a mocked Voyage call.
 *
 * Uses the same 3-d fixture pattern as index-loader.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/dataset-index.json', () => ({
  default: {
    schemaVersion: 1,
    model: 'voyage-4-large',
    dim: 3,
    createdAt: '2026-05-12T00:00:00Z',
    entries: [
      {
        id: 'd-north',
        name: 'North',
        text: 'About the north',
        metadata: { species: ['mouse'] },
        embedding: [1, 0, 0],
      },
      {
        id: 'd-east',
        name: 'East',
        text: 'About the east',
        metadata: { species: ['rat'] },
        embedding: [0, 1, 0],
      },
    ],
  },
}));

import { semanticSearchDatasetsHandler } from '@/lib/ai/tools';

describe('semanticSearchDatasetsHandler', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VOYAGE_API_KEY', 'pa-test-1234567890');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns top-K results ranked by cosine when the happy path works', async () => {
    // Mock the Voyage REST call to return a query vector that aligns
    // perfectly with d-north (embedding [1,0,0]).
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await semanticSearchDatasetsHandler({
      query: 'something pointing north',
    });

    if ('error' in result) {
      throw new Error(`expected success, got error: ${result.error}`);
    }
    expect(result.results).toHaveLength(2);
    expect(result.results[0]!.id).toBe('d-north');
    expect(result.results[0]!.score).toBeCloseTo(1, 5);
    expect(result.results[1]!.id).toBe('d-east');
    expect(result.results[1]!.score).toBeCloseTo(0, 5);
  });

  it('honors the limit param', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await semanticSearchDatasetsHandler({
      query: 'something',
      limit: 1,
    });
    if ('error' in result) throw new Error('expected success');
    expect(result.results).toHaveLength(1);
  });

  it('returns { error } when VOYAGE_API_KEY is unset', async () => {
    vi.unstubAllEnvs();
    const result = await semanticSearchDatasetsHandler({ query: 'anything' });
    expect(result).toEqual({ error: expect.stringMatching(/VOYAGE_API_KEY/) });
  });

  it('returns { error } when the query is empty', async () => {
    const result = await semanticSearchDatasetsHandler({ query: '' });
    expect(result).toEqual({ error: expect.stringMatching(/invalid/i) });
  });

  it('returns { error } when Voyage fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('boom', { status: 502 }),
    );
    const result = await semanticSearchDatasetsHandler({ query: 'anything' });
    expect(result).toEqual({ error: expect.stringMatching(/embedding/i) });
  });

  it('returns { error } when dimensions mismatch the index', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      // Wrong dim: 5 floats vs index dim of 3 — would crash in dot product;
      // tool should catch and return typed error.
      new Response(
        JSON.stringify({ data: [{ embedding: [1, 0, 0, 0, 0] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await semanticSearchDatasetsHandler({ query: 'x' });
    expect(result).toEqual({ error: expect.stringMatching(/dimension/i) });
  });

  it('attaches index metadata to the response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ embedding: [1, 0, 0] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await semanticSearchDatasetsHandler({ query: 'anything' });
    if ('error' in result) throw new Error('expected success');
    expect(result.indexInfo).toMatchObject({
      model: 'voyage-4-large',
      dim: 3,
      count: 2,
    });
  });
});

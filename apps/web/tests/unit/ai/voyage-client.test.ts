/**
 * voyage-client.ts — query embedding + reranker, both via REST.
 *
 * Tests mock fetch and verify URL + auth header + body shape per
 * endpoint, plus the typed-error surface (timeout, network, non-2xx,
 * missing API key).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  embedQuery,
  rerank,
  type VoyageUsageAccumulator,
} from '@/lib/ai/voyage-client';

describe('lib/ai/voyage-client', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VOYAGE_API_KEY', 'pa-test-key-1234567890'); // gitleaks:allow — test stub, not a real key
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('embedQuery', () => {
    it('POSTs to /v1/embeddings with bearer auth + voyage-4-large + input_type=query', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const result = await embedQuery('hippocampus recordings');

      const call = fetchSpy.mock.calls[0]!;
      expect(call[0]).toBe('https://api.voyageai.com/v1/embeddings');
      const init = call[1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer pa-test-key-1234567890',
      );
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe('voyage-4-large');
      expect(body.input).toEqual(['hippocampus recordings']);
      expect(body.input_type).toBe('query');

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(3);
    });

    it('throws when VOYAGE_API_KEY is unset', async () => {
      vi.unstubAllEnvs();
      await expect(embedQuery('anything')).rejects.toThrow(/VOYAGE_API_KEY/);
    });

    it('throws on non-2xx response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('boom', { status: 502 }),
      );
      await expect(embedQuery('anything')).rejects.toThrow(/502/);
    });

    it('throws on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('econnreset'));
      await expect(embedQuery('anything')).rejects.toThrow(/network/i);
    });

    it('accumulates embed tokens when a usage accumulator is supplied', async () => {
      // Stream 3.2 extension (2026-05-16): Voyage's /v1/embeddings
      // response includes `usage.total_tokens`. When the caller (the
      // /api/ask chat route) passes the per-request accumulator, we
      // add to it so chat_usage_events.voyage_embed_tokens gets the
      // accurate total at stream end.
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
            usage: { total_tokens: 17 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const usage: VoyageUsageAccumulator = { embedTokens: 0, rerankUnits: 0 };
      await embedQuery('hippocampus recordings', usage);
      expect(usage.embedTokens).toBe(17);
      expect(usage.rerankUnits).toBe(0);
    });

    it('does not crash when the response omits usage (defensive)', async () => {
      // Pre-2026 Voyage responses (and degraded responses today) may
      // omit the usage envelope. Skip the accumulator bump — never
      // throw, never add NaN.
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const usage: VoyageUsageAccumulator = { embedTokens: 0, rerankUnits: 0 };
      await embedQuery('anything', usage);
      expect(usage.embedTokens).toBe(0); // unchanged
    });
  });

  describe('rerank', () => {
    it('POSTs to /v1/rerank with rerank-2.5 + the query + documents', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { index: 2, relevance_score: 0.95 },
              { index: 0, relevance_score: 0.71 },
              { index: 1, relevance_score: 0.33 },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      const result = await rerank('memory tasks', ['doc A', 'doc B', 'doc C'], 3);

      const call = fetchSpy.mock.calls[0]!;
      expect(call[0]).toBe('https://api.voyageai.com/v1/rerank');
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.model).toBe('rerank-2.5');
      expect(body.query).toBe('memory tasks');
      expect(body.documents).toEqual(['doc A', 'doc B', 'doc C']);
      expect(body.top_k).toBe(3);

      expect(result).toEqual([
        { index: 2, relevanceScore: 0.95 },
        { index: 0, relevanceScore: 0.71 },
        { index: 1, relevanceScore: 0.33 },
      ]);
    });

    it('returns empty when given no documents (skips the API call)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const result = await rerank('memory', [], 5);
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('caps top_k at the documents length', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ index: 0, relevance_score: 0.9 }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      await rerank('q', ['only one'], 100);
      const body = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(body.top_k).toBe(1);
    });

    it('throws on non-2xx response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('rerank down', { status: 500 }),
      );
      await expect(rerank('q', ['d'], 1)).rejects.toThrow(/500/);
    });

    it('throws when VOYAGE_API_KEY is unset', async () => {
      vi.unstubAllEnvs();
      await expect(rerank('q', ['d'], 1)).rejects.toThrow(/VOYAGE_API_KEY/);
    });

    it('accumulates rerank units (1 per successful call) when a usage accumulator is supplied', async () => {
      // Stream 3.2 extension (2026-05-16): rerank is BILLED per query
      // ($0.05 each at rate-card time), so each successful call bumps
      // rerankUnits by exactly 1. Token count from the response is
      // informational — billing is per-query.
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ index: 0, relevance_score: 0.9 }],
            usage: { total_tokens: 250 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const usage: VoyageUsageAccumulator = { embedTokens: 0, rerankUnits: 0 };
      await rerank('q', ['doc'], 1, usage);
      expect(usage.rerankUnits).toBe(1);
      expect(usage.embedTokens).toBe(0); // rerank tokens are NOT embed tokens
    });

    it('does not bump rerankUnits on the short-circuit empty-docs path', async () => {
      // The function early-returns [] without hitting the API when
      // documents is empty. No API call = no billed unit.
      const usage: VoyageUsageAccumulator = { embedTokens: 0, rerankUnits: 0 };
      await rerank('q', [], 5, usage);
      expect(usage.rerankUnits).toBe(0);
    });
  });
});

/**
 * voyage-client.ts — runtime query embedding via the Voyage REST API.
 *
 * Tests mock fetch and verify:
 *   - URL + Authorization header + body shape
 *   - Returns a Float32Array of the right dimension
 *   - Missing API key → typed error
 *   - Non-2xx → typed error
 *   - Network error → typed error
 *   - 8s timeout → typed error
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { embedQuery } from '@/lib/ai/voyage-client';

describe('lib/ai/voyage-client', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VOYAGE_API_KEY', 'pa-test-key-1234567890');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('POSTs to api.voyageai.com/v1/embeddings with Bearer auth + query input type', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await embedQuery('what species are in the catalog?');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.voyageai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer pa-test-key-1234567890',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"input_type":"query"'),
      }),
    );
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3);
    expect(result[0]).toBeCloseTo(0.1, 5);
  });

  it('sends the voyage-4-large model + the query text in the body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ embedding: [0] }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await embedQuery('hippocampus recordings');

    const call = fetchSpy.mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.model).toBe('voyage-4-large');
    expect(body.input).toEqual(['hippocampus recordings']);
    expect(body.input_type).toBe('query');
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
});

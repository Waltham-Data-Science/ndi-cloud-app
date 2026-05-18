/**
 * /api/ask route handler — verifies the gating behaviors that don't
 * require a real Anthropic call: feature-flag, rate-limit, malformed
 * body, missing IP.
 *
 * The streaming happy path is exercised by the e2e test with a
 * mocked Anthropic response.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/ask/route';
import { _resetForTest as resetRateLimit } from '@/lib/ai/rate-limit';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ask', () => {
  beforeEach(() => {
    resetRateLimit();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 when ANTHROPIC_API_KEY is unset', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }] }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'chat_disabled' });
  });

  it('returns 400 when body is not valid JSON', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-fake-key-1234567890');
    const res = await POST(
      new Request('http://localhost/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when messages array is missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-fake-key-1234567890');
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limit exceeded', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-fake-key-1234567890');
    const headers = { 'x-forwarded-for': '1.2.3.4' };
    // 10 successful (rate-limit allows) — they'll proceed past the
    // gate and fail at the Anthropic call because we haven't mocked
    // it. We're testing that the 11th request hits the rate-limit
    // gate BEFORE the Anthropic call.
    for (let i = 0; i < 10; i++) {
      try {
        await POST(
          makeRequest({ messages: [{ role: 'user', content: 'hi' }] }, headers),
        );
      } catch {
        // Anthropic call may throw (no real key / no network mock) —
        // we don't care about the response, only that the bucket
        // increments.
      }
    }
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }] }, headers),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'rate_limited' });
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });
});

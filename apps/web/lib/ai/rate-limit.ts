/**
 * Per-IP in-memory token bucket for /api/ask.
 *
 * Bucket: 10 requests per 10 minutes per IP. Sliding window — each
 * bucket records the timestamp of the first request in the current
 * window; once 10 minutes pass since that first request, the bucket
 * resets.
 *
 * Edge-runtime caveat: the Map lives in a single edge-function
 * instance. Under multi-instance load the effective limit becomes
 * `10 × instances`, which is fine for a demo. If this surfaces past
 * the prototype phase, swap in Vercel KV (the public API of this
 * module stays the same).
 */

const MAX_REQUESTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

type Bucket = {
  count: number;
  windowStart: number; // ms epoch
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(ip: string): RateLimitResult {
  const key = ip || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    // Fresh window.
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil(
      (bucket.windowStart + WINDOW_MS - now) / 1000,
    );
    return { ok: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { ok: true, remaining: MAX_REQUESTS - bucket.count };
}

/**
 * Reset the in-memory bucket store. Test-only — exposes intentionally
 * since vitest can't reach module-level Maps otherwise. Production code
 * should never call this.
 */
export function _resetForTest(): void {
  buckets.clear();
}

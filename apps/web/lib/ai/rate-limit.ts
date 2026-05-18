/**
 * Per-IP in-memory token bucket for /api/ask.
 *
 * Two layered limits:
 *
 *   1. Short window — 10 requests / 10 minutes per IP.
 *      Catches a runaway client (browser-tab spam, fast retry loop).
 *
 *   2. Daily cap — 100 requests / 24 hours per IP. Added 2026-05-14.
 *      Even if a single IP stays under the short-window cap forever,
 *      they could queue 1,440 requests/day at the per-window ceiling.
 *
 * COST CEILING ANALYSIS (revised 2026-05-14 after bundle/perf audit
 * measured real-world chat costs):
 *
 *   - "Light" query (1-2 tool calls, ~15K input tokens, ~500 output):
 *     ~$0.05/message — pretty close to the original "5¢/request"
 *     estimate this comment used to claim.
 *   - "Heavy" multi-tool query (12 tool steps, ~80K cumulative input,
 *     ~5K output): ~$0.31/message — 6× the light path. Each tool
 *     roundtrip re-pays the ~10K-token system prompt + tool defs.
 *
 *   At 100 req/IP/day cap:
 *     • Best case:  $5/IP/day  (all light)
 *     • Worst case: $31/IP/day (all heavy)
 *
 *   With 10,000 distinct anonymous IPs hitting the daily cap:
 *     • Best:  $50,000/day
 *     • Worst: $310,000/day
 *
 *   Anthropic's org-wide rate limit (30K input tokens/min on the
 *   current tier) is the harder ceiling already in effect — at
 *   $3/1M input tokens that's $130/day floor IF saturated. The chat
 *   visibly stalls 55s on retry storms when this fires.
 *
 *   Mitigations not yet applied:
 *     • Anthropic prompt caching (cuts repeated system+tool tokens
 *       to 10% of original cost on cache hits — 6× cost reduction)
 *     • System-prompt pruning (5K tokens, several disambiguation
 *       cases could move into tool descriptions)
 *     • Per-message output-token budget cap (currently only the
 *       per-step `maxOutputTokens: 1024` is bounded, not cumulative)
 *
 * Both buckets check on every /api/ask call; the FIRST one that
 * rejects wins (with the longer `retryAfterSeconds` if it's the
 * daily cap).
 *
 * Edge-runtime caveat: the Map lives in a single Node-runtime
 * instance. Under multi-instance load the effective limit becomes
 * `cap × instances`, which is fine for an anonymous-only demo. If
 * this surfaces past the prototype phase, swap in Vercel KV (the
 * public API of this module stays the same).
 */

const SHORT_WINDOW_MAX = 10;
const SHORT_WINDOW_MS = 10 * 60 * 1000;

const DAILY_MAX = 100;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

type Bucket = {
  count: number;
  windowStart: number; // ms epoch
};

// Two independent maps so the daily and short-window buckets evict
// on their own cadences. Both keyed by ip-or-"unknown".
const shortBuckets = new Map<string, Bucket>();
const dailyBuckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number; bucket: 'short' | 'daily' };

function checkBucket(
  store: Map<string, Bucket>,
  key: string,
  windowMs: number,
  cap: number,
  now: number,
): { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number } {
  const bucket = store.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: cap - 1 };
  }

  if (bucket.count >= cap) {
    const retryAfterSeconds = Math.ceil(
      (bucket.windowStart + windowMs - now) / 1000,
    );
    return { ok: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { ok: true, remaining: cap - bucket.count };
}

/**
 * Check both short-window and daily limits. Daily is checked FIRST
 * because if it's exhausted, the short-window admit would be a false
 * positive (the request will reject downstream anyway). Both buckets
 * are mutated on admit so they stay in sync.
 *
 * NOTE: this means a daily-rejected request does NOT consume a
 * short-window slot. Inverse: a short-rejected request DOES consume
 * a daily slot because the daily increment already happened. That
 * asymmetry is intentional — a daily cap is the harder ceiling.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const key = ip || 'unknown';
  const now = Date.now();

  // Daily cap — peek first WITHOUT incrementing.
  const dailyBucket = dailyBuckets.get(key);
  if (
    dailyBucket
    && now - dailyBucket.windowStart < DAILY_WINDOW_MS
    && dailyBucket.count >= DAILY_MAX
  ) {
    const retryAfterSeconds = Math.ceil(
      (dailyBucket.windowStart + DAILY_WINDOW_MS - now) / 1000,
    );
    return { ok: false, retryAfterSeconds, bucket: 'daily' };
  }

  // Short window — admits or rejects, mutates the short bucket.
  const shortResult = checkBucket(
    shortBuckets, key, SHORT_WINDOW_MS, SHORT_WINDOW_MAX, now,
  );
  if (!shortResult.ok) {
    return { ...shortResult, bucket: 'short' };
  }

  // Admitted by short window — now consume a daily slot.
  const dailyResult = checkBucket(
    dailyBuckets, key, DAILY_WINDOW_MS, DAILY_MAX, now,
  );
  if (!dailyResult.ok) {
    return { ...dailyResult, bucket: 'daily' };
  }

  return {
    ok: true,
    remaining: Math.min(shortResult.remaining, dailyResult.remaining),
  };
}

/**
 * Reset the in-memory bucket store. Test-only — exposed intentionally
 * since vitest can't reach module-level Maps otherwise. Production code
 * should never call this.
 */
export function _resetForTest(): void {
  shortBuckets.clear();
  dailyBuckets.clear();
}

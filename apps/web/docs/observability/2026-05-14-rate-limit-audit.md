# Rate-Limit & Spend-Cap Audit — Experimental /ask Chat

**Date:** 2026-05-14
**Branch:** `feat/experimental-ask-chat`
**Scope:** Anonymous-only `/api/ask` endpoint; Anthropic + Voyage spend; catalog API exposure to anonymous traffic.

This audit captures the protections in place against runaway LLM spend and
catalog-API DDoS, and lists the concrete additions made in this session
plus the gaps that remain (largely out-of-scope dashboard work).

---

## 1. Current rate-limit posture

### 1.1 Frontend — `/api/ask` (apps/web)

File: `apps/web/lib/ai/rate-limit.ts`
Called from: `apps/web/app/api/ask/route.ts` (before any body parsing).

**Layered limits (this session):**

| Bucket  | Cap                | Window |
|---------|--------------------|--------|
| `short` | 10 requests        | 10 min |
| `daily` | 100 requests       | 24 h   |

Both apply per client IP (extracted from `x-forwarded-for[0]` or
`x-real-ip`, with `'unknown'` as the shared-bucket fallback). The
storage is an in-memory `Map` inside the Node-runtime serverless
function. Daily is the harder ceiling — a daily-rejected request
does NOT consume a short-window slot, but a short-rejected request
does consume daily (it was already incremented).

**Multi-instance caveat:** the Map lives in a single serverless
instance's memory. Under multi-instance fan-out the effective limit
becomes `cap × instances`. Acceptable for an anonymous-only demo;
for prod, swap in Vercel KV (the public API of the module stays the
same).

### 1.2 Backend — FastAPI (`ndi-data-browser-v2`)

File: `backend/middleware/rate_limit.py` — Redis-backed sliding-window
limiter using a sorted set per `(bucket, subject)`. Falls back to
in-memory on Redis failure with a warn log.

Subjects:
- Authenticated: `u:<user_id>`
- Anonymous: `i:<sha256(ip)[:16]>` (IP hashed; never logged raw)

Default per-minute limits (configurable via `backend/config.py`):

| Bucket               | Default cap | Window | Used by                                                       |
|----------------------|-------------|--------|---------------------------------------------------------------|
| `reads`              | 120         | 60s    | `/api/datasets/*` (incl. `/published`), `/tables/*`, `/documents/*`, `/binary/*`, `/visualize/*`, `/ontology/*`, `/facets`, `/signal/*`, `/tabular_query/*` |
| `query`              | 30          | 60s    | `/api/query` (mutating queries)                               |
| `bulk-fetch`         | 10          | 60s    | bulk-fetch by-IDs                                             |
| `login-ip`           | 5           | 15 min | auth login attempts per IP                                    |
| `login-user`         | 10          | 60 min | auth login attempts per user                                  |
| `csrf-fail-ip`       | 20          | 5 min  | CSRF rejection counter (DoS-detection)                        |

Every request that the `/ask` chat tools make hits one of these
backend buckets — so a runaway LLM that fires 100 `query_documents`
calls against one IP would land on `reads` (120/min) and start
returning HTTP 429 well before doing real damage. The frontend
`apiFetch<T>()` will then surface that as an `{error}` ToolResult.

### 1.3 Catalog DDoS exposure

`/api/datasets/published` is gated by the `reads` bucket (120/min).
At 120 req/min × 60 min × 24 h × 1 IP that's still 172,800 calls/day
of catalog-shaped JSON. The response is moderately heavy (~50 KB)
because of per-row summary synthesis, BUT it's edge-cached via
TanStack-Query persistence on the frontend and (via Vercel's CDN
when shaped through Next.js RSC) at edge. Direct anonymous hits to
the FastAPI route still cost cloud-Lambda fan-out per cold-cache
read. The cache TTL on the backend is 1 hour for the table responses
plus 5 min for the catalog list (per `RedisTableCache`).

Net: a 120-req/min hot loop on `/published` from one IP delivers
mostly Redis hits, not Lambda fan-outs. Acceptable for now.

---

## 2. Spend-cap status (Anthropic + Voyage)

### 2.1 Anthropic API

File: `apps/web/app/api/ask/route.ts`, `apps/web/lib/ai/anthropic-client.ts`.

| Knob                    | Value                                                            | Notes                                                                                                                           |
|-------------------------|------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| Model                   | `claude-sonnet-4-5`                                              | Pinned in `anthropic-client.ts`.                                                                                                |
| `maxOutputTokens`       | **1024**                                                         | Hard cap per turn. Caps any single LLM reply at $0.04 output max (Sonnet 4.5 @ $15/M output tokens × 1024 / 1M ≈ $0.015 output). |
| `stopWhen`              | `stepCountIs(12)`                                                | Caps tool-use loop at 12 model turns per /ask call. Bounds the multiplier from "one prompt → many model invocations".          |
| `maxDuration` (Vercel)  | 60 s                                                             | Function-level wall-clock cap. Backstop if the model gets stuck.                                                                |
| Input-side cap          | **NONE** — no explicit `maxInputTokens` clamp.                   | See gap #1 below.                                                                                                               |

**Per-request worst-case cost (current settings):**

- Input: ~5K tokens of system prompt + tools schema + ~3K of conversation history + tool results growing across 12 steps. Estimate ~50K input tokens per turn × 12 steps ≈ 600K input tokens (mostly cache-able). At Sonnet 4.5 input pricing of $3/M (uncached) that's $1.80/turn worst case. With prompt-caching ($0.30/M cached) the steady-state is ~$0.20.
- Output: 1024 tokens × 12 steps × $15/M ≈ $0.18/turn cap.
- **Worst-case per /ask call: ~$2 uncached / ~$0.40 cached.**

10,000 worst-case prompts ≈ $20,000 uncached / $4,000 cached.

### 2.2 Voyage AI (embeddings + rerank)

File: `apps/web/lib/ai/voyage-client.ts`. Called from hybrid retrieval.

- `embedQuery(text)` — one call per user turn (the user's question only).
- `rerank(query, documents, topK)` — one call per user turn (top ~20-30
  candidates × topK ≈ 10).
- 8s timeout per call.
- No explicit per-IP limiter; relies on the upstream `/api/ask`
  rate-limit to throttle.

Voyage pricing is ~$0.18/M tokens embeddings and ~$0.50/M reranks.
A typical turn: ~50 tokens embedded + ~5K tokens reranked ≈ $0.003/turn.
10,000 worst-case turns ≈ $30. Negligible compared to Anthropic spend.

### 2.3 Backend catalog calls (per /ask turn)

Each tool call to `query_documents`, `get_dataset`, `list_published_datasets`,
etc. flows through `apiFetch<T>()` → backend FastAPI → cloud-node bulk-fetch.
The `tables/*` route is Redis-cached (1h TTL) so a hot dataset only
hits cloud once per hour. Cold-cache reads cost $0.01-$0.05/dataset
in cloud Lambda time.

---

## 3. Gaps & out-of-scope items

### 3.1 In-scope, NOT addressed in this session

- **Anthropic input-token cap** — there's no explicit `maxInputTokens`
  parameter in `streamText`, and the AI SDK doesn't expose one in v6.
  Mitigation: the conversation store trims to the last 20 messages
  (`apps/web/lib/ai/conversation-store.ts`) and `stopWhen=stepCountIs(12)`
  caps the tool-result accumulation. If we observe input-token blow-ups
  in practice, we can pre-truncate the messages array in the route
  handler before `streamText`.

- **Cost-headers logging** — the AI SDK reply includes `usage.inputTokens`
  / `usage.outputTokens` in the stream's onFinish callback but we don't
  currently log them. Adding a `onFinish: (e) => log({ ...e.usage })`
  callback would let us track per-IP cost trends. Not in scope for this
  audit but called out as the next observability win.

### 3.2 Out-of-scope (Vercel/Anthropic dashboard)

- **Anthropic spend alerts** — must be configured via the Anthropic
  console (per-API-key spend cap, email alerts at $100/$500/$1000
  thresholds). Not visible from code; flag this for a dashboard pass
  by the owner.
- **Vercel Function Invocations alerts** — Vercel's billing dashboard
  surfaces per-project function-invocation counts and durations.
  Configure a daily-invocation threshold alert.
- **Voyage AI billing alerts** — set in the Voyage console; same
  pattern as Anthropic.

---

## 4. Concrete protections added this session

1. **Daily-cap rate limit** in `apps/web/lib/ai/rate-limit.ts` — 100
   req/IP/day on top of the existing 10/10min short-window cap. Pins
   single-IP worst-case spend at ~$5/day (uncached Anthropic) or
   ~$1/day (cached). 10K abusive IPs = $50K/day worst case — at that
   point Vercel/Anthropic dashboard alerts catch it.

2. **`bucket` field in 429 response** — `apps/web/app/api/ask/route.ts`
   now echoes `{bucket: 'short' | 'daily'}` so the frontend (and any
   external monitoring) can distinguish the two ceiling types.

3. **Test coverage** — `apps/web/tests/unit/ai/rate-limit.test.ts`
   extended with daily-cap admit/reject/reset/isolation tests.

---

## 5. Recommended next steps (in order)

1. **(out of scope, dashboard)** Configure Anthropic spend alerts at
   $100/$500/$1000 thresholds via the Anthropic console.
2. **(out of scope, dashboard)** Configure Vercel daily-invocations
   alert on the apps/web project.
3. **(in scope, future PR)** Add `onFinish` logging of `usage` tokens
   from `streamText` so we can track per-IP cost trends in Vercel logs.
4. **(in scope, future PR)** Swap the in-memory `Map` for Vercel KV
   when the chat opens past the prototype phase — preserves the
   daily cap across multi-instance fan-out.
5. **(future)** When daily cap rejection rate exceeds 0.5% (visible
   via the `bucket` field), tighten or add a global app-level cap.

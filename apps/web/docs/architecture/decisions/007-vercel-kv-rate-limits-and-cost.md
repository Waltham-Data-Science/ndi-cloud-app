# ADR-007 — Vercel KV for rate limiting + per-user cost ceilings

**Status:** Proposed (Stream 3 deliverable; will be Accepted on Stream 3 ship)
**Date:** 2026-05-15

## Context

Today's rate limits in the FastAPI backend
(`backend/middleware/rate_limit.py`) use Redis on Railway. For the
authenticated `/ask` migration in Stream 3, we need:

1. **Per-user rate limits** — 50 chat requests / day, 10 / 10min burst.
   Today's limits are per-IP, which conflates household sharing and
   misses the actual cost driver (per-user chat consumption).

2. **Per-org monthly spend ceiling** — read a "max spend in cents per
   month" from a `chat_usage_events` rollup, return 429 with
   `error.code = "quota_exceeded"` when exceeded.

3. **Per-org access control** — `enable_ask: bool` flag per
   organization, default `false`, toggled by ops.

These three reads are tiny (a few bytes each) and happen on every
`/ask` request, which means they're on the hot path.

We could implement them in:

- **Railway Postgres + Redis** (what we have today for rate limiting).
- **Vercel KV** — Vercel's managed key-value store, edge-replicated,
  read latency ~ms.

## Decision (proposed — pending Stream 3 implementation)

Use **Vercel KV** for the three counters above. The choice is
deliberate:

1. `/ask` is a Next.js API route running on Vercel. Reading from
   Vercel KV is sub-millisecond. Reading from Railway Redis is
   ~50-100ms (the network hop).

2. The session affinity is already there: the `/ask` route already
   reads `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, etc. from Vercel env.
   Adding a Vercel-side KV is the same affinity.

3. The data is genuinely tiny and ephemeral. Daily counters, monthly
   cost ledgers — we don't need ACID semantics or cross-row queries.
   Vercel KV's KV semantics + TTL support are sufficient.

4. The `chat_usage_events` table itself stays in Railway Postgres
   (longer-term audit log, queried by the admin UI). Vercel KV just
   holds the CURRENT rollups (today's count, this month's spend).

## Rationale

1. **Latency budget on the chat hot path.** Every chat request makes
   4 KV reads (rate limit check ×2, monthly spend check, org access
   check) before any business logic. Doing those at Railway round-trip
   latency would add 200-400ms per request. Vercel KV puts them
   sub-millisecond.

2. **Doesn't replace Postgres for the durable record.** Audit logs of
   every chat invocation still go to Postgres (`chat_usage_events`),
   queryable by the admin UI. KV is just the FAST counter; Postgres is
   the SLOW truth.

3. **Rate-limit headers want to be on the response.** The chat route
   needs to surface `X-RateLimit-Remaining-Daily` + `X-RateLimit-Reset`
   on every response. Reading those from KV is a single round trip;
   reading from Railway means the response can't be returned until that
   round trip lands.

## Consequences

**Positive:**
- Sub-millisecond rate-limit and quota checks on every chat request.
- Per-user keys (`rate:user:<id>:day` etc.) scale to the org sizes we
  anticipate.
- Existing FastAPI Redis-backed rate limit for the rest of the
  surface (non-chat routes) stays in place — no migration cost.

**Negative:**
- Two KV stores now: Vercel KV (chat-only) + Railway Redis (rest of
  API). Operators need to understand the split.
- Vercel KV adds a recurring cost (Vercel KV is part of the Vercel
  Storage marketplace product; current pricing TBC at Stream 3 start).
- If Vercel KV is unavailable, the chat fails closed (rate-limit
  check returns "rate limited" rather than allowing all requests). We
  accept this — chat is non-essential vs catalog reads.

## Alternatives considered

**(a) Railway Redis (existing).** Rejected per the latency argument
above.

**(b) Self-built rate-limit in Postgres (`upsert ... returning`).**
Rejected — adds load to the durable Postgres, complicates the
ratelimit logic.

**(c) Anthropic-side spending caps only.** Rejected. Anthropic's
caps are coarse (the whole API key, not per-user) and don't enforce
the per-org `enable_ask` boolean.

## Status — what's pending Stream 3

| Item | Status |
|---|---|
| Provision Vercel KV instance | Pending Stream 3 (Session 5) |
| Implement `lib/ai/rate-limit.ts` with KV reads | Pending |
| Update `/api/ask` route to read KV before any model call | Pending |
| Wire the per-user + per-org keys | Pending |
| Document the rollback path (KV unavailable → chat returns 503) | Pending |

This ADR is in **Proposed** status until those land; it will flip to
**Accepted** as part of the Stream 3 PR.

## Related

- Stream 3 sections 3.3 (rate limiting), 3.4 (per-org access control)
- ADR-006 (pgvector on Railway — NOT Vercel KV; different store, different purpose)

# Cost telemetry — design spec

**Status:** Design — implementation deferred to Stream 3 (auth-gated `/ask`)
**Date:** 2026-05-15
**Stream reference:** S2.4 (master plan); folds into S3.2

## Goal

Capture every `/ask` LLM invocation as a structured cost event so we can:

1. Charge customers fairly when chat moves to paid (Stream 3 scope).
2. Cap per-user and per-org spend with hard ceilings (Stream 3.3).
3. Surface daily / weekly / monthly cost rollups in an admin dashboard.
4. Tripwire alert when daily spend exceeds a threshold.
5. Reconcile against Anthropic + Voyage dashboards weekly to catch
   silent budget creep.

Reading order: ADR-007 (Vercel KV for hot-path counters) explains where
the LIVE counters live; this spec covers the durable record + admin UI.

---

## Data model

New Postgres table on the experimental Railway env (and eventually
production once auth-gated `/ask` ships):

```sql
CREATE TABLE chat_usage_events (
    -- Identity
    id                BIGSERIAL PRIMARY KEY,
    user_id           TEXT      NOT NULL,
    organization_id   TEXT      NOT NULL,
    conversation_id   TEXT      NOT NULL,
    request_id        TEXT      NOT NULL,    -- correlation across services
    -- Timing
    started_at        TIMESTAMP NOT NULL DEFAULT now(),
    duration_ms       INTEGER   NOT NULL,
    -- Token counts (from Anthropic response headers / response.usage)
    input_tokens      INTEGER   NOT NULL DEFAULT 0,
    output_tokens     INTEGER   NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER   NOT NULL DEFAULT 0,
    cache_create_tokens INTEGER NOT NULL DEFAULT 0,
    -- Voyage usage (sum across all tool calls in this turn)
    voyage_embed_tokens INTEGER NOT NULL DEFAULT 0,
    voyage_rerank_units INTEGER NOT NULL DEFAULT 0,
    -- Per-provider cost (cents, computed server-side from token counts × rate card)
    anthropic_input_cost_cents  INTEGER NOT NULL DEFAULT 0,
    anthropic_output_cost_cents INTEGER NOT NULL DEFAULT 0,
    voyage_embed_cost_cents     INTEGER NOT NULL DEFAULT 0,
    voyage_rerank_cost_cents    INTEGER NOT NULL DEFAULT 0,
    total_cost_cents            INTEGER GENERATED ALWAYS AS (
        anthropic_input_cost_cents + anthropic_output_cost_cents
        + voyage_embed_cost_cents + voyage_rerank_cost_cents
    ) STORED,
    -- Tool dispatch summary (counts only — no input/output bodies)
    tool_calls_count  INTEGER   NOT NULL DEFAULT 0,
    tool_names        TEXT[]    NOT NULL DEFAULT '{}',  -- e.g. ['ndi_query','psth']
    -- Outcome
    outcome           TEXT      NOT NULL,   -- 'success' | 'rate_limited' | 'quota_exceeded' | 'upstream_error' | 'aborted'
    error_kind        TEXT,                  -- when outcome != 'success'
    -- Audit
    model_id          TEXT      NOT NULL,   -- 'claude-sonnet-4-x'
    streamed          BOOLEAN   NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_chat_usage_user_started   ON chat_usage_events (user_id, started_at DESC);
CREATE INDEX idx_chat_usage_org_started    ON chat_usage_events (organization_id, started_at DESC);
CREATE INDEX idx_chat_usage_started        ON chat_usage_events (started_at DESC);
```

**Critical privacy contract:** this table contains COUNTS only — no prompt
text, no tool input bodies, no tool output bodies. The PHI-in-logs
regression test (`backend/tests/unit/test_no_phi_in_logs.py`) covers the
log surface; the cost-event surface is constrained by the schema itself
(no TEXT columns for content).

---

## Write path

In the cloud-app `/api/ask/route.ts`, after `result.toUIMessageStreamResponse()`:

```ts
// Pseudo-code — actual implementation in Stream 3.2
import { logUsage } from '@/lib/usage/log';

const usage = await collectUsage(result); // pulls token counts from AI SDK response
await logUsage({
  userId, organizationId, conversationId, requestId,
  durationMs: Date.now() - startedAt,
  ...usage,                // token counts + per-provider cost in cents
  toolCallsCount, toolNames,
  outcome, errorKind,
  modelId: 'claude-sonnet-4-x',
});
```

`logUsage()` writes one row to `chat_usage_events` via a thin FastAPI
endpoint `POST /api/usage/events` (the cloud-app side calls this; the
FastAPI handler does the actual INSERT). Why route through FastAPI:

1. **Single DB writer.** The same FastAPI proxy owns the Postgres
   connection pool. Adding a separate writer from Vercel introduces a
   second connection pool to size + monitor.
2. **Auth-aware boundary.** `POST /api/usage/events` validates the
   inbound auth + that the `user_id` in the body matches the
   authenticated user. Prevents a misconfigured Vercel deploy from
   writing arbitrary user_ids.

The write is BEST-EFFORT. If the write fails (network blip, Postgres
unavailable), the chat response is unaffected — the user gets their
answer. Cost-event loss is acceptable (rare; reconciled against
Anthropic + Voyage dashboards weekly).

---

## Read path — admin dashboard

New page at `/admin/cost-dashboard` (Stream 3 scope):

| Surface | Query |
|---|---|
| Daily / weekly / monthly total spend | `SELECT date_trunc('day', started_at) AS day, SUM(total_cost_cents) FROM chat_usage_events GROUP BY day ORDER BY day DESC LIMIT 30;` |
| Per-org rollup | `SELECT organization_id, SUM(total_cost_cents), COUNT(*) FROM chat_usage_events WHERE started_at > now() - interval '30 days' GROUP BY organization_id ORDER BY 2 DESC;` |
| Top spending users (this month) | `SELECT user_id, SUM(total_cost_cents) FROM chat_usage_events WHERE date_trunc('month', started_at) = date_trunc('month', now()) GROUP BY user_id ORDER BY 2 DESC LIMIT 20;` |
| Tool-mix histogram | `SELECT unnest(tool_names) AS tool, COUNT(*) FROM chat_usage_events WHERE started_at > now() - interval '7 days' GROUP BY tool;` |
| Failure-rate trend | `SELECT date_trunc('hour', started_at), outcome, COUNT(*) FROM chat_usage_events WHERE started_at > now() - interval '24 hours' GROUP BY 1, 2;` |

Authorization: only users with `is_admin: true` on the session can hit
`/admin/cost-dashboard`. The admin-flag check uses the existing
session-cached `is_admin` field
(`backend/auth/session.py:SessionData.is_admin`).

---

## Tripwire alerting

A cron-driven task (Vercel Cron, hourly):

```ts
// app/api/cron/cost-tripwire/route.ts
const dailySpend = await fetchUsageRollup({ days: 1 });
if (dailySpend.total_cost_cents > TRIPWIRE_DAILY_CENTS) {
  await emailOpsAlert({
    subject: `Daily chat spend tripwire fired: $${dailySpend.total_cost_cents/100}`,
    breakdown: dailySpend.per_org,
  });
}
```

`TRIPWIRE_DAILY_CENTS` is a per-environment env var. Default for
`Preview` (this branch): 500 ($5). Default for `Production` (when
Stream 3 ships): TBD by ops budget.

The cron secret pattern lives at `apps/web/.env.example`'s
`CRON_SECRET` (Stream 1 T1.7 added that).

---

## Rate card

Token-rate constants live in `apps/web/lib/usage/rate-card.ts`:

```ts
// Updated whenever provider rates change; commit-bound for auditability.
export const ANTHROPIC_SONNET_INPUT_CENTS_PER_MILLION = 300;  // $3 / 1M tokens
export const ANTHROPIC_SONNET_OUTPUT_CENTS_PER_MILLION = 1500;
export const ANTHROPIC_CACHE_READ_CENTS_PER_MILLION = 30;
export const ANTHROPIC_CACHE_WRITE_CENTS_PER_MILLION = 375;
export const VOYAGE_EMBED_CENTS_PER_MILLION = 12;
export const VOYAGE_RERANK_CENTS_PER_QUERY = 0.05;
```

Rates are quoted from each provider's published rate sheet on the
commit-date. Validity: reviewed quarterly OR on any provider price
change.

---

## Privacy invariants

| Field | Stored? | Why |
|---|---|---|
| Prompt text | ❌ Never | PHI risk |
| Tool input arguments | ❌ Never | PHI risk (could contain dataset content) |
| Tool output bodies | ❌ Never | PHI risk |
| Response text | ❌ Never | PHI risk |
| User ID | ✅ | Required for per-user rollup; opaque Cognito sub |
| Organization ID | ✅ | Required for per-org rollup; opaque |
| Conversation ID | ✅ | Allows cross-event correlation; opaque |
| Request ID | ✅ | Cross-service tracing; opaque |
| Token counts | ✅ | Required for cost; no content |
| Tool NAMES (not args) | ✅ | Required for tool-mix analytics; safe |
| Outcome / error kind | ✅ | Required for failure-rate tracking; enum |

The `chat_usage_events` schema is designed so that even a database
breach would yield no PHI — only timing + counts + opaque IDs.

---

## Reconciliation

Weekly job (manual today; automatable later):

1. Pull this week's `SUM(anthropic_input_cost_cents +
   anthropic_output_cost_cents)` from `chat_usage_events`.
2. Pull this week's usage from Anthropic dashboard for the same period.
3. If they differ by >5%, investigate (event-write failures, rate-card
   drift, miscounted cached tokens).

Same for Voyage.

---

## Stream 3 implementation checklist

When Stream 3 lands, these are the pieces:

| Item | Location |
|---|---|
| Create table | New migration in `Waltham-Data-Science/ndi-data-browser-v2/backend/migrations/` |
| FastAPI handler | New `backend/services/usage_tracking_service.py` + `backend/routers/usage.py` |
| Cloud-app writer | `apps/web/lib/usage/log.ts` |
| Wire into `/api/ask/route.ts` | Existing route — add `await logUsage(...)` after stream response |
| Admin dashboard page | `apps/web/app/(app)/admin/cost-dashboard/page.tsx` |
| Tripwire cron route | `apps/web/app/api/cron/cost-tripwire/route.ts` |
| Tests | `backend/tests/unit/test_usage_tracking_service.py` + `apps/web/tests/unit/usage/*` |

---

## Update history

| Date | Change |
|---|---|
| 2026-05-15 | Initial design (Stream 2.4 deliverable; impl is Stream 3.2). |

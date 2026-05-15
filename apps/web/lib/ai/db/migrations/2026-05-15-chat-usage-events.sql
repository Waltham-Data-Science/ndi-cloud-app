-- Stream 3.2 (2026-05-15) — chat_usage_events table.
--
-- Backing store for per-user / per-org chat cost tracking. One row
-- per /api/ask invocation. Read by:
--   - the future admin cost-dashboard (Stream 3 follow-up)
--   - per-user `/my-account/usage` summary page
--   - the daily-spend tripwire cron (alerts ops on cost spikes)
--
-- Privacy invariant: this table holds COUNTS + opaque IDs only — no
-- prompt text, no tool input bodies, no tool output bodies, no
-- response text. The schema deliberately has NO free-text content
-- column so even a future logging bug can't introduce PHI here.
--
-- Lives in the same Railway Postgres as the /ask RAG chunks and
-- dataset_health_violations tables. Schema spec at
-- apps/web/docs/specs/2026-05-15-cost-telemetry-design.md.
--
-- Idempotent. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS chat_usage_events (
    -- Identity (opaque)
    id                BIGSERIAL PRIMARY KEY,
    user_id           TEXT NOT NULL,
    organization_id   TEXT,
    conversation_id   TEXT,
    request_id        TEXT NOT NULL,
    -- Timing
    started_at        TIMESTAMP NOT NULL DEFAULT now(),
    duration_ms       INTEGER NOT NULL DEFAULT 0,
    -- Anthropic token counts (read from streamText `usage` callback)
    input_tokens      INTEGER NOT NULL DEFAULT 0,
    output_tokens     INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_create_tokens INTEGER NOT NULL DEFAULT 0,
    -- Voyage usage (RAG embedding + rerank)
    voyage_embed_tokens INTEGER NOT NULL DEFAULT 0,
    voyage_rerank_units INTEGER NOT NULL DEFAULT 0,
    -- Per-provider cost in cents (computed server-side from rate card)
    anthropic_input_cost_cents  INTEGER NOT NULL DEFAULT 0,
    anthropic_output_cost_cents INTEGER NOT NULL DEFAULT 0,
    voyage_embed_cost_cents     INTEGER NOT NULL DEFAULT 0,
    voyage_rerank_cost_cents    INTEGER NOT NULL DEFAULT 0,
    total_cost_cents            INTEGER GENERATED ALWAYS AS (
        anthropic_input_cost_cents + anthropic_output_cost_cents
        + voyage_embed_cost_cents + voyage_rerank_cost_cents
    ) STORED,
    -- Tool dispatch summary (counts + names only — never inputs/outputs)
    tool_calls_count  INTEGER NOT NULL DEFAULT 0,
    tool_names        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- Outcome enum
    outcome           TEXT NOT NULL,
    error_kind        TEXT,
    -- Audit
    model_id          TEXT NOT NULL,
    streamed          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Query patterns: per-user rollup, per-org rollup, daily totals.
CREATE INDEX IF NOT EXISTS idx_chat_usage_user_started
    ON chat_usage_events (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_usage_org_started
    ON chat_usage_events (organization_id, started_at DESC)
    WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_usage_started
    ON chat_usage_events (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_usage_outcome
    ON chat_usage_events (outcome);

COMMIT;

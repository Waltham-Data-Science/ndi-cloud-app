-- Stream 6.8 (2026-05-15) — Dataset Health violations snapshot table.
--
-- Backing store for the nightly Dataset Health cron (Stream 6.8) +
-- the /admin/data-health page (Stream 6.9) + future enriched catalog
-- badge (Stream 6.10 extension). One row per (dataset_id,
-- invariant_key) per snapshot run. The cron clears prior rows for a
-- dataset before inserting the new snapshot, so this table always
-- reflects the LATEST per-dataset state.
--
-- Lives in the same Railway Postgres as the /ask RAG chunks table
-- (one Postgres instance per env; see ADR-006 + the cost-telemetry
-- design at apps/web/docs/specs/2026-05-15-cost-telemetry-design.md).
-- Read by the cloud-app admin route via the `pg` pool at
-- apps/web/lib/ai/db/pool.ts; written by the Vercel-cron route at
-- apps/web/app/api/cron/dataset-health/route.ts.
--
-- Idempotent. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS dataset_health_violations (
    id              BIGSERIAL PRIMARY KEY,
    -- Mongo-shaped 24-char hex catalog id.
    dataset_id      TEXT NOT NULL,
    -- Captured at snapshot time so the admin UI can show a name
    -- without joining against a separate dataset table.
    dataset_name    TEXT,
    -- Stable machine identifier (see INVARIANTS in
    -- apps/web/lib/data-quality/invariants.ts).
    invariant_key   TEXT NOT NULL,
    -- Human-friendly label (snapshotted so historical rows survive
    -- a future label rewording).
    invariant_label TEXT NOT NULL,
    -- 'critical' | 'warning' | 'info' (matches the TS Severity).
    severity        TEXT NOT NULL,
    -- Single-line violation message for the admin UI.
    message         TEXT NOT NULL,
    -- Raw numbers + labels that triggered the violation. Schema-
    -- free so new invariants can land without a migration.
    observation     JSONB NOT NULL DEFAULT '{}',
    -- When the snapshot ran. Use `MAX(snapshot_at)` per
    -- dataset_id to find the latest scan.
    snapshot_at     TIMESTAMP NOT NULL DEFAULT now()
);

-- The admin page reads the LATEST snapshot per dataset; the cron
-- writes one batch per dataset. These two indexes serve both.
CREATE INDEX IF NOT EXISTS idx_dh_violations_dataset_id
    ON dataset_health_violations (dataset_id);
CREATE INDEX IF NOT EXISTS idx_dh_violations_snapshot_at
    ON dataset_health_violations (snapshot_at DESC);
-- Filter by severity for the admin's "show me criticals only" view.
CREATE INDEX IF NOT EXISTS idx_dh_violations_severity
    ON dataset_health_violations (severity);

COMMIT;

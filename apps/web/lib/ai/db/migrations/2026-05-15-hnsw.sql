-- Stream 4.10 (2026-05-15) — pgvector IVFFlat → HNSW migration.
--
-- The /ask RAG store uses pgvector (ADR-006). The original schema (in
-- lib/ai/db/schema.sql) created the vector index as IVFFlat with
-- lists=100, matching vh-lab + shrek-lab. The 2026-05-15 architecture
-- audit (Finding #9) measured ~30-80ms per semantic search latency
-- against this index; HNSW at default params (m=16, ef_construction=64)
-- typically drops that to ~5-15ms at our corpus size (~500 chunks
-- today, headroom to ~50K before tuning matters).
--
-- This migration is IDEMPOTENT and SAFE TO RE-RUN:
--   - `DROP INDEX IF EXISTS` skips when the old index is absent.
--   - `CREATE INDEX IF NOT EXISTS` skips when the new one already
--     exists.
--   - Data in `chunks` / `chunks_staging` is untouched — only the
--     index structure changes. Vacuum / analyze not needed.
--
-- Roll-forward (run once against the experimental Railway env first,
-- then production once the latency win is confirmed):
--
--     psql "$DATABASE_URL" -f apps/web/lib/ai/db/migrations/2026-05-15-hnsw.sql
--
-- Roll-back: re-run the IVFFlat blocks from the original schema. The
-- runtime semantic_search code (`apps/web/lib/ai/hybrid-retrieval.ts`)
-- is index-type-agnostic — it issues the same `<=>` cosine ORDER BY
-- regardless of whether the underlying index is IVFFlat or HNSW.
--
-- The schema.sql file has been updated in lockstep so fresh
-- bootstraps use HNSW from the first build.

BEGIN;

-- chunks (production read surface)
DROP INDEX IF EXISTS idx_chunks_embedding;
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- chunks_staging (atomic-promote mirror)
DROP INDEX IF EXISTS idx_chunks_staging_embedding;
CREATE INDEX IF NOT EXISTS idx_chunks_staging_embedding
    ON chunks_staging USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMIT;

-- Optional: tune the runtime accuracy/latency tradeoff per session.
-- Default ef_search is 40 — HNSW's "how hard to search" knob. Higher
-- = better recall, lower = faster. For a corpus of ~500 our existing
-- voyage-4-large + RRF + rerank pipeline is robust to small recall
-- dips, so 40 is fine; bump to 80 if A/B testing shows a regression
-- on edge-case queries.
--
--     SET hnsw.ef_search = 40;
--
-- Apply per-session in `lib/ai/hybrid-retrieval.ts` if a custom
-- value is needed — pgvector >= 0.5 honors this on every connection.

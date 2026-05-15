-- Experimental /ask chat — pgvector schema.
--
-- Matches the vh-lab + shrek-lab schema verbatim where applicable;
-- the domain-specific metadata columns differ (those repos index
-- grant docs and Benchling notebooks; we index NDI datasets).
--
-- Apply once per Postgres instance:
--   psql $DATABASE_URL -f apps/web/lib/ai/db/schema.sql
--
-- Idempotent — re-running is a no-op.

CREATE EXTENSION IF NOT EXISTS vector;

-- rag_versions: tracks staged → production index swaps.
-- The ingest script writes new rows to `chunks_staging` under a
-- new rag_version_id, validates row count, then atomically
-- swaps `chunks` and `chunks_staging` in a single transaction.
-- Pattern mirrors `vh-lab-chatbot/ingest/upload.py::promote_staging_to_production_sync`.
CREATE TABLE IF NOT EXISTS rag_versions (
    id           SERIAL PRIMARY KEY,
    label        VARCHAR(120) NOT NULL,
    status       VARCHAR(40)  NOT NULL DEFAULT 'staging',
    -- One of: 'staging' | 'production' | 'retired'.
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    promoted_at  TIMESTAMP,
    notes        TEXT
);

-- Production table — what the runtime tool reads.
CREATE TABLE IF NOT EXISTS chunks (
    id              SERIAL PRIMARY KEY,
    -- The NDI dataset ID — same value you'd pass to /api/datasets/:id.
    doc_id          VARCHAR(255) NOT NULL,
    -- Catalog name, kept for fast lookup without re-parsing content.
    doc_title       VARCHAR(500),
    -- The string that was embedded — catalog fields + curated sidecar.
    content         TEXT         NOT NULL,
    -- Voyage voyage-4-large @ 1024d.
    embedding       vector(1024),
    -- BM25 / fulltext search lane. Generated column derived from
    -- content. English analyzer matches vh-lab + shrek-lab.
    search_vector   tsvector     GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    -- Version pointer for staged rollouts.
    rag_version_id  INTEGER      REFERENCES rag_versions(id),
    -- Loose JSON for filterable metadata (species, brainRegions,
    -- license, hasSidecar, etc.). Mirrors the curated-sidecar pattern
    -- without pre-extracted columns — at our scale (~500 datasets) the
    -- filtering economics don't justify breaking out columns.
    metadata        JSONB        DEFAULT '{}',
    created_at      TIMESTAMP    DEFAULT NOW()
);

-- Staging mirror, swapped atomically at promote-time.
CREATE TABLE IF NOT EXISTS chunks_staging (
    LIKE chunks INCLUDING ALL
);

-- Vector index. HNSW with cosine ops (Stream 4.10, 2026-05-15 — was
-- IVFFlat lists=100 prior). HNSW gives sub-millisecond query latency
-- at our corpus size (~500 chunks today, headroom to ~50K before
-- tuning matters) versus ~30-80ms with IVFFlat.
--
-- Runtime `ef_search` defaults to 40 (HNSW's "how hard to search"
-- knob). Bumping per-session is fine — see the migration script at
-- `migrations/2026-05-15-hnsw.sql` for the runtime tuning notes.
--
-- Build params (m=16, ef_construction=64) are pgvector's defaults
-- and well-suited to our embedding count + dimension.
DROP INDEX IF EXISTS idx_chunks_embedding;
CREATE INDEX idx_chunks_embedding
    ON chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

DROP INDEX IF EXISTS idx_chunks_staging_embedding;
CREATE INDEX idx_chunks_staging_embedding
    ON chunks_staging USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- BM25 / fulltext index over the generated tsvector column.
CREATE INDEX IF NOT EXISTS idx_chunks_search_vector
    ON chunks USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_chunks_staging_search_vector
    ON chunks_staging USING gin (search_vector);

-- Lookup helpers.
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id          ON chunks (doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_rag_version_id  ON chunks (rag_version_id);

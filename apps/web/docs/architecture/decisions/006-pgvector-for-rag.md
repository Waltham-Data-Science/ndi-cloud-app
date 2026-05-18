# ADR-006 — pgvector (Railway-hosted Postgres) for RAG

**Status:** Accepted
**Date:** 2026-05-15

## Context

The `/ask` chat needs semantic search over dataset metadata + curated
sidecar fields (highlights, methods, PI context). The vh-lab and
shrek-lab chatbots use the same pattern. The shape needed:

- Embed each "chunk" (dataset row × curated sidecar) with Voyage
  `voyage-4-large` (1024d).
- Hybrid retrieval: top-20 vector (cosine `<=>`) + top-20 BM25
  (Postgres tsvector). RRF-merge (k=60).
- Cross-encoder rerank with Voyage `rerank-2.5`.
- Return top-K (default 5, max 10) chunks with their text + metadata.

We had three reasonable choices for the vector store:

1. **pgvector on Railway Postgres** (same Postgres that the FastAPI
   proxy uses for rate-limit counters).
2. **Pinecone** (managed vector DB, dedicated).
3. **Weaviate / Qdrant** (self-hostable, dedicated vector DB).

## Decision

Use **pgvector on the existing Railway Postgres**. Same connection
string (`DATABASE_URL`) the rest of the FastAPI proxy uses.

Schema lives in `apps/web/lib/ai/db/schema.sql` (or its equivalent —
the experimental Railway env runs the bake job via `pnpm
build-ask-index`). Hybrid retrieval implementation lives in
`apps/web/lib/ai/hybrid-retrieval.ts`.

Index type: IVFFlat today; HNSW migration is Stream 4.10 work
(better recall at the same query latency).

## Rationale

1. **One database, fewer secrets.** We already have a Postgres
   connection on Railway. Adding pgvector means one fewer credential to
   rotate, one fewer service to monitor, one fewer place to keep up to
   date on security patches.

2. **Hybrid retrieval is a JOIN.** BM25 lives natively in Postgres as
   `tsvector` + `plainto_tsquery`. Doing the BM25 + vector lanes in a
   single SQL query (with RRF as a CTE-and-window-function pattern)
   eliminates the cross-DB orchestration that would otherwise require
   our own Reciprocal Rank Fusion implementation in TypeScript.

3. **Cost.** Pinecone's pricing model starts meaningful at ~50k vectors.
   We have ~500 chunks (one per dataset × 1-3 sidecar fields). Pinecone
   would be paying for capacity we don't use; pgvector on existing
   Railway Postgres is effectively free at this scale.

4. **Operational maturity.** Postgres + pgvector is well-understood;
   the failure modes are familiar. Pinecone's failure modes (sudden
   index rebuilds, region failovers) introduce ops surface we'd rather
   not own.

5. **Atomic promote.** The pgvector index can be rebuilt to a new table,
   tested against the new dataset list, then renamed atomically. No
   downtime, no "index rebuilding" state visible to users.

## Consequences

**Positive:**
- Single DB to rotate credentials for, single DB to back up.
- BM25 + vector hybrid retrieval expresses as one SQL statement.
- Atomic promote (rename) for index rebuilds — zero downtime.

**Negative:**
- IVFFlat (current index type) has worse recall than HNSW at the same
  query latency. Stream 4.10 migrates to HNSW.
- pgvector's `<=>` (cosine) is computed unindexed below a list
  threshold; for ~500 vectors this is fine, but if we ever grow to
  >10k vectors we'd need an explicit index plan review.
- Loss of the Railway Postgres means loss of the RAG index AND the
  rate-limit counters AND the (future) `chat_usage_events`. Per
  ADR-001's "Railway not BAA-capable" caveat, a covered-entity
  onboarding would migrate this Postgres to AWS RDS with pgvector
  installed.

## Alternatives considered

**(a) Pinecone**: rejected per §3 (cost) and §4 (ops).

**(b) Weaviate / Qdrant self-hosted**: rejected — would add a second
data store to the operational surface for no scale gain.

**(c) In-memory embedding (load all 500 vectors at startup, search in
TypeScript)**: rejected. Works for current scale but doesn't scale
beyond ~10k chunks, and the BM25 lane would need its own implementation.

## Verification

Replay harness at `apps/web/tests/replay/` exercises the full
embed-rerank pipeline against canonical queries. Quality regressions
surface as score drift.

## Related

- ADR-001 (heart on Railway)
- ADR-007 (Vercel KV for rate limiting / cost tracking, NOT for RAG)
- Stream 4.10 in master plan — IVFFlat → HNSW migration

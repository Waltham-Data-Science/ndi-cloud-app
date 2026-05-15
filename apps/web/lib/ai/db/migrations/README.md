# /ask RAG store — Postgres migrations

This directory holds idempotent SQL migrations for the experimental
`/ask` chat's pgvector store. Apply order: numeric (date) prefix.

## How to apply

Against the **experimental** Railway env (matches our
`feat/experimental-ask-chat` branch):

```bash
psql "$EXPERIMENTAL_DATABASE_URL" -f apps/web/lib/ai/db/migrations/<file>.sql
```

Once the change is verified against experimental traffic, apply to
production via the same one-shot command against the production
Postgres URL. All migrations in this directory are idempotent —
re-running is safe.

The canonical schema in `apps/web/lib/ai/db/schema.sql` always
reflects the latest expected shape. Fresh bootstraps run `schema.sql`
only; migrations are for in-place upgrades.

## Migrations

| File | Description |
|---|---|
| `2026-05-15-hnsw.sql` | Stream 4.10. Swap `idx_chunks_embedding` and `idx_chunks_staging_embedding` from IVFFlat (lists=100) to HNSW (m=16, ef_construction=64). Drops semantic-search latency ~30-80ms → ~5-15ms at current corpus size. Idempotent. |

## Operational notes

- **Verifying the latency win:** after the migration runs, fire the
  same `semantic_search_datasets` probes via `/api/ask` and compare
  the `pipeline.stage = 'hybridSearch'` durations in the Vercel
  function logs against the IVFFlat baseline.
- **Rollback:** the migration's docstring documents the IVFFlat
  rollback block. The runtime code (`hybrid-retrieval.ts`) is
  index-type-agnostic.
- **Future migrations:** when the corpus grows beyond ~50K chunks,
  revisit `m` (currently 16) — higher values give better recall at
  the cost of build time + memory.

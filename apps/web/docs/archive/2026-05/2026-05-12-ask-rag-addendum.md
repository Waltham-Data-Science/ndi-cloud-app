# Experimental "Ask" Chat — RAG Layer Addendum

**Date:** 2026-05-12
**Status:** Shipped on `feat/experimental-ask-chat` (PR #160).
**Parent spec:** `apps/web/docs/specs/2026-05-11-experimental-ask-chat-design.md`

## Why this addendum

The original Ask spec called out RAG as explicitly out of scope for the MVP, with tool-calling as the chosen approach. Two pivots happened during preview review:

1. Audri asked for a manual-refresh RAG layer.
2. After a first shipped pass that used flat-JSON + pure cosine, Audri pushed back: **"We need all those components for it to perform as expected. We should use the same architecture as we did for the two working chatbots."**

This addendum documents the final shipped architecture, which **matches `vh-lab-chatbot` and `shrek-lab-chatbot` verbatim** in every component that affects retrieval quality: Postgres + pgvector storage, hybrid vector+BM25 retrieval with Reciprocal Rank Fusion, and Voyage rerank-2.5 cross-encoder reranking.

## Final architecture

```
Build time (manual, ~30s for ~500 datasets)
─────────────────────────────────────────
  FastAPI catalog ─→ enrich w/ /summary ─→ compose doc strings
                                           (catalog fields + sidecar)
                                                  │
                                                  ▼
                            Voyage embed (voyage-4-large, input_type=document)
                                                  │
                                                  ▼
                          INSERT into chunks_staging (under new rag_version)
                                                  │
                                                  ▼
                              Atomic promote: TRUNCATE chunks + copy + REINDEX
                                                  │
                                                  ▼
                                Production index live, prior version retired

Runtime per chat message (Node serverless ~2-3s end-to-end)
─────────────────────────────────────────────────────────
  User question
        │
        ▼
  Claude routes to semantic_search_datasets (or to a structured tool — see
                                              system-prompt.ts heuristics)
        │
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Stage 1: Voyage embed query (input_type=query, 1024d)   │  ~500-800ms
  └─────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Stage 2: Hybrid retrieval (parallel)                    │  ~50-150ms
  │   • Vector lane: top-20 via embedding <=> (cosine)      │
  │     SET LOCAL ivfflat.probes = 10 for recall            │
  │   • BM25 lane:   top-20 via ts_rank + plainto_tsquery   │
  └─────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Stage 3: Reciprocal Rank Fusion (k=60)                  │  ~1ms
  │   merged + deduped candidate pool (~25-35 unique chunks)│
  └─────────────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Stage 4: Voyage rerank-2.5 (cross-encoder)              │  ~500-800ms
  │   takes all candidates, returns top-K (default 5) with  │
  │   per-document relevance scores                         │
  └─────────────────────────────────────────────────────────┘
        │
        ▼
  Top-K chunks returned to Claude as the tool result;
  Claude composes the answer + streams it back.
```

All four stages match vh-lab/shrek-lab's retrieval.py + rerank.py byte-for-byte in algorithm, parameter values, and order. The only difference is the runtime language (TypeScript vs Python), and the calls go to Postgres via `pg` + Voyage via REST instead of asyncpg + the Voyage Python SDK.

## File map

```
apps/web/
  lib/ai/
    dataset-metadata.json       # hand-curated sidecar (committed)
    hybrid-retrieval.ts         # vector + BM25 + RRF
    voyage-client.ts            # embedQuery() + rerank()
    tools.ts                    # semantic_search_datasets uses the full pipeline
    system-prompt.ts            # tool-selection heuristics
    db/
      pool.ts                   # singleton pg.Pool (max=3 to avoid Railway connection exhaustion)
      schema.sql                # CREATE TABLE chunks, chunks_staging, rag_versions
  scripts/
    build-ask-index.mjs         # one-shot ingest into Postgres w/ staged-promote
  app/api/ask/route.ts          # runtime: 'nodejs' (pg + large index ⇒ Node, not edge)
```

## Setup (one-time, ~5 minutes)

1. **Provision Railway Postgres**
   - https://railway.com → existing project (or a new one) → **+ Add** → **Database** → **PostgreSQL**
   - Wait ~30s for it to spin up.
   - **Variables** tab → copy `DATABASE_URL` value.

2. **Apply schema**
   ```bash
   psql "$DATABASE_URL" -f apps/web/lib/ai/db/schema.sql
   ```
   This creates `chunks`, `chunks_staging`, `rag_versions` tables, the IVFFlat vector index (lists=100), the GIN tsvector index, and enables the `vector` extension. Idempotent — safe to re-run.

3. **Set env vars on Vercel Preview**
   - `DATABASE_URL` = the connection string from Railway (Preview scope)
   - `VOYAGE_API_KEY` = the same key used by vh-lab/shrek-lab (Preview scope)
   - `ANTHROPIC_API_KEY` (already set if you've been using the chat)
   - `NEXT_PUBLIC_ASK_ENABLED=1` (already set if the nav tab is visible)

4. **Ingest the catalog**
   ```bash
   export DATABASE_URL=<from step 1>
   export VOYAGE_API_KEY=<your voyage key>
   pnpm --filter @ndi-cloud/web build-ask-index
   ```
   This runs:
   - Paginate `/api/datasets/published` (~few seconds)
   - Fetch `/summary` for each (~30-60s)
   - Compose docs with the sidecar (instant)
   - Batch-embed via Voyage (~30s)
   - Open staging version, bulk-insert, promote atomically (~5s)
   Total: ~2 minutes for ~500 datasets, ~$0.02 of Voyage credits.

5. **Redeploy Vercel preview** so the new env vars bake in.

That's it. Subsequent re-runs (after dataset publishes or sidecar edits) only need step 4, then push to redeploy.

## Editing the sidecar

`lib/ai/dataset-metadata.json` is the lever that makes the RAG demo-quality. Add:

```json
{
  "<real-dataset-id>": {
    "displayName": "Bhar tree shrew V1/V2",
    "highlights": ["Awake-behaving silicon-probe recordings", "..."],
    "keywords": ["tree shrew", "Tupaia", "primate-like vision"],
    "notableMethods": ["chronic silicon probes", "head-fixed visual stimulation"],
    "piContext": "Krishna Bhar — visual cortex, alternative-model species"
  }
}
```

Each field is optional. After editing, re-run `pnpm build-ask-index` and push. The new chunks pick up the sidecar additions; the embedding now reflects the curated highlights so semantic queries like "primate-like vision" land on this dataset.

## Where this matches vh-lab/shrek-lab — and where it doesn't

| Component | vh-lab/shrek-lab | This chatbot | Identical? |
|---|---|---|---|
| Embedding model | voyage-4-large, 1024d | voyage-4-large, 1024d | ✅ |
| Vector index | IVFFlat cosine, lists=100 | IVFFlat cosine, lists=100 | ✅ |
| Query-time probes | `SET ivfflat.probes = 10` | `SET LOCAL ivfflat.probes = 10` | ✅ |
| BM25 lane | tsvector + plainto_tsquery + ts_rank | tsvector + plainto_tsquery + ts_rank | ✅ |
| Combine method | Reciprocal Rank Fusion k=60 | Reciprocal Rank Fusion k=60 | ✅ |
| Candidates per lane | 15-20 | 20 | ✅ (within range) |
| Reranker | Voyage rerank-2.5 | Voyage rerank-2.5 | ✅ |
| Staged ingest | staging → atomic promote | staging → atomic promote | ✅ |
| Storage | Railway Postgres + pgvector | Railway Postgres + pgvector | ✅ |
| Chunking | section-aware (PDFs) | one chunk per dataset | ✖ — domain difference |
| Source docs | PDFs / Benchling | structured catalog API | ✖ — domain difference |
| Query analysis | filter-aware preprocessing | not implemented yet | ✖ — possible follow-up |

The chunking + query-analysis differences fall out of the source-data shape (NDI datasets are structured metadata, not free-text grant PDFs). Every retrieval-quality component is preserved.

## Failure modes

| Failure | UX | Why this is fine |
|---|---|---|
| `DATABASE_URL` unset | Tool returns `{error: 'DATABASE_URL not configured'}`; Claude falls back to keyword search | System prompt teaches fallback |
| `VOYAGE_API_KEY` unset | Same — typed error → fallback | Same |
| Postgres unreachable | Tool returns `{error: 'Retrieval failed: ...'}`; fallback | Same |
| Voyage embedding fails | Tool returns `{error: 'Embedding failed: ...'}`; fallback | Same |
| Voyage rerank fails | **Soft-degrades to RRF-only ranking** — returns top-K from RRF without rerank scores | User still gets relevant results; vh-lab does this too |
| Index empty (script never ran) | `hybridSearch` returns `[]`; tool returns `{results: [], ...}`; Claude tries another tool | Predictable empty-state behavior |
| Sidecar JSON malformed | Build script errors at parse time; old index stays in place | Atomic promote — no half-written state |
| Build script fails mid-run | Staging version stays, prior production still serves | Failure is non-blocking for serving |

The chat **never breaks** because RAG is unavailable. Worst case, semantic queries degrade to keyword search.

## Cost

- **Build time** (full reindex of 500 datasets):
  - Voyage embed: ~150K tokens × $0.12/M = **~$0.02**
  - Postgres bytes: ~3 MB at Railway = negligible
- **Per query** (steady state demo):
  - Voyage embed query: ~10 tokens × $0.12/M = $0.000001
  - Voyage rerank (~30 candidates × ~300 tokens each): ~10K tokens × $0.05/M = **~$0.0005**
  - Postgres reads: included in Railway tier
  - Claude completion: ~$0.005
  - **Total per turn: ~$0.006**
- **Monthly estimate** at light demo use (~100 queries/day):
  - Embed + rerank: ~$1.50/month
  - Claude: ~$15/month (bounded)
  - Postgres: free tier covers it
  - **Sub-$20/month total**

## Why we couldn't host on edge runtime

The old flat-JSON approach was edge-compatible. The Postgres-backed approach uses `pg` (Node-only socket access) and so `/api/ask` runs on Node runtime. Cold-start cost goes from ~50ms to ~300ms, which is invisible behind the ~1s Voyage embedding call anyway. Streaming still works identically through the AI SDK.

## Operational notes

- **Backups**: rely on Railway's Postgres backups (daily by default at the free tier). If a sidecar edit goes wrong, restore from yesterday — sidecar lives in git so it's recoverable independently.
- **Versioned rollouts**: `rag_versions` table tracks every reindex. If a build promotes a bad index, manually run the promote against an older `id` to roll back.
- **Connection limits**: Railway free Postgres has a low connection ceiling (~20 conns). The runtime pool is capped at `max=3` per serverless container; at typical concurrency this fits.
- **Multi-region**: not addressed yet. The chatbot's edge function would be globally distributed if we hadn't switched to Node; with Node it runs in a single Vercel region. Latency from anywhere in NA is fine for demo cadence.

## Open questions (none blocking)

- **Live reindex on dataset publish**: currently manual. Easy to add a `/api/admin/reindex` route gated by a shared secret, called from Cloud's "publish dataset" hook. Punted until we know if Shrek bites.
- **Hybrid retrieval relevance tuning**: vh-lab does query-aware filter relaxation (section filters, year filters, etc.). Not implemented here because our metadata doesn't have those axes. If we see specific bad results from the demo, we can add a similar layer.
- **Reranker pricing**: rerank-2.5 is the most expensive Voyage tier. If cost explodes, downgrade to rerank-lite-1 (10× cheaper, slightly worse precision). Currently rerank-2.5 because that's what vh-lab/shrek-lab use.

---

**End of addendum.**

# Experimental "Ask" Chat — RAG Layer Addendum

**Date:** 2026-05-12
**Status:** Shipped on `feat/experimental-ask-chat` (PR #160).
**Parent spec:** `apps/web/docs/specs/2026-05-11-experimental-ask-chat-design.md`

## Why this addendum

The original Ask spec called out RAG as **explicitly out of scope** for the MVP, with tool-calling as the chosen approach. After the first preview review, Audri asked to add a manual-refresh RAG layer that mirrors the vh-lab + shrek-lab chatbots' design — specifically their **three-tier metadata pattern**: hand-curated sidecar JSON + chunk-level fields + extracted searchable columns.

This addendum documents what was added, what was deliberately *not* adopted from the reference chatbots (and why), and the refresh workflow.

## What changed vs. the original spec

| Original spec said | What actually shipped |
|---|---|
| Tool-calling only, no RAG | Tool-calling + **one additional RAG tool** (`semantic_search_datasets`) |
| 5 tools | 6 tools |
| Edge runtime for `/api/ask` | Node runtime for `/api/ask` (large index import) |
| No new external service dependency for AI | Voyage AI (one new API key — same one vh-lab/shrek-lab use) |
| `~/Documents/ndi-projects/vh-lab-chatbot` not referenced | Pattern source for the metadata sidecar design |

Everything else from the original spec is unchanged: anonymous-only, public-data-only, two-flag gate, no DB, no auth changes, branch-only deployment.

## Reference chatbots: what we copied, what we didn't

Source: `/Users/audribhowmick/Documents/ndi-projects/vh-lab-chatbot/` and `/Users/audribhowmick/Documents/ndi-projects/shrek-lab-chatbot/`.

**Copied verbatim:**

- **Voyage AI provider + voyage-4-large model** (`voyageai` SDK at build time, REST API at runtime). Matches `vh-lab-chatbot/ingest/embed.py:17-18`.
- **`input_type='document'` vs `'query'` distinction** for build-time vs runtime embedding (voyage convention).
- **`grant_metadata.json` → `dataset-metadata.json` pattern**: hand-curated JSON sidecar with keys = source-doc IDs, values = enrichment fields. The semantic equivalent of vh-lab's curated grant frontmatter.
- **Curated metadata wins over auto-extracted** when both are present — `composeDocument()` in `scripts/build-ask-index.mjs` mirrors `parse.py::_apply_curated_metadata_to_gemini_doc()` in spirit.

**Adapted with smaller surface:**

- **Storage: flat JSON on disk** instead of Postgres + pgvector. At ~500 datasets × 1024d the whole index is ~3 MB raw / ~1 MB gzipped. Fits in a serverless function's memory; cosine over 500 entries is sub-millisecond. The reference chatbots use pgvector because they index *thousands* of grant document chunks; we don't.
- **Chunking: one chunk per dataset** instead of section-aware chunking. Each dataset is already structured metadata (name + description + facets), not free text needing semantic boundaries.
- **Single retrieval: cosine top-K** instead of hybrid BM25 + vector + reciprocal rank fusion. At this scale and demo-quality bar, hybrid retrieval is YAGNI. The system-prompt routing handles the keyword-vs-concept choice at the tool-selection layer instead.
- **No reranker** (vs. voyage rerank-2.5 in vh-lab). Same reasoning — adds infra without a clear win at 500 entries.

**Not adopted (and why):**

- **Reranking step**: would marginally improve top-1 quality but adds another API call (cost + latency).
- **Metadata-based filtering at retrieval time** (vh-lab does this for "exclude Biography sections in scientific queries"). Our dataset metadata doesn't have this kind of structural distinction.
- **Live ingest pipeline** (webhook on dataset publish → reindex). User explicitly asked for manual-refresh.
- **PDF parsing pipeline**: irrelevant — we have structured catalog data, not free-text source documents.

## File map

```
apps/web/
  lib/ai/
    dataset-metadata.json       # ← THE CURATED SIDECAR (edit by hand)
    dataset-index.json          # ← generated; commit after running build script
    index-loader.ts             # loads index, cosine, top-K
    voyage-client.ts            # query-time embedding (REST)
    tools.ts                    # semantic_search_datasets tool def
    system-prompt.ts            # updated tool-selection rules
  scripts/
    build-ask-index.mjs         # ONE-SHOT INDEX BUILDER (run manually)
  app/api/ask/route.ts          # runtime: 'nodejs' (changed from 'edge')
```

## How an answer flows now

A user asks "tell me about studies using primate-like vision":

1. Claude reads the question. System prompt tells it: this is a CONCEPT (not a literal substring), prefer `semantic_search_datasets`.
2. Claude emits `tool_use: semantic_search_datasets({query: "primate-like vision"})`.
3. AI SDK invokes the handler:
   - Embed the query string via Voyage REST API → 1024-d Float32Array (~600ms warm, ~1s cold).
   - Cosine-rank against ~500 pre-baked vectors in memory → top-5 (~0.5ms).
   - Return chunks with metadata.
4. Each returned chunk contains the catalog metadata + the curated highlights/keywords/methods from the sidecar. If the Bhar tree shrew entry has `"keywords": ["primate-like vision", "tree shrew"]` in the sidecar, it embeds with those signals and ranks high here.
5. Claude composes the answer using the returned chunks, references dataset IDs verbatim so the UI auto-links them.

Total round-trip: ~2-3s end-to-end including streaming first tokens. Compared to the pre-RAG flow that would have done `list_published_datasets({query: "primate-like vision"})` and gotten zero matches (no literal substring), this is a meaningful UX upgrade for fuzzy queries.

## How to refresh the index

```bash
# Required:
export VOYAGE_API_KEY=<your-voyage-key>

# Optional — defaults to production Railway:
export UPSTREAM_API_URL=https://ndb-v2-production.up.railway.app

# Run from anywhere:
pnpm --filter @ndi-cloud/web build-ask-index
```

The script:
1. Paginates the public catalog endpoint
2. Enriches each dataset with its `/summary` endpoint
3. Reads `lib/ai/dataset-metadata.json` for curated fields
4. Composes a document string per dataset
5. Batch-embeds via Voyage (32 inputs per request, ~30s for ~500 datasets)
6. Writes `lib/ai/dataset-index.json` (~3 MB)

Commit the regenerated index + push:
```bash
git add apps/web/lib/ai/dataset-index.json apps/web/lib/ai/dataset-metadata.json
git commit -m "chore(ask): refresh dataset index (N datasets)"
git push
```

Vercel auto-redeploys with the fresh index. No env changes needed; no DB migration; no downtime.

## Editing the sidecar

`lib/ai/dataset-metadata.json` is the place to add facts the catalog API doesn't expose. Example:

```json
{
  "abc123def456": {
    "highlights": [
      "Novel two-photon awake-behaving paradigm",
      "Only published dataset with simultaneous V1+V2 recordings"
    ],
    "keywords": ["awake behaving", "two-photon", "V1", "V2", "extrastriate cortex"],
    "notableMethods": ["calcium imaging", "head-fixed", "drifting gratings"],
    "piContext": "Jane Doe — vision, awake behaving, two-photon imaging pioneer"
  }
}
```

Each field is optional. After editing, re-run `pnpm build-ask-index` so the new content makes it into the embedded chunks. The build script merges the sidecar into the document string using labeled sections (`Highlights:`, `Methods:`, `Search keywords:`, `PI context:`) so the model can interpret them.

## Failure modes (new)

| Failure | UX |
|---|---|
| Sidecar JSON malformed | Build script errors out at parse time. Fix JSON → rerun. |
| Voyage API down at build time | Build script errors out with HTTP status. Try again, or use a different time window. |
| Voyage API down at runtime | `semantic_search_datasets` returns `{ error: 'Voyage returned ...' }`; Claude falls back to `list_published_datasets` per system prompt. |
| `VOYAGE_API_KEY` unset on Vercel | `semantic_search_datasets` returns `{ error: 'VOYAGE_API_KEY not configured' }`; Claude falls back to keyword search. |
| Index is empty (build script never ran) | `semantic_search_datasets` returns `{ error: 'Semantic search index is empty' }`; Claude falls back. |
| Index dim mismatch (build vs runtime model drift) | `semantic_search_datasets` returns typed error; user is told to rebuild. |

In ALL failure cases, the chat still works — Claude just answers without semantic search. There's no scenario where the chat breaks because RAG is unavailable.

## Cost (updated)

Per dataset, build-time:
- Voyage embedding: ~$0.12 per 1M tokens for voyage-4-large.
- 500 datasets × ~300 tokens each = 150K tokens = **~$0.02** per full rebuild.

Per query, runtime:
- Voyage embedding: ~10 tokens × 1 call = trivial fraction of a cent.
- Claude completion: same as before (~$0.005/turn).

Per-month estimate (assuming Audri + you + me + Shrek's team poking + light demo use): **under $10/month** for Voyage and Anthropic combined. The exposure is bounded by Anthropic anyway — Voyage costs are negligible.

## Open questions (none blocking)

- Should we periodically auto-rebuild the index on a Vercel cron? Currently manual per Audri's preference. Reasonable to add later.
- If the catalog grows past ~5,000 datasets, would we still want flat JSON? Probably not — at that scale we'd want pgvector or Vercel KV Vector. The `index-loader.ts` API would stay the same; only the loader internals change.
- Hybrid BM25 retrieval was deliberately omitted. If semantic-only retrieval misses obvious keyword matches in practice (e.g., a user types a dataset ID and we should return it instantly), we could add a "cheap keyword pre-filter" in the tool handler.

---

**End of addendum.**

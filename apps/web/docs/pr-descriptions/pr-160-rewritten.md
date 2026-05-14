# [DO NOT MERGE — experimental] Ask chat for NDI Commons (scope expanded — see below)

## Status

**DRAFT — DO NOT MERGE — experimental.**

Original scope (Days 1-4: 5 catalog tools, ephemeral conversation, edge streaming) has expanded dramatically since this PR opened. This rewrite reflects the current branch state at `feat/experimental-ask-chat` HEAD (`43cf7d0`).

- Triple-protected: explicit DO-NOT-MERGE in title + draft state + Audri sign-off gate.
- Feature-flagged anonymous-only (`ANTHROPIC_API_KEY` + `NEXT_PUBLIC_ASK_ENABLED`).
- Routes server-side tool calls to the **experimental** Railway env (`ndb-v2-experimental.up.railway.app`) — production Railway is untouched.
- Active checkpoint: `apps/web/docs/specs/2026-05-14-ask-checkpoint-plan-c-pivot.md`.

## What this PR adds

### Chat tools (12 in the registry)

Backed by either existing FastAPI public endpoints or — for the structured-query / aggregation paths — new endpoints on the **experimental** Railway env only. Every tool returns a `references[]` array; the LLM renders inline `[^N]` footnotes that the UI surfaces as clickable citation chips.

1. `list_published_datasets` — paginated catalog listing.
2. `get_dataset` — single dataset record.
3. `get_dataset_summary` — compact summary projection.
4. `get_dataset_class_counts` — per-class document counts.
5. `get_facets` — top-level catalog aggregations.
6. `semantic_search_datasets` — full RAG pipeline (Voyage embed → pgvector + BM25 hybrid retrieval → RRF fusion → Voyage rerank-2.5).
7. `query_documents` — table of NDI documents of a given class within one dataset.
8. `walk_provenance` — depends_on graph walk (1-6 hops), nodes + edges.
9. `fetch_signal` — downsampled timeseries from a binary NDI document (renders inline via the `signal-chart` fence).
10. `lookup_ontology` — CURIE resolution (UBERON / CL / NCBITaxon via OLS, NDI-python fallback for lab-specific prefixes).
11. `aggregate_documents` — server-side mean/median/std/min/max/count with optional `groupBy`. Deterministic stats — LLMs drift on long arithmetic.
12. `ndi_query` — full NDI Query DSL (16 operations + `~` negation) across `scope="public"` or a CSV of dataset IDs.
13. `tabular_query` — ontologyTableRow aggregation for violin/jitter plots (per-group summary + raw values; renders inline via the `violin-chart` fence).

### Chart components (2 inline-rendered)

- `components/charts/PlotlyMount.tsx` — custom React 19 Plotly wrapper around `plotly.js-cartesian-dist-min` (446 KB gz, lazy-loaded only when a chart fence is rendered).
- `components/charts/ViolinChart.tsx` — per-group violin + jitter overlay, the template for future chart types (image overlay, Gantt, multi-trace).
- `components/ai/SignalChart.tsx` — downsampled timeseries with channel selector + optional `[t0, t1]` window.

Additional chart components have been started but are not part of this PR's must-merge scope (see "Open questions").

### RAG pipeline

- `lib/ai/db/schema.sql` + `lib/ai/db/pool.ts` — pgvector schema (one row per dataset chunk; 1024d Voyage embeddings).
- `lib/ai/hybrid-retrieval.ts` — parallel vector + BM25 lanes, RRF (k=60) fusion, top-20 per lane.
- `lib/ai/voyage-client.ts` — REST client for Voyage embed + rerank-2.5 (no SDK; cuts ~2 MB from build).
- `scripts/build-ask-index.mjs` — build-time embedding generation; populates the table from `dataset-metadata.json` (the curated sidecar of highlights / methods / piContext / binarySignalExample for the 3 tutorial datasets + 5 generic public ones).

### Dependencies added

- `@ai-sdk/anthropic` `^2.0.79`, `@ai-sdk/react` `^2.0.188`, `ai` `^5.0.186` — Vercel AI SDK v5 (streaming + tool-call protocol).
- `plotly.js-cartesian-dist-min` `^3.5.1` + `@types/plotly.js` `^3.0.10` — chart partial, route-scoped.
- `pg` `^8.20.0` + `@types/pg` `^8.20.0` — Postgres + pgvector for RAG.
- `react-markdown` `^9.1.0` + `remark-gfm` `^4.0.1` — chat markdown rendering with fence interception.

### Tests added on this branch

- `tests/unit/ai/*` — 9 modules covering each tool handler, RAG layers (voyage, hybrid-retrieval, references), system-prompt, rate-limit, feature-flag.
- `tests/unit/components/ai/SignalChart.test.tsx`, marker tests for ChatThread / Markdown fence handling.
- `tests/unit/api/ask.test.ts` — route-level feature-flag + streaming behavior.
- `tests/e2e/ask.spec.ts` — flag-off smoke + flag-on guarded smoke.

### Shared marketing surface (touched, but minimally)

- `components/marketing/Header.tsx` — env-gated "Ask" tab inserted between Platform and About (renders only when `NEXT_PUBLIC_ASK_ENABLED=1`).
- `components/marketing/Footer.tsx` — mobile-viewport overflow fix (`min-w-0` + `break-words`) — not Ask-specific but landed on this branch.

## What this PR does NOT change

Every public surface remains byte-for-byte identical when `NEXT_PUBLIC_ASK_ENABLED` is unset (production state):

- `/` (home), `/about`, `/platform`, `/security`, `/products` marketing pages
- `/datasets` catalog landing + filters
- `/datasets/[id]/*` dataset overview, summary tables, document explorer, document detail, tutorial tabs
- Auth flows (`/login`, `/create-account`, `/forgot-password`, `/account-verification`, etc.)
- Edge proxy (CSP, Origin allowlist, Vary headers)

Visual diff evidence: `audit/exp-*.png` vs `audit/prod-*.png` (8 page pairs) — identical to the pixel except for the env-gated "Ask" tab in the header.

## Audit evidence

- **API audit (byte-for-byte)** — 0 regressions. Harness lives at `audit/` (committed earlier on this branch in `a66bb50`). Replays a fixed catalog probe against production + the experimental Railway env and diffs the JSON. All `/api/datasets/*` responses identical.
- **UI code diff** — 0 bytes of changed code in `components/app/` (the dataset-detail tree) or `app/(app)/*`. All net-new code lives in:
  - `app/(marketing)/ask/*` (new)
  - `app/api/ask/route.ts` (new)
  - `components/ai/*` (new)
  - `components/charts/*` (new)
  - `lib/ai/*` (new)
  - Plus the 2 small touches in `components/marketing/Header.tsx` (env-gated nav tab) and `components/marketing/Footer.tsx` (orthogonal mobile fix).
- **Bundle ratchet** — +0.22 KB gz on the marketing shared chunk (Header gains one conditional `<Link>` for the Ask tab). All Ask-route deps are route-scoped — Plotly + AI SDK + react-markdown do not leak into the shared chunk.
- **Visual diff** — 8 page pairs in `audit/` (home, datasets list, dataset overview, summary tables, document explorer, doc explorer, tables ontology, tutorial). All identical pre/post.

## Open questions

Deferred items that need their own decisions before this PR is merge-ready:

1. **Cloud-backed `ndi.dataset.Dataset` binding (Sprint 1.5)** — discovered mid-flight that cloud-node already exposes `POST /ndiquery` and ndb-v2 already proxies it via `POST /api/query` with auto-pagination to 50k docs. So 80% of the "NDI-python depth" gap closed without new integration. The remaining 20% (epoch math, time alignment, spike-rate calc) requires `downloadDataset` + persistent volume — defer to Sprint 1.5 if smoke testing reveals a gap.
2. **Additional chart types** — ImageChart, ImageOverlayChart, GanttChart, MultiTraceChart (multi-channel SignalChart) are partially started on this branch (`MultiTraceChart.tsx`, `GanttChart.tsx` in working tree). Stub state — decide whether to land in this PR or split.
3. **Conversation persistence** — `lib/ai/conversation-store.ts` exists locally (working tree). Currently ephemeral; deciding whether to add server-side persistence (would require a DB write surface — non-trivial under the "anonymous-only" gate).
4. **PR #112 (ndb-v2 backend)** — this PR is paired with `Waltham-Data-Science/ndi-data-browser-v2#112` which adds the `tabular_query` + `aggregate_documents` endpoints on the experimental Railway env. Both PRs must merge together OR neither merges. Coordinated landing TBD.

## How to test

### Smoke prompts (the working set)

Set `ANTHROPIC_API_KEY` + `NEXT_PUBLIC_ASK_ENABLED=1` on the Vercel preview env, then visit the preview's `/ask`:

1. *"How many published datasets are in the NDI Commons catalog?"* — single-tool list_published_datasets call, citation chip to the catalog.
2. *"Tell me about the Bhar tree-shrew dataset"* — semantic_search_datasets → get_dataset → cited dataset record.
3. *"Compare elevated plus maze open-arm north entries between Saline and CNO in the Dabrowska BNST dataset"* — semantic_search_datasets → tabular_query → emits a `violin-chart` fence → ViolinChart mounts inline. **This is the Plan C demo prompt.**
4. *"Show me a voltage trace from element_epoch in the Bhar dataset"* — query_documents → fetch_signal → emits a `signal-chart` fence → SignalChart mounts inline.
5. *"Look up UBERON:0001870"* — lookup_ontology → "frontal cortex" + definition + synonyms.

### Replay harness

`audit/` ships the byte-for-byte API audit harness. To re-run against the experimental Railway env:

```bash
cd audit
./replay.sh  # diffs experimental vs production for a fixed probe list
```

## Risk

Low.

- Chat is **anonymous-only** and feature-flagged off by default (`NEXT_PUBLIC_ASK_ENABLED` must be set explicitly).
- Server-side tool calls route to the **experimental** Railway env (`ndb-v2-experimental.up.railway.app`) via branch-aware `baseUrl()` in `lib/ai/tools.ts` + `lib/ai/tools/shared.ts`. Production Railway is untouched.
- Preview-only deployment — does not reach `ndi-cloud.com`.
- Rate-limited per IP (in-memory token bucket; resets on edge-instance recycle).
- No DB writes, no auth changes, no cookie changes, no CSP changes.
- Bundle ratchet under the gate (+0.22 KB on shared chunk).
- Branch deletes cleanly if the experiment doesn't pan out.

## Reference

- Latest checkpoint: `apps/web/docs/specs/2026-05-14-ask-checkpoint-plan-c-pivot.md`
- Archived earlier checkpoints + design docs: `apps/web/docs/archive/2026-05/`
- Paired backend PR: `Waltham-Data-Science/ndi-data-browser-v2#112` (also DO NOT MERGE)
- Visual audit screenshots: `audit/exp-*.png` and `audit/prod-*.png`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

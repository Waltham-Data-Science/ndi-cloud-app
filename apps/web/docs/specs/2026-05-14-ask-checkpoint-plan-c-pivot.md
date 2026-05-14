# Ask chat — Pre-compact checkpoint #2 (2026-05-14)

Written immediately before `/compact` so the post-compaction Claude (or you) can pick up cleanly. **This is the second checkpoint** — the first was `2026-05-13-ask-checkpoint-pre-compact.md` covering the initial Phase A / Days 1-4 work. Read this one first; reach for the older one only for backfill.

## TL;DR — Plan C just landed; we're at a strategic pivot

The day-of work:
1. **Adopted Plotly** as the unified chart library (cartesian partial, 446 KB gz lazy-loaded). Rejected reusing the legacy d3-SVG components in `components/app/` — they lack hover/responsive/a11y and are due for replacement (audri confirmed).
2. **Built the first chart end-to-end**: `ViolinChart` Plotly component + custom `PlotlyMount` React 19 wrapper + `tabular_query` chat tool + backend `/api/datasets/:id/tabular_query` endpoint. Verified live: Dabrowska EPM returns Saline (n=22, mean=5.86) + CNO (n=23, mean=5.09).
3. **Pinned NDI-python SHAs** in the Dockerfile (all 5 git deps) + added strict-boot check gated on `NDI_PYTHON_REQUIRED=1`. Kills the silent-drift risk.
4. **Routed server-side chat tools to experimental Railway** (branch-aware `baseUrl()` in `tools/shared.ts` + `tools.ts`, mirroring the `next.config.ts` rewrite override).
5. **Honest strategic audit**: out of ~25 realistic PI questions across the 3 demo datasets, the chat handles ~6 well, ~5 partially, and ~14 are blocked on missing chart types OR missing NDI-python depth. Decision: **Plan C — confirm violin works, then PIVOT to Sprint 1 (NDI-python depth) before more chart proliferation.**

The user agreed. They're smoke-testing the violin RIGHT NOW. **Post-compact priority #1: get the smoke-test result and act on it.**

## Post-compact additions (2026-05-14, same day, after the /compact)

Sprint 1 collapsed to a wiring exercise once we discovered cloud-node
already exposes `POST /ndiquery` (full Query DSL with `scope=public|all|
private|CSV-of-IDs`, injection-hardened) AND ndb-v2's `POST /api/query`
already proxies it with auto-pagination up to 50k docs. So the original
"build cloud-backed `ndi.dataset.Dataset` binding first" plan is on
ice — it's now Sprint 1.5, only built if smoke testing reveals a gap.

What shipped instead (both on `feat/experimental-ask-chat`):

| Commit | What |
|---|---|
| `e457042` | `aggregate_documents` chat tool — server-side mean/median/std/etc. with optional `groupBy`. 8 tests. |
| `b4b07de` | `ndi_query` chat tool — full NDI Query DSL (16 ops + ~negation, scope=public/CSV-of-IDs), compact per-doc projection (id + class + datasetId + label + data_preview ≤600B), 13 tests. |

Both tools route through the existing `/api/query` proxy, so NO backend
changes. Anonymous-only enforcement is at the chat-tool layer (private/
all scopes return a typed error before RTT).

**What this unlocks** (the 14-question PI audit blockers in the checkpoint
that were attributed to "missing NDI-python depth"):

- "Across all public datasets, count CRF+ subjects" → ndi_query(scope=public)
- "Compare strains in dataset A vs B" → ndi_query(scope=CSV)
- "Find docs depending on doc X across catalog" → ndi_query(depends_on)
- "Average input resistance across 215 subjects" → aggregate_documents
- "Subject weight by strain across the catalog" → aggregate_documents+groupBy
- Any multi-constraint within-dataset filter `query_documents` can't express

**Sprint 1 STATUS**: ~80% of the "depth" gap closed without writing any
NDI-python integration. The remaining 20% (epoch math, time alignment,
spike-rate calc) genuinely needs cloud-backed Dataset — defer to Sprint
1.5 if PI questions in smoke testing demand it.

Live preview at this commit: rebuilding from `e457042` on push.

## What's shipped (in both branches)

### ndb-v2 `feat/ndi-python-phase-a` (PR #112, draft, DO NOT MERGE)

| Commit | What |
|---|---|
| `83a9358` | groupBy substring matching (LLM doesn't need exact column key) |
| `3be7c96` | Prefer numeric column when multiple match (avoid picking ID columns) |
| `b6ac0a6` | First major commit: tabular_query endpoint, service, 21 tests, SHA pins, strict-boot, NDI_PYTHON_REQUIRED |
| (earlier) | Phase A: vlt VHSB + ndicompress + ndi.ontology fallback |

**Live at**: `https://ndb-v2-experimental.up.railway.app` (Railway experimental env, builds from this branch).

**562 unit tests pass, 1 pre-existing flake** (`test_pivot_service::test_subject_grain_happy_path` — `ExceptionGroup: multiple unraisable exception warnings` during teardown; same pattern that flaked PR #111 earlier; clears on rerun). My code is mypy + ruff + pytest clean.

### cloud-app `feat/experimental-ask-chat` (PR #160, draft, DO NOT MERGE)

| Commit | What |
|---|---|
| `71efab8` | Routing fix: server-side chat tool `baseUrl()` → experimental Railway on branch |
| `deb0a04` | First major commit: Plotly install + PlotlyMount + ViolinChart + tabular_query tool + violin-chart fence |
| (earlier) | bcce363 priority-flipped Vercel rewrite override; c8f3d66 branch-aware next.config |

**Live preview** at time of compact: `https://ndi-cloud-app-n8fnspxfo-ndi-cloud-a83eb4e7.vercel.app` (was building from `71efab8` push; check `vercel list` post-compact for newer).

Typecheck + lint clean.

## The smoke test that triggered the compact

User opened the Vercel preview, asked: *"Compare elevated plus maze open-arm north entries between Saline and CNO in the Dabrowska BNST dataset"*.

First attempt (before commit `71efab8`):
- `semantic_search_datasets` → found Dabrowska ✓
- `tabular_query` → **failed with "Network error contacting catalog service"**
- Chat fell through to `query_documents` exploration, got stuck

Diagnosis: chat tools call backend via `INTERNAL_API_URL` (server-side fetch), which on the Vercel preview is set to PRODUCTION Railway — production doesn't have the new `/tabular_query` endpoint → 404.

Fix landed in `71efab8` — both `baseUrl()` helpers (`tools.ts` + `tools/shared.ts`) now route to experimental Railway when `VERCEL_GIT_COMMIT_REF === 'feat/experimental-ask-chat'`. Identical pattern to the `next.config.ts` rewrite override (shipped earlier in `bcce363`).

**At compact time**: Vercel is rebuilding the preview with `71efab8`. User will re-test the same prompt. Expected:
1. `semantic_search_datasets` → finds Dabrowska
2. `tabular_query` → hits experimental Railway → returns 2 groups (Saline / CNO)
3. Chat emits ` ```violin-chart` fence → ViolinChart mounts → renders Plotly violin
4. Citation chip → source `ontologyTableRow` document

## The strategic audit — the part that matters most

Real PIs asking deep questions about these 3 datasets. **Of ~25 questions, we handle ~6 well today**. Most blockers fall into two categories:

### Missing chart types (Sprint 2 work — DEFERRED behind Sprint 1)
- ImageChart (Haley microscopy / fluorescence; Bhar microscopy)
- ImageOverlayChart (Haley trajectory over patch map)
- GanttChart (Bhar treatment timeline with xline events)
- Multi-trace + colorbar (Dabrowska I-V sweeps via extended `SignalChart`)
- Maybe spike raster / ISI histogram / scatter+regression

### Missing NDI-python depth (Sprint 1 — THE PIVOT)
We have a sliver of NDI-python: `vlt.file.vhsb_read`, `ndicompress.expand_*`, `ndi.ontology.lookup`. We DON'T have:
- `ndi.dataset.Dataset` with cloud-backed binding → foundation for everything else
- `dataset.database_search(Query(...))` → within-dataset structured queries (richer than REST `/tables/:className`)
- `ndi.query.Query` + `bulkFetch` → cross-dataset query (the killer "AI-readiness" demo)
- `ndi.element.epoch.*` → epoch math, time alignment, sync graph
- `vmspikesummary`, `tuningcurve_calc` calc pipelines → spike rates / ISI / tuning curves inline
- Document validation, aggregation across N subjects, etc.

Without those, deep questions like "are CRF+ neurons more excitable than CRF–?" or "average input resistance across 215 subjects" hit dead ends — exactly what happened in the smoke test before the routing fix.

## Sprint 1 plan (post-compact priority)

**Goal**: bring NDI-python to depth-of-vocabulary parity with what real PI questions need. ~1-2 weeks.

### Sprint 1 tasks

1. **Wire `ndi.dataset.Dataset` with cloud-backed binding** in ndb-v2.
   - Requires `ndi.cloud.orchestration.downloadDataset` against a Railway persistent volume.
   - Pre-warm the 3 demo datasets at boot (Option B-3 from the integration plan in `ndi-data-browser-v2/docs/plans/2026-05-13-ndi-python-integration.md`).
   - Lazy + LRU for everything else.
   - Open question still unresolved from earlier audit: how exactly does `downloadDataset` perform against the experimental Railway env's network? Confirmed it works in test fixtures; needs real-data smoke test.

2. **New chat tool: `ndi_query`** wrapping `dataset.database_search(Query(...))`. Replaces today's REST passthrough for cross-class queries within a dataset. Backend endpoint `POST /api/datasets/:id/ndi_query`.

3. **New chat tool: `aggregate_documents`** for "compute mean of column X across all probes/subjects/elements in dataset Y" patterns. Returns scalar stats + optional series.

4. **New chat tool: `cross_dataset_query`** (the Tier 2 killer feature). Backed by `ndi.query.Query` + `bulkFetch`. **MATLAB side already shipped both `bulkFetch` and `ndiquery scope-by-dataset-ids` recently** (commits `bacdd0c3d` + `88c0fb904` in NDI-matlab, ~3 weeks ago). Cloud-node likely already exposes the endpoints — needs investigation.

5. **Strict-boot validation** that all NEW NDI-python paths are importable (extend the existing `is_ndi_available()` check).

### Sprint 2 (after Sprint 1) — chart depth grounded in PI questions
- Audit the 25-question list with audri.
- ImageChart + ImageOverlayChart.
- GanttChart.
- Multi-trace + colorbar `SignalChart`.
- Spike raster / ISI histogram if `vmspikesummary` access wired in Sprint 1.

### Sprint 3 (~1 week) — polish
- Code export (Python + MATLAB), one button per chat message.
- Conversation context (optional, depends on Shrek timing).
- Smoke against the 25-question list.

## RAG / API / cache map (so post-compact me doesn't re-trace this)

```
USER → Anthropic Claude (LLM, no NDI state)
         │
         ├─► RAG: semantic_search_datasets
         │    └─► Voyage AI cloud (rerank-2.5) + Railway Postgres pgvector
         │        Stored: 8 chunks (one per published dataset)
         │        Content: name + abstract + contributors + methods + sidecar metadata
         │                 (highlights/keywords/notableMethods/piContext/
         │                  binarySignalExample for the 3 tutorial datasets)
         │        NOT in RAG: document-level data, rows, binary files
         │
         ├─► Live API: every other tool
         │    └─► ndb-v2 (Railway, FastAPI)
         │         │
         │         ├─► Redis cache (ndb-v2 Railway service):
         │         │    ├─ table cache (1h TTL) — class-tables responses
         │         │    ├─ summary cache (5min TTL)
         │         │    ├─ provenance cache (5min TTL)
         │         │    ├─ pivot cache (5min TTL)
         │         │    ├─ facets cache (5min TTL)
         │         │    └─ dep-graph cache (10min TTL)
         │         │
         │         ├─► Ontology cache (SQLite at /tmp/ndb/ontology.db + Redis warmup)
         │         │    └─ 25 hot terms pre-warmed at startup
         │         │
         │         └─► cloud-node (AWS Lambda) → MongoDB + S3
         │              (no caching at this layer; cloud-node is authoritative)
         │
         └─► Conversation state: NONE (refresh wipes)

Vercel: ISR for static catalog pages; TanStack Query client-side cache.
        Chat itself uses neither.
```

**Key blind spots** in the current data layer:
1. RAG covers metadata only — 8 chunks total. Document-level content (thousands of rows per dataset) is brute-force via tools.
2. No conversation memory between sessions.
3. No per-document or per-row embeddings.
4. No aggregation tool — multi-doc averages take N+1 round-trips.

## Critical file pointers (post-compact navigation)

### Plans + checkpoints
- `apps/web/docs/specs/2026-05-13-ask-checkpoint-pre-compact.md` — earlier checkpoint (Phase A wins)
- `ndi-data-browser-v2/docs/plans/2026-05-13-ndi-python-integration.md` — integration plan (Phase A/B/C strategy)
- `ndi-data-browser-v2/docs/plans/2026-05-13-railway-experimental-env-runbook.md` — Railway env setup runbook
- `~/.claude/plans/ancient-pondering-rabbit.md` — original Days 1-4 plan
- `ndi-next-steps/Summer 2026/Major_Milestones.md` — broader NDI roadmap (Ask chat NOT in it; audri took over the `3_WebViewer/` track unofficially)

### Chart pipeline (cloud-app)
- `apps/web/components/charts/PlotlyMount.tsx` — custom React 19 Plotly wrapper, the reusable foundation
- `apps/web/components/charts/ViolinChart.tsx` — first chart, the template for Image/Gantt/etc.
- `apps/web/lib/ai/tools/tabular-query.ts` — first chart tool, the template
- `apps/web/components/ai/Markdown.tsx` — fence interceptor pattern (`childIsSignalChart`, `childIsViolinChart`, shared `childIsChartComponent`)
- `apps/web/lib/ai/tools/shared.ts` — branch-aware `baseUrl()` for server-side fetches
- `apps/web/lib/ai/tools.ts` — sibling `baseUrl()` (also branch-aware) + tool registry

### Backend pipeline (ndb-v2)
- `backend/services/tabular_query_service.py` — first new service, the template
- `backend/routers/tabular_query.py` — first new router, the template
- `backend/services/ndi_python_service.py` — Phase A integration (the only place NDI-python is touched today)
- `backend/app.py` — strict-boot `is_ndi_available()` check
- `infra/Dockerfile` — pinned SHAs for all 5 NDI git deps + `NDI_PYTHON_REQUIRED=1` env var

### NDI ecosystem (read for Sprint 1 context)
- `/Users/audribhowmick/Documents/ndi-projects/NDI-python/src/ndi/cloud/orchestration.py` — `downloadDataset` (Sprint 1 critical)
- `/Users/audribhowmick/Documents/ndi-projects/NDI-python/src/ndi/cloud/filehandler.py` — `fetch_cloud_file` (presigned-URL fetcher)
- `/Users/audribhowmick/Documents/ndi-projects/NDI-python/src/ndi/query/` — Query primitives
- `/Users/audribhowmick/Documents/ndi-projects/NDI-matlab/` — recently shipped `bulkFetch` + `ndiquery scope-by-dataset-ids`; commits `bacdd0c3d`, `88c0fb904`
- `/Users/audribhowmick/Documents/ndi-projects/ndi-cloud-node/api/` — authoritative backend; check if it already exposes `bulkFetch` routes

## Post-compact action list (in order)

1. **CHECK THE SMOKE TEST RESULT.** The user was smoke-testing the violin in the Vercel preview at compact time. Two paths:
   - **If violin rendered successfully**: pivot directly to Sprint 1 task #1 (cloud-backed Dataset binding).
   - **If something failed**: diagnose. The most likely failure mode is the Vercel rebuild hadn't propagated yet — verify by checking `vercel list` for the newest deploy and asking the user to retry.

2. **Read `ndi-cloud-node/api/`** to determine whether the MATLAB-side `bulkFetch` + `ndiquery scope-by-IDs` are already exposed as cloud-node endpoints. If yes: Sprint 1 task #4 is just wiring tool→endpoint. If no: that's a cloud-node addition (write side; touches the spine; coordinate with team).

3. **Investigate `downloadDataset` against the Railway env**. Specifically: does the experimental Railway image have network access to S3 + the cloud-node API? Test by running `downloadDataset(<small dataset>, /tmp/ndi/...)` from inside the running container. If fast: good. If multi-minute: confirms we need the persistent-volume + warm-on-boot pattern (Option B-3) before exposing this as a tool.

4. **Open a new branch** ONLY if the user asks. Otherwise STAY on the two existing experimental branches (`feat/ndi-python-phase-a` + `feat/experimental-ask-chat`) per the no-sprawl rule audri set earlier.

5. **DON'T**:
   - Build more chart types (Image / Gantt / etc.) until Sprint 1 is well underway.
   - Touch ndi-cloud-node write paths.
   - Touch the live `main` branches on either repo.
   - Create new branches.
   - Merge anything to main.

## Open questions audri is sitting on (no immediate action)

1. Layer 2+3 audit (Playwright DOM + pixel diff) — never picked b1/b2/b3. Effectively deferred indefinitely; Layer 1 was strong enough.
2. PR description rewrites for #112 + #160 to reflect broader scope.
3. Write `Summer 2026/3_WebViewer/_Why_it_matters.md` to formalize the Web Viewer track ownership.

## Branches + PRs at compact time

| Repo | Branch | PR | State |
|---|---|---|---|
| ndi-cloud-app | `feat/experimental-ask-chat` | #160 | DRAFT — [DO NOT MERGE — experimental] — TRIPLE-protected |
| ndi-data-browser-v2 | `feat/ndi-python-phase-a` | #112 | DRAFT — [DO NOT MERGE — experimental] |

Both have pre-existing `test_origin_enforcement` / `test_pivot_service` CI flakes that re-run usually clears.

## What survives compaction

- Git history (all commits pushed to remote)
- Both PRs + their descriptions
- These checkpoint docs
- The integration plan (`docs/plans/2026-05-13-ndi-python-integration.md`)
- Code in both repos
- Railway experimental env (no change unless audri tears it down)
- Vercel preview (auto-rebuilds on push)

## What does NOT survive

- The 25-question PI inventory (captured here in this doc — see "strategic audit" section above)
- The RAG/cache map (captured here)
- The Plan C decision (captured here)
- Mental context about why we picked Plotly cartesian partial (in commit messages + here)

---

**Ready for `/compact`.** Post-compact handoff: read this doc first. Specifically the "Post-compact action list" section. The user just got the smoke test result (or is about to) — pick up from there.

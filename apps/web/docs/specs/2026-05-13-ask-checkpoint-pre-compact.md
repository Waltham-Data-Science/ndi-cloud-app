# Ask chat — Pre-compact checkpoint (2026-05-13)

Written immediately before `/compact` so the post-compaction Claude (or you) can pick up where we are without re-reading 200 KB of conversation history.

## TL;DR — where we are right now

- **Days 1–4 of the scientific-depth plan are SHIPPED** to `feat/experimental-ask-chat` in ndi-cloud-app (PR #160, still draft with "DO NOT MERGE" protection)
- **Backend signal endpoint #1 (PR #109)** — merged to ndb-v2 main, live on Railway
- **Backend signal endpoint #2 (PR #110)** — file-param fix, OPEN, awaiting CI (which hasn't fired yet — GHA queue delay or webhook miss)
- **Live `ndi-cloud.com` is unaffected** throughout (verified)
- **4 of 6 demo prompts work cleanly**; chart-rendering prompt (the wow moment) still degrades to soft-error because the backend reimplements NBF/VHSB parsers and the VHSB path bails with `"vlt library not available"`

## What's shipped vs what's pending

### Cloud-app (`feat/experimental-ask-chat`, PR #160, **DRAFT — DO NOT MERGE**)

Latest commit: `4aab582 — feat(ask): binarySignalExample sidecar + file-aware fetch_signal`

All on this branch:
- 6 chat tools registered: `list_published_datasets`, `get_dataset`, `get_dataset_summary`, `get_dataset_class_counts`, `get_facets`, `semantic_search_datasets`, `query_documents`, `walk_provenance`, `fetch_signal` (that's actually 9)
- Citation pattern: every tool returns `references: Reference[]`; LLM emits `[^N]` footnotes; chat UI renders `CitationChip` + bottom `SourcesPanel`; chips deep-link to `/datasets/[id]/documents/[docId]`
- Markdown component intercepts ` ```signal-chart` fences and mounts `SignalChart` (uPlot-based, dynamic import)
- System prompt with: PI-name → semantic_search rule; document-level query guidance; row-limit guidance; signal-chart fence example; `binarySignalExample` shortcut for known-good demo docs
- `stopWhen: stepCountIs(12)` cap
- `query_documents` row cap 30 (default 10) + client-side slice (FastAPI ignores pageSize)
- Curated sidecar for 3 tutorial datasets (Bhar / Haley / Dabrowska), Dabrowska entry has `binarySignalExample: {docId: 68d6e54703a03f5cfdac8eff, filename: "ai_group1_seg.nbf_1"}`
- Suggested prompts updated to 4 smoke-tested ones
- 1080 unit tests pass, lint + typecheck + build clean

### ndb-v2 (FastAPI)

- **PR #109** — `GET /api/datasets/:id/documents/:docId/signal` — MERGED to main, live on Railway
- **PR #110** — adds `?file=` param + filename-aware `BinaryService.get_timeseries(filename=)` — **OPEN, no CI runs yet (~5+ min in queue)**. Code is on remote at `feat/signal-file-param`.

### Vercel Preview env vars

Set on **Preview AND Production** scopes (the user-via-dashboard saved them with default checkboxes; intent was Preview only). For now harmless because main has no `/ask` code; **before any merge to main**, strip the Production scope or set `NEXT_PUBLIC_ASK_ENABLED=0` on Production:

```bash
vercel env rm DATABASE_URL production
vercel env rm VOYAGE_API_KEY production
vercel env rm ANTHROPIC_API_KEY production
vercel env rm NEXT_PUBLIC_ASK_ENABLED production
```

### Latest verified preview URL

`https://ndi-cloud-app-gil5kb93u-ndi-cloud-a83eb4e7.vercel.app/ask` — has step-cap 12 + sidecar v2 (older), but **NOT** the latest 4aab582 commit (file-param + binarySignalExample). A fresh preview will rebuild from 4aab582 when the next push happens.

## Demo prompts — current state

Smoke-tested 2026-05-13:

| Prompt | Result |
|---|---|
| "How many published datasets do you have?" | ✅ Clean — "8 datasets" + citation |
| "What datasets relate to memory or learning across species?" | ✅ Semantic search → 3 datasets cited |
| "What strains were used in the Bhar C. elegans memory dataset?" | ✅ 9 strains enumerated + 2 citations |
| "What probe types were used in the Dabrowska BNST dataset?" | ✅ Multi-tool nav → 8 citations |
| "What stimuli were presented during the Dabrowska experiment?" | 🟡 Mid-exploration when capped (Dabrowska uses `stimulus_bath` / `openminds_stimulus` / `treatment` — model has to try several class names) |
| "Show me a voltage trace..." (chart) | 🟡 With `binarySignalExample` shortcut: will route to fetch_signal in 2 calls. WITHOUT NDI-python on the backend: will still soft-error for VHSB datasets (Haley); will work for NBF datasets (Dabrowska) **once PR #110 merges** so the `?file=` param is live |

## NDI-python integration — the proposed next move

### Why

Backend currently **reimplements** NBF parsing inline in `binary_service.py` (works fine) and **bails** on VHSB with `"vlt library not available"`. Both are workarounds for not having NDI-python on the Railway image.

Pulling NDI-python (which lives at `/Users/audribhowmick/Documents/ndi-projects/NDI-python/`) into the FastAPI image unlocks:

1. **VHSB decoding** — Haley foraging dataset position traces become plottable
2. **Native `database_openbinarydoc(doc, filename)`** — same pattern the published Python tutorials use; chatbot's `fetch_signal` mirrors researcher code
3. **`ndi.query.Query` + `dataset.database_search(q)`** — richer than our REST-passthrough class queries
4. **`ndi.ontology.lookup()`** — resolves ontology IDs (e.g., `WBStrain:00000001`) to human labels automatically
5. **Drops our reimplemented NBF parser** — single source of truth
6. **Sets up for richer future tools** — `walk_provenance` could traverse via the real Python `depends_on` graph, etc.

### What it means concretely

- **New Python dependency**: `ndi` (with optional `vlt` / DID-python extras)
- **New service**: `backend/services/ndi_native_service.py` (or similar) that wraps `ndi.dataset.Dataset(...)` and exposes a tiny API for the signal endpoint
- **Existing endpoints can stay** — Document Explorer's `/data/timeseries` keeps its inline parser for backward compat, or also migrates
- **Dockerfile**: adds `RUN pip install ndi vlt` (plus any system deps — usually nothing for ndi-python, possibly libffi for vlt)
- **Cold-start hit**: adds ~500ms–1s to worker boot for the ndi import. Manageable; mitigatable with lazy import like the existing numpy pattern in `binary_service.py`.

### Open questions for the post-compact session

1. **How does NDI-python authenticate to NDI Cloud?** The Python tutorials use a local `ndi.dataset.Dataset(dataset_path)` against a downloaded dataset. For the FastAPI, we'd want the same `Dataset` object backed by the cloud's MongoDB — does NDI-python have a cloud-backed Dataset constructor? Or do we download the dataset locally on Railway and operate on it?
2. **Or — simpler approach**: install only the **`vlt`** extension (DID-python) without the full NDI-python wrapping. That'd unblock VHSB decoding without changing our architecture (the existing decoder would fall through to `_parse_vhsb` automatically).
3. **Storage strategy**: if we go full NDI-python, do we cache decoded `Dataset` objects per request, or per dataset (long-lived)?
4. **Image size budget**: how much can the Railway image grow? NDI-python + vlt + scipy/numpy is a non-trivial footprint.

## Critical file pointers (so post-compact Claude can navigate)

- **Plan**: `/Users/audribhowmick/.claude/plans/ancient-pondering-rabbit.md`
- **Spec**: `apps/web/docs/specs/2026-05-13-ask-scientific-depth-plan.md`
- **Tools registry**: `apps/web/lib/ai/tools.ts`
- **Tool implementations**: `apps/web/lib/ai/tools/{query-documents,walk-provenance,fetch-signal,shared}.ts`
- **Sidecar metadata**: `apps/web/lib/ai/dataset-metadata.json`
- **System prompt**: `apps/web/lib/ai/system-prompt.ts`
- **Chat UI**: `apps/web/components/ai/{ChatMessage,Markdown,CitationChip,SourcesPanel,SignalChart}.tsx`
- **Build/ingest script**: `apps/web/scripts/build-ask-index.mjs`
- **Backend signal**: `ndi-data-browser-v2/backend/{routers/signal.py, services/{binary_service,signal_service}.py}`
- **NDI-python**: `/Users/audribhowmick/Documents/ndi-projects/NDI-python/` (workspace)
- **Python tutorials** (the canonical "what NDI-python can do" reference): `/Users/audribhowmick/Documents/ndi-projects/NDI-python/tutorials/tutorial_67f723d574f5f79c6062389d.py` (Dabrowska) + `tutorial_682e7772cdf3f24938176fac.py` (Haley)
- **Reference architecture for ndi.dataset patterns**: `/Users/audribhowmick/Documents/ndi-projects/vh-lab-chatbot/` + `/Users/audribhowmick/Documents/ndi-projects/shrek-lab-chatbot/` (these are the two working chatbots that already use NDI-python on their backends)

## Branches + PRs in flight as of this checkpoint

| Repo | Branch | PR | State |
|---|---|---|---|
| ndi-cloud-app | `feat/experimental-ask-chat` | #160 | DRAFT — `[DO NOT MERGE — experimental]` title prefix + comment + draft state — TRIPLE-protected |
| ndi-data-browser-v2 | `feat/signal-file-param` | #110 | OPEN, awaiting CI (queue delay) |
| ndi-data-browser-v2 | `feat/signal-endpoint` | #109 | MERGED to main 2026-05-13 |

## Immediate next steps (in order) for post-compact session

1. **Confirm PR #110 status** — check `gh pr checks 110` in ndb-v2; if CI never ran, push an empty commit or rerun the workflow manually
2. **Once CI green, merge #110** to main; Railway auto-deploys in ~80s
3. **Re-bake the RAG index** to embed the new `binarySignalExample` field in chunks:
   ```bash
   cd apps/web
   export DATABASE_URL='postgresql://postgres:***REMOVED***@viaduct.proxy.rlwy.net:16333/railway'
   export VOYAGE_API_KEY='***REMOVED***'
   pnpm build-ask-index
   ```
4. **Run the chart smoke test** against the latest preview:
   ```
   "Show me a voltage trace from the Dabrowska BNST patch-clamp recordings"
   ```
   With #110 merged + sidecar baked + system prompt, Claude should:
   - call `semantic_search_datasets` → see the `Demo binary signal example` line
   - call `fetch_signal({datasetId, docId: '68d6e54703a03f5cfdac8eff', file: 'ai_group1_seg.nbf_1'})`
   - emit the `signal-chart` fence → SignalChart renders → real voltage trace
5. **THEN** start the NDI-python integration as a separate arc (new branch on ndb-v2). Approach:
   - Phase A: install `vlt` extension only (minimum viable: unblocks VHSB)
   - Phase B: refactor `BinaryService` to use NDI-python's `database_openbinarydoc`
   - Phase C: add new tools backed by `ndi.query.Query` (richer than current REST passthrough)

## What to tell post-compact Claude

> "Read `/Users/audribhowmick/Documents/ndi-projects/ndi-cloud-app/apps/web/docs/specs/2026-05-13-ask-checkpoint-pre-compact.md` first. We're mid-way through verifying PR #110 (ndb-v2 signal `?file=` param) and the user wants to integrate NDI-python into the Railway FastAPI as the next architectural arc. Confirm CI on #110, merge it, re-bake the RAG index, run the chart smoke test, then plan the NDI-python integration."

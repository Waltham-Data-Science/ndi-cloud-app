# Architecture audit — 2026-05-15

A macro-level audit. Different from yesterday's bug audit — this one
looks at boundaries, coherence, scale, and change-resilience of the
system as a whole. The bug-level audit found things that are broken;
this one finds things that work today but will hurt later.

---

## TL;DR

The system has a **strong skeleton** (Heart-on-Railway, lib/ndi shared core, branch-aware preview routing) with **inconsistent flesh** (4 patterns across 7 workspace panels, mixed UI primitives, 5 catalog tools stranded in a chat-only file, one cross-layer dependency reversal, the system prompt is a 273-line god-string).

Two architectural moves would compound:
1. **Canonicalize the workspace panel pattern** (one shape for all 7)
2. **Extract `SYSTEM_PROMPT` from a const string into structured config**

Together they take ~2 days and cap a lot of future debt before it accumulates.

---

## What's working architecturally (the wins)

These are the right decisions, worth preserving as the system grows:

### 1. The three-surface model
**Chat (`/ask`) · Workspace (`/my/workspace/[id]`) · Data-browser (`/datasets/[id]`)** are correctly separated. Each has its own auth posture, its own data flow, its own user model. They SHARE the underlying data layer (`lib/ndi/tools/*`) — exactly the right thing to share. Each can evolve independently.

### 2. Heart-on-Railway
Phase 3 moved heavy orchestration (spike-summary, treatment-timeline, psth) from Vercel to Railway. Vercel layer became "thin decoration + AI SDK orchestration." This is the right axis of separation:
- **Vercel = stateless, fast cold-start, AI-SDK-bound, browser-adjacent**
- **Railway = stateful, NDI-python integration, Postgres-bound, science-bound**

It also makes the system scalable on the right axis (Railway scales with science load; Vercel scales with frontend traffic).

### 3. Branch-aware preview routing
`next.config.ts` rewrites `feat/experimental-ask-chat` to `ndb-v2-experimental.up.railway.app` automatically. Preview deploys hit experimental backend; production hits production backend. **Two parallel stacks with no manual env-var coordination per branch.** This is one of the cleanest patterns in the repo.

### 4. ToolContext pattern for auth-aware tools
After today's CSRF fix, the contract is: every tool handler accepts optional `ctx: ToolContext` with `authHeaders`. Chat passes `undefined` (anonymous). Workspace's wrapper routes extract Cookie + X-XSRF-TOKEN via `authHeadersFromRequest(req)` and pass through. Same handler code, same backend endpoint, two auth postures. **Genuinely elegant.**

### 5. The `inline/` charts split
`components/ndi/charts/` has two tiers: 12 Plotly-based charts (heavy, lazy-loaded via `PlotlyMount`) and `inline/` with 6 SVG/d3-based charts (lightweight, used by QuickPlot in data-browser). This signals an explicit design decision about when to pay the Plotly bundle cost. **The pattern should be enforced going forward.**

### 6. Phase 4 cookie contract + Phase 5 Origin enforcement
HttpOnly session cookie + double-submit CSRF + per-request Origin checks. Defense-in-depth at every mutation. Today's `cookie_attrs` fix made this scale across preview hosts cleanly.

### 7. Per-tutorial ground-truth
`apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md` extracted from the `.mlx` output.xml — that's a canonical reference that survives across sessions and gives a deterministic comparison surface. Should be the model for future cross-dataset audits.

### 8. Repo scale is healthy
| | LOC src | LOC tests | Ratio |
|---|---|---|---|
| Frontend (cloud-app) | 47,090 | 29,971 | 1:0.64 |
| Backend (ndb-v2) | 17,521 | 17,185 | 1:0.98 |

Backend has a near-1:1 test ratio. Frontend has 64% — lower but reasonable for component-heavy code with explicit E2E coverage gap (see yesterday's findings).

---

## Architectural smells (ranked by compounding cost)

These work today. They'll cost more to fix the longer they live.

### Smell #1 — Four patterns for seven workspace panels

The "form → run → chart → show code" workflow has **four distinct implementations** across the seven panels:

| Pattern | Used by | Mechanism |
|---|---|---|
| **A** Form + mutation + dedicated Next.js wrapper route | SpikeActivity, TreatmentTimeline, PSTH | `POST /api/datasets/[id]/<name>` → `authHeadersFromRequest` → handler with ctx |
| **B** Form + mutation + Vercel rewrite (no wrapper) | BehavioralCompare | `GET /api/datasets/[id]/tabular_query?…` → Vercel rewrite → Railway directly |
| **C** Form + chart-owns-fetch | SignalViewer | Form stages params into a `payload` state, SignalChart re-keys and owns its own apiFetch |
| **D** Auto-load + useQuery hook | DatasetStructure, ElectrodePosition | No Run button; TanStack hooks fire on mount |

**Why this matters:**
- Pattern B (BehavioralCompare) is the only one that **doesn't go through a wrapper route**, which means it doesn't forward auth via `ToolContext`. Will fail CSRF on private datasets. (Caught in yesterday's audit.)
- Patterns A/B/C all bypass each other's lessons. New panel = which pattern do I pick?
- Tests have to mock the network layer differently per pattern.

**Right answer:**
Canonicalize on a hybrid:
- **All mutation panels use Pattern A** (auth-uniform, wrapper-route)
- **All read-only panels use Pattern D** (auto-load, useQuery)
- Pattern C (chart-owns-fetch) becomes an implementation detail of the chart, not a panel pattern

**Effort:** Migrating BehavioralCompare to Pattern A is the only real work. SignalViewer can stay Pattern C if the chart owns the fetch consistently. ~2-3 hours.

### Smell #2 — Three different "Button" primitives in workspace panels

Workspace panels import buttons from THREE different places:
- `@/components/marketing/Button` (the `MarketingButton` — used by PSTH, SignalViewer)
- `@/components/ui/Button` (the canonical UI Button — used by BehavioralCompare)
- `@/components/ai/CodeExportButton` (used DIRECTLY, bypassing `ShowCodeButton` wrapper, by SpikeActivity + TreatmentTimeline)

Plus the `ShowCodeButton` wrapper in `components/workspace/` exists but isn't used uniformly. That's **four button-related primitives** for two button needs (run + show-code).

**Why this matters:**
- Inconsistent styling across panels (caught in yesterday's audit finding #1)
- A theme change has to touch 3 different places
- New contributor reading the code doesn't know which is canonical

**Right answer:**
Single source-of-truth for button primitive:
- One `<Button>` per surface (workspace uses its own that re-themes `@/components/ui/Button`)
- One `<ShowCodeButton>` (always the wrapper, never `CodeExportButton` directly)
- Lint rule: panels can only import from `@/components/workspace/*` + `@/components/ndi/*` + `@/lib/*`

**Effort:** ~2 hours including a lint rule.

### Smell #3 — Five tool handlers stranded in `chat-tools.ts`

`apps/web/lib/ai/chat-tools.ts` contains **5 inline handlers** (`listPublishedDatasetsHandler`, `getDatasetHandler`, `getDatasetSummaryHandler`, `getDatasetClassCountsHandler`, `getFacetsHandler`) with their own private `fetchJson` that doesn't accept `ToolContext`. Meanwhile, the other 13 tools live in `lib/ndi/tools/*` with full ctx support.

**Why this matters:**
- Catalog tools (list, get, summary, counts, facets) are the highest-volume tools — they're called by both chat AND workspace surfaces. But the workspace can't use them with auth because they're not in the shared layer.
- The duplicate `fetchJson` is a code smell that means there are subtly different fetch behaviors in two places.
- It blocks future patterns like "workspace UI shows a recommended-next-step dataset chip" because that would need auth-aware catalog access.

**Right answer:**
Move all 5 handlers from `chat-tools.ts` into `lib/ndi/tools/`:
- `list-published-datasets.ts`
- `get-dataset.ts` (rename existing `get-document.ts`? — they collide; pick different)
- `get-dataset-summary.ts`
- `get-dataset-class-counts.ts`
- `get-facets.ts`

Each takes `ctx?: ToolContext` and uses shared `fetchJson`. `chat-tools.ts` becomes ONLY the composition root (`tools` object) — no inline implementations.

**Effort:** ~3 hours including tests + chat-tools cleanup.

### Smell #4 — `aggregate-documents.ts` violates Heart-on-Railway

`lib/ndi/tools/aggregate-documents.ts` does ARITHMETIC ON UP TO 50,000 DOCUMENTS in a Vercel function. It orchestrates `ndi_query` calls (each fetches a batch), sums numeric fields, groups by string fields, all on Vercel.

This violates the Phase-3 principle: "heavy NDI processing should live in Python alongside ndi-python; Vercel/Next.js should be thin orchestration only."

**Why this matters:**
- 50K-doc aggregation in a serverless function will eventually time out
- Memory pressure: ndi_query's full doc payload × 50K = high megabyte footprint
- Vercel function billing scales with execution time
- Backend has the same data; should aggregate there

**Right answer:**
Build `backend/services/aggregate_documents_service.py` + `backend/routers/aggregate.py` mirroring the spike-summary pattern. Slim `aggregate-documents.ts` to the chat-tool proxy shape (validate input → POST → decorate).

**Effort:** ~1 day. The Python aggregation is straightforward; the work is mostly the contract definition + test coverage.

### Smell #5 — `lib/api/ontology.ts` imports from `components/`

```ts
// apps/web/lib/api/ontology.ts:11
import { normalizeOntologyTerm } from '@/components/ontology/ontology-utils';
```

Cross-layer dependency reversal. `lib` is supposed to be the lower layer; `components` depends on `lib`, not the other way. This is the only such reversal in the codebase but it's still wrong.

**Why this matters:**
- Modular boundaries break down at the first exception
- An lint rule "lib can't import from components" exists in spirit but isn't enforced

**Right answer:**
Move `normalizeOntologyTerm` from `components/ontology/ontology-utils.ts` to `lib/ontology/normalize.ts`. Re-export the function from the old location for backward compat if any tests depend on it.

**Effort:** ~30 min including a lint rule.

### Smell #6 — `SYSTEM_PROMPT` is a 273-line god-string

`lib/ai/system-prompt.ts` exports a single multi-line string with:
- Citation rules
- Dataset disambiguation (per-dataset hardcoded IDs)
- Tool-selection guidance (per-tool branching)
- Numeric instructional examples (today's audit caught these as hallucination amplifiers)
- Sources-section template
- Anti-patterns the model should avoid

**Why this matters:**
- The bot caught two factual errors in this string yesterday (wrong dataset ID at line 62-68, factual error at line 259 calling Bhar a "tree shrew study", hardcoded numeric example at line 83 causing strain-count hallucination).
- 10K tokens of input on every chat conversation's first turn = ~$0.030 per turn.
- No way to test "did changing this line break dataset disambiguation?" without a regression-grade chat replay harness (the replay harness exists at `tests/replay/` but doesn't gate this file).
- One person edits the prompt; nobody else has the cognitive load to safely edit it.

**Right answer:**
Decompose into structured config:
```
lib/ai/system-prompt/
  citation-rules.md     # canonical citation grammar
  tool-guidance.json    # per-tool when-to-use + examples
  dataset-aliases.json  # "Dabrowska" → 6896c654..., etc., loaded from catalog
  sources-template.md
  anti-patterns.md
  index.ts             # assembles + exports SYSTEM_PROMPT
```

Each module:
- Has its own test
- Can be edited without reading the whole prompt
- Numeric examples become parameterized templates with placeholder vars

**Effort:** ~1 day. Higher than the size suggests because it requires regression-grade testing (replay harness must approve before/after). Pays back ~$2-3/day in token cost reduction + makes the prompt collaboratively editable.

### Smell #7 — Backend service-to-router asymmetry (11 services without routers)

```
22 services / 11 routers / 11 services without router
```

The 11 routerless services (`dataset_binding`, `dataset_provenance`, `dataset`, `dataset_summary`, `dependency_graph`, `document`, `facet`, `ndi_python`, `pivot`, `summary_table`) are called by OTHER services. That's fine architecturally (they're internal utilities). But:

- The service-to-service dependency graph isn't documented anywhere
- A change to `dataset_summary_service` might affect 3 routers — no obvious way to know which
- No service-interface contracts (Python protocols) — refactoring requires reading every call site

**Why this matters:**
- Refactors compound risk
- Onboarding takes longer
- Yesterday's audit caught a real bug here (EPOCHS class-name fallback chain) that lived in `_counts_from_raw` and was called from multiple paths

**Right answer:**
Lightweight: write a one-page `backend/services/README.md` with a service-dependency table.
Heavier: extract `Protocol` typed interfaces for the inter-service contracts.

**Effort:** Documentation: ~1 hour. Protocols: ~1 day.

### Smell #8 — Mixed relative + absolute imports in workspace panels

```
DatasetStructurePanel.tsx:  ./PanelCard  (relative)
                            @/components/ui/Skeleton  (absolute)
                            @/lib/api/datasets  (absolute)

SignalViewerPanel.tsx:      ./PanelCard  (relative)
                            @/components/marketing/Button  (absolute)
```

Same-folder imports use `./` while cross-folder use `@/`. That's actually a defensible convention, but it's not enforced and is inconsistent across files (SpikeActivityPanel and TreatmentTimelinePanel don't use `./` at all).

**Why this matters:**
- IDE refactors (rename file) break some imports but not others
- New contributor doesn't know which to use
- Tiny but compounds

**Right answer:**
ESLint rule: `import/no-relative-parent-imports` + `no-restricted-imports` to enforce a consistent convention. Pick one (probably "always `@/` from workspace boundary" since it's clearer).

**Effort:** ~15 min config + auto-fix lint.

### Smell #9 — No tracing across Vercel → Railway

Each side has structured logs but no request-ID propagation. A user-reported issue ("/ask returned weird answer at 3:42 PM") requires:
- Grep Vercel logs for the conversation ID
- Find the tool call timestamps
- Manually correlate to Railway logs by timestamp ± 1s

**Why this matters:**
- Incident response time
- Hard to spot N+1 patterns across the boundary
- Cost attribution per user-conversation is approximate

**Right answer:**
Vercel route generates `X-Request-Id` per request. Pass through `postJson` to Railway. Railway echoes in logs + responses. Stitch logs by request ID.

**Effort:** ~2 hours. Massive observability win.

### Smell #10 — Tutorial coverage doesn't scale

3 of 8 datasets have `.mlx` tutorials. Tutorial generation is a manual MATLAB Live Script process. Each tutorial is a one-off per-dataset file.

**Why this matters:**
- The parity smoke (yesterday's work) only works for datasets with tutorials
- New datasets ship without a deterministic comparison surface
- Tutorial maintenance is per-dataset effort

**Right answer (large):**
Programmatic tutorial generation from per-dataset config:
```
backend/tutorials/
  template.j2          # Jinja2 template for the .mlx/ipynb structure
  generators/
    bhar.py            # per-dataset glue (which figures, which conditions)
    haley.py
    francesconi.py
  pipeline.py          # generates .mlx, output.xml, ipynb on demand
```
Output uploads to S3 automatically. Per-dataset glue is small (~50 LOC). Adding a 4th dataset becomes a 30-min task instead of a day.

**Effort:** ~3 days. Big payoff at 8 → 80 datasets.

---

## Scale audit — what breaks at 10x

### 10x users (1 → 10 active)
- ✅ Session store (Redis) handles
- ✅ Vercel serverless scales
- ⚠️ Postgres connection pool sized for current load — bump to 20-30 connections
- ⚠️ Anthropic spending: $40/day per heavy user × 10 users = $400/day. Need per-user spending cap + budget alerts (not just per-IP rate limit).

### 10x datasets (8 → 80)
- ✅ Catalog page (RSC + ISR) — paginates fine
- ⚠️ Cron warm-cache currently O(10 datasets); at O(80) it's ~80 × 5 endpoints × 12 cycles/hour = 4800/hour. Should switch to per-dataset hot-path detection (warm only top-N by access count).
- ⚠️ RAG index 10x — pgvector with HNSW is fine but ~50K chunks would need an IVF tuning pass
- ❌ Tutorial coverage breaks (Smell #10)
- ⚠️ The "for each dataset" loops in cron + dataset-summary become noticeable

### 10x chats/day (100 → 1000)
- ✅ Anthropic prompt caching (already enabled) handles
- ❌ In-memory rate limit (Smell from yesterday's audit) fails — must migrate to Vercel KV
- ⚠️ Voyage embed cost: 1000 × ~$0.0006 = $0.60/day. Fine.
- ⚠️ Anthropic input: 1000 × ~$0.04 = $40/day. With prompt-caching ~$15/day. Fine for now.
- ❌ The 60s function timeout (now 180s) cap could bite on longer chains. Already documented.

### 10x panels per workspace (7 → 70)
This isn't a realistic axis right now (more panels = different operations, not more users). But:
- Page bundle: Plotly cartesian is 446 KB gz; loaded once, fine
- Panel-stack render: React + 70 panels = slow. Would need virtualization or tabs.
- The `key={datasetId}` remount cost scales linearly

---

## Change-resilience audit — what's hard to swap

### Easy swaps (≤1 day)
- Anthropic → OpenAI for chat: AI SDK abstracts this. Touch `anthropic-client.ts` + adjust tool format. ~1 day.
- Voyage → OpenAI/Cohere embeddings: `voyage-client.ts` is isolated. Plus re-bake the RAG index. ~1 day code + ~30 min index re-bake.
- Railway env reorganization: env vars only.
- Vercel preview hostname pattern: env-driven via `next.config.ts` rewrites.

### Medium swaps (1 week)
- Plotly → uPlot for charts: 12 charts to migrate, but the `inline/` directory already shows the pattern. The tricky one is `SignalChart` because it's used by both chat fences AND the workspace panel.
- Postgres provider (Railway → Neon/Supabase): `DATABASE_URL` env var. But schema migration is manual; no Alembic/Drizzle in place.
- Anthropic SDK v5 → v6: AI SDK has breaking tool-format changes. Test thoroughly.

### Hard swaps (multi-week)
- Vercel → Cloudflare Workers: Next.js 16 App Router on CF is still rough. The CSP, Vercel-specific features (ISR, Image Optimization, Edge Functions with Node compat), and the rewrite-based routing all need re-implementation.
- FastAPI → another framework: 22 services + 11 routers + 7 middleware = 17K LOC. Would need to rewrite the auth + CSRF + rate-limit + origin-enforcement custom layers.
- NDI-python → a different scientific runtime: Phase A wrote the entire `dataset_binding_service`; everything downstream depends on it. Tightly coupled by design — but that's also the whole point of NDI's data model.

### What we'd want to be more swappable
- The chart library (currently Plotly) — locks the bundle weight
- The pgvector implementation (currently Postgres-specific) — could be Pinecone, Weaviate, etc.
- The session store (currently Redis on Railway) — could be Vercel KV (would unlock Smell #1 from yesterday's audit too)

---

## Cognitive load audit — onboarding a new engineer

What does a new contributor need to learn in week 1?

### Pure tech-stack learning (assumed already familiar with web dev)
- Next.js 16 App Router (rendering modes, route groups, RSC vs client)
- AI SDK v5 (tool calling, streaming, message format)
- TanStack Query 5
- Tailwind v4 with @theme tokens (different from v3)
- FastAPI (assumed Python familiar)
- pgvector

### NDI-specific
- The NDI data model: documents, classes, depends_on chains, openminds, ontology terms
- Pre-computed analysis layers: `vmspikesummary`, `tuningcurve_calc`, `epochfiles_ingested`, etc.
- Binary doc access via `database_openbinarydoc`
- The 3 call paths (chat / workspace / data-browser) and which to use when
- The 4 workspace patterns (will be 1-2 after Smell #1 fix)

### Internal architecture
- `lib/ai` vs `lib/ndi` split
- `components/ndi/charts` vs `components/ndi/charts/inline`
- 22 backend services + their inter-service deps
- The 3 environments (prod/preview/experimental)
- The 5 documentation locations (handoff-v2, parity matrix, ground truth, audit, security incident)

**Cognitive load is HIGH** but **mostly necessary** — NDI is a specialized domain. The dead-weight is on the internal-architecture side:
- Smell #6 + #3 + #5 each add a place where "ask the senior" is the only way to know which pattern to follow
- The 4-patterns-for-7-panels (Smell #1) IS dead weight — there's no domain reason for the inconsistency
- The doc sprawl (yesterday's audit Finding #7) makes "where do I learn X?" answer-vary

A week-1 contributor should be able to:
1. Add a new workspace panel via a single recipe doc ✅ (handoff-v2 has it; we should extract to a permanent doc)
2. Add a new chat tool via a single recipe doc ❌ (not written yet; the pattern exists but isn't captured)
3. Run the parity smoke against a new dataset ❌ (no one-pager)
4. Understand which auth posture to use per surface ✅ (handoff-v2 has the 3-call-paths section)

---

## Strategic recommendations (prioritized)

If I were planning the next 2 weeks of architectural work, in order:

### Week 1
1. **Canonicalize workspace panel pattern (Smell #1)** — pick Pattern A for mutations + Pattern D for read-only. Migrate BehavioralCompare. ~3 hours.
2. **Move 5 catalog handlers from chat-tools.ts → lib/ndi/tools/ (Smell #3)** — unlocks future workspace catalog UX. ~3 hours.
3. **Single Button + ShowCodeButton primitives (Smell #2)** — one canonical per workspace. ~2 hours.
4. **Cross-boundary request tracing (Smell #9)** — `X-Request-Id` propagation Vercel→Railway. ~2 hours.
5. **Move `aggregate-documents.ts` to Railway (Smell #4)** — match Heart-on-Railway principle. ~1 day.
6. **Fix the lib→components import reversal (Smell #5)** — 30 min.

### Week 2
7. **Decompose SYSTEM_PROMPT into structured config (Smell #6)** — this is THE highest-leverage architectural move. ~1 day.
8. **Backend service-dependency README + Protocols (Smell #7)** — 1 hour doc + ~1 day protocols if you want strong typing.
9. **Lint rules to enforce the new patterns** — `no-restricted-imports`, `import/no-relative-parent-imports` — locks in the wins. ~30 min.
10. **Per-user spending cap + budget alerts** — pre-launch must-do for `/ask`. ~2 hours.

### Strategic deferred (do when forced)
- **Tutorial pipeline (Smell #10)** — only when adding the 4th tutorial
- **Plotly → uPlot for signal viewer** — only if bundle headroom drops below 10 KB
- **Service Protocols** — only when refactoring an inter-service dep becomes painful

---

## What I'd build new (not just refactor)

Three things the architecture is missing that would be worth building from scratch:

### 1. A "Dataset Health" dashboard
We've found multiple data-fidelity bugs (EPOCHS=0, species=empty, sessions=0-with-elements). A `apps/web/lib/data-quality/` module that:
- Defines invariants (subjects > 0 IFF totalDocuments > 0; elements > 0 ⇒ sessions > 0; etc.)
- Runs them per-dataset on a cron
- Surfaces violations as a Catalog page badge ("⚠ ingestion incomplete")

Catches issues like Mukherjee (`sessions: 0` with 7 elements) and Chudoba/Dabrowska (zero docs) BEFORE they hit a user.

### 2. A formal `Conversation` model
Right now `/ask` conversations are localStorage-only — refresh wipes. The handoff-v2 doc calls this out as out-of-scope. But conversations also can't be:
- Shared with collaborators
- Cited in papers (the original Shrek pitch)
- Replayed for testing
- Used for fine-tuning

A backend `Conversation` model + a few endpoints (POST /conversation, GET, share, attach to dataset) unlocks all of these. ~3 days.

### 3. A `data-quality` cron + invariant tests
Cron that runs the invariants in #1 + writes results to a Postgres table. Then a dashboard at `/admin/data-health` shows per-dataset status with drill-downs. This is the operationalization of yesterday's parity smoke — instead of running it manually, run it nightly + alert on drift.

---

## Things I deliberately did NOT flag

- **NDI-python tightly coupled to backend services** — this coupling IS the value; NDI is the moat
- **No ORM on backend** — direct cloud client calls are fine for current scope; ORM would add complexity without help
- **Plotly in the bundle** — until bundle headroom drops below 10 KB, this is a non-issue
- **3 pre-existing pytest isolation failures** — known, tracked
- **The 22-service backend** — looks intimidating but each service is small and focused; the count itself isn't a smell
- **TanStack Query vs RTK Query vs SWR** — TanStack is the right choice; not worth re-litigating

---

## Architectural diagrams (current state)

### The three call paths

```
                          ┌─ USER ─┐
                          │        │
            ┌─────────────┴────────┴─────────────┐
            │                                    │
            ▼                                    ▼
        ┌──────────┐                       ┌─────────────┐
        │  /ask    │                       │ /datasets/  │
        │ (chat)   │                       │  /my/ws/    │
        └────┬─────┘                       │ (workspace) │
             │                             │ /datasets/  │
             │                             │ (browser)   │
             │                             └──┬────────┬─┘
             │                                │        │
             ▼                                ▼        ▼
       ┌─────────────┐                  ┌────────┐  ┌────────────┐
       │ /api/ask    │                  │ Wrapper│  │ Vercel     │
       │ (AI SDK +   │                  │ Routes │  │ Rewrite    │
       │  streamText)│                  │ (auth) │  │ (passthru) │
       └──────┬──────┘                  └───┬────┘  └──────┬─────┘
              │                             │              │
              └──────────────┬──────────────┴──────────────┘
                             │
                             ▼
                       ┌──────────────────┐
                       │ lib/ndi/tools/   │  ← shared tool layer
                       │ (handlers + ctx) │
                       └─────────┬────────┘
                                 │
                                 │  postJson(ctx)
                                 ▼
              ┌──────────────────────────────────────────┐
              │  Railway · ndb-v2-{production,           │
              │           experimental}                  │
              │                                          │
              │  routers → services → cloud_client       │
              │           ↓                              │
              │     Postgres (pgvector + sessions)       │
              │     Redis (sessions + ontology cache)    │
              │     NDI Cloud (data layer)               │
              └──────────────────────────────────────────┘
```

### Module dependency direction (forward arrows OK; reverse arrows = smell)

```
                         (UI tier)
                              │
                              ▼
   components/workspace ◄── components/ai ──► components/ndi/charts
              │                  │                    │
              └──────────────────┼────────────────────┘
                                 │
                                 ▼
                         lib/ai     ◄────  smell #3 imports (5 catalog
                          (chat-     ────► handlers should be in lib/ndi)
                         specific)
                            │
                            ▼
                         lib/ndi  ◄── lib/api/ontology.ts (smell #5
                       (shared core)   reaches into components/ontology)
                            │
                            ▼
                         lib/api   (data fetchers, apiFetch client)
                            │
                            ▼
                         /api/*   (Next.js wrapper routes)
                            │
                            ▼
                         Railway
```

---

## Status of architectural debt

After today's work:

| | Before today | After today |
|---|---|---|
| **lib/ai vs lib/ndi split** | confused | clean (lib/ai is chat-only) |
| **Heart-on-Railway** | partial | enforced for spike/timeline/psth |
| **Auth-aware tools** | none | `ToolContext` canonical |
| **CSRF on previews** | broken | fixed (cookie domain conditional) |
| **Workspace panel patterns** | 4-of-7 inconsistent | 4-of-7 inconsistent ← TODO |
| **System prompt size** | 273 lines | 273 lines ← TODO |
| **5 catalog handlers** | in chat-tools.ts | in chat-tools.ts ← TODO |
| **aggregate-documents on Vercel** | on Vercel | on Vercel ← TODO |
| **Cross-boundary tracing** | absent | absent ← TODO |

Five of the ten architectural smells above are net-new debt added by quick wins this week. The system gets noticeably stronger if we close 3-4 of them in week 1.

---

End of audit.

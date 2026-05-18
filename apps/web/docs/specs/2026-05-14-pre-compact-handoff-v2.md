# Pre-compact handoff v2 — 2026-05-14

This is the FIFTH checkpoint of the day. Earlier ones still on disk
for backfill, but read THIS one first — it's the post-Phase-3
architectural state plus the live commit chain on both repos.

Prior checkpoints (oldest → newest):
1. `2026-05-14-ask-checkpoint-plan-c-pivot.md` — Sprint 1 plan
2. `2026-05-14-audit-report.md` — thorough-audit findings
3. `2026-05-14-pre-compact-handoff.md` — nav-P0 pre-compact
4. `2026-05-14-post-compact-nav-p0-batch.md` — nav-P0 + remainders
5. **THIS doc** — workspace build + Phase 1/2/3 architecture + Task 2/3 follow-up gaps

---

## TL;DR — what's now true

Across two repos:

- **`ndi-cloud-app`** branch `feat/experimental-ask-chat` at `f34a9b7`
- **`ndi-data-browser-v2`** branch `feat/ndi-python-phase-a` at `74ddec9`

Both branches stay DRAFT (DO NOT MERGE — experimental). Vercel + Railway both auto-rebuilt; preview live at:

`https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app?_vercel_share=SuMAAzx33EA71RdkyGmJMUS3dkKT9dOP`

**Major capabilities shipped:**

1. **`/my/workspace/[id]`** — auth-gated Task-2 viewer GUI. 7 panels stacked vertically against any dataset (user's own published+unpublished, OR the 8 public catalog datasets). Each panel: parameter form + Run + chart + Show Code (Python + MATLAB snippets).

2. **Workspace dataset picker on `/my`** — tab strip "Your datasets" / "Public NDI catalog". Cards route into the workspace (not the read-only public detail page).

3. **WorkspaceCTA on every `/datasets/[id]/overview`** — sign-up funnel for anonymous visitors → /login?returnTo=/my/workspace/[id].

4. **"Heart on Railway" architecture** — heavy NDI processing (binary opening, query orchestration, PSTH binning, ISI computation, treatment-row walking, spike stride-sampling) lives in Python next to ndi-python. The Vercel/Node layer is purely thin decoration + AI SDK orchestration.

5. **Auth-aware tool layer** — workspace works on PRIVATE datasets, not just public. Cookie + X-XSRF-TOKEN forward through the wrapper routes via the new `ToolContext` shared infrastructure.

6. **Centralized shared core** — `lib/ndi/` (was `lib/ai/`) holds all NDI tool handlers + code-export generators + references model. `components/ndi/` holds every chart + media viewer. Three surfaces (chat / data-browser / workspace) compose from these two shared trees.

**Test/lint/build state:**
- cloud-app: 1572 frontend tests pass · typecheck + lint clean · bundle 168.2 KB gz unchanged
- ndb-v2: ~742 backend tests pass (89 new this session)

---

## The 7 workspace panels

```
/my/workspace/[id]
  1. Dataset Structure         — auto-loaded; counts + ontology pills + class table
  2. Signal Viewer             — SignalChart  (signal, position, multi-channel)
  3. Spike Activity            — SpikeRaster + IsiHistogram
  4. Behavioral Compare        — ViolinChart  (tabular_query)
  5. Treatment Timeline        — GanttChart   (treatment_timeline)
  6. Electrode Position View   — ElectrodeMapChart (probe coordinates)
  7. PSTH                      — PsthChart with stimulus-onset line
```

Each panel reuses:
- `<PanelCard>` (shared frame)
- `<ShowCodeButton>` (wraps the existing CodeExportButton with single-tool-call adapter)

---

## Commit chain (this session, all pushed)

### cloud-app — `feat/experimental-ask-chat`

| # | Commit | Description |
|---|---|---|
| 1 | `8821961` | `/my/workspace/[id]` rich Task-2 viewer with 5 initial panels |
| 2 | `ca925f7` | Phase 1A rename: lib/ai shared parts → lib/ndi |
| 3 | `4c042ef` | Phase 1B consolidate: chart components → components/ndi/ |
| 4 | `70e9c92` | Phase 2 auth-aware ToolContext — workspace works on private data |
| 5 | `97c3d8f` | Follow-up gaps spec doc |
| 6 | `66cf0c4` | WorkspaceCTA on /datasets/[id]/overview (Task-3 sign-up funnel) |
| 7 | `3b5f167` | Upstream-repo asks doc (12 items across ndi-python/matlab/cloud-node) |
| 8 | `7257c8a` | ElectrodePositionPanel — 6th workspace panel (Task-2 gap #2) |
| 9 | `772c235` | Phase 3 slim: spike-summary + treatment-timeline → Railway proxies |
| 10 | `f34a9b7` | PSTH panel + chart + tool + wrapper (Task-2 gap #1) |

### ndb-v2 — `feat/ndi-python-phase-a`

| # | Commit | Description |
|---|---|---|
| 1 | `b1bb29f` | (earlier) CSRF exemption for /api/ontology/batch-lookup |
| 2 | `6b1b9ef` | (earlier) WBStrain scrape fallback + Caenorhabditis facet dedup |
| 3 | `aa11de6` | (earlier) probe→element class alias + typed binding-failure codes |
| 4 | `93f2887` | Treatment-timeline orchestration → Python |
| 5 | `eac08c9` | Spike-summary orchestration → Python |
| 6 | `74ddec9` | PSTH service + router (new endpoint) |

---

## Architectural mental model (read this before touching code)

### Directory layout

```
apps/web/
├── lib/
│   ├── ai/                       ← CHAT-SPECIFIC ONLY
│   │   ├── chat-tools.ts         AI SDK adapter (was tools.ts)
│   │   ├── system-prompt.ts
│   │   ├── conversation-store.ts, use-conversation.ts
│   │   ├── rate-limit.ts, feature-flag.ts
│   │   ├── voyage-client.ts, anthropic-client.ts
│   │   ├── hybrid-retrieval.ts, db/
│   │   └── dataset-metadata.json  (sidecar for RAG)
│   │
│   └── ndi/                      ← SHARED NDI TOOL LAYER
│       ├── tools/
│       │   ├── shared.ts          ToolContext + authHeadersFromRequest +
│       │   │                        fetchJson(ctx?) + postJson(ctx?) +
│       │   │                        baseUrl() + logEvent + logToolInvocation
│       │   ├── fetch-signal.ts
│       │   ├── fetch-image.ts
│       │   ├── fetch-spike-summary.ts  ← Phase 3 thin proxy (297 LOC)
│       │   ├── treatment-timeline.ts   ← Phase 3 thin proxy (220 LOC)
│       │   ├── psth.ts                 ← NEW
│       │   ├── tabular-query.ts
│       │   ├── ndi-query.ts
│       │   ├── aggregate-documents.ts
│       │   ├── query-documents.ts
│       │   ├── walk-provenance.ts
│       │   ├── lookup-ontology.ts
│       │   ├── ndi-dataset-overview.ts
│       │   └── get-document.ts
│       ├── code-export/           Python + MATLAB snippet generators
│       │   ├── python.ts (has PSTH branch as of f34a9b7)
│       │   ├── matlab.ts
│       │   ├── types.ts
│       │   └── utils.ts
│       └── references.ts          shared citation/reference model
│
├── components/
│   ├── ai/                       ← CHAT-UI SHELL ONLY
│   │   ├── ChatInput, ChatMessage, ChatThread
│   │   ├── Markdown.tsx          (chart-fence dispatcher)
│   │   ├── CodeExportButton
│   │   ├── CitationChip, SourcesPanel
│   │   └── ToolCallIndicator, SuggestedPromptChips, ShareConversationButton
│   │
│   ├── ndi/                      ← SHARED VIZ LAYER
│   │   ├── charts/
│   │   │   ├── PlotlyMount        dynamic Plotly wrapper
│   │   │   ├── SignalChart        was components/ai/
│   │   │   ├── MultiTraceChart    was components/ai/
│   │   │   ├── TimeseriesChart    was components/app/
│   │   │   ├── FitcurveChart      was components/app/
│   │   │   ├── ViolinChart, GanttChart, SpikeRaster, IsiHistogram, ImageChart
│   │   │   ├── ElectrodeMapChart  ← NEW
│   │   │   ├── PsthChart          ← NEW
│   │   │   └── inline/            SVG/d3 family for QuickPlot
│   │   │       ├── ViolinPlot, BoxPlot, Histogram, BarChartByGroup,
│   │   │       └── ScatterPlot, LinePlot
│   │   └── media/
│   │       ├── ImageViewer, VideoPlayer
│   │
│   ├── app/                      ← data-browser surfaces only
│   │   ├── DocumentExplorer, SummaryTableView, DataPanel
│   │   ├── DatasetDetailHero, DatasetTabs, DatasetDetailChromeGate
│   │   ├── AccountSidebar, QuickPlot
│   │   └── (no more chart components here — all moved out)
│   │
│   ├── datasets/                 ← dataset-specific UI
│   │   ├── DatasetCard, DatasetSummaryCard, DatasetProvenanceCard
│   │   ├── DatasetOverviewCard, DatasetsHero, FacetSidebar
│   │   └── WorkspaceCTA          ← NEW (sign-up funnel)
│   │
│   ├── workspace/                ← /my/workspace/[id] surface
│   │   ├── PanelCard, ShowCodeButton
│   │   ├── DatasetStructurePanel
│   │   ├── SignalViewerPanel
│   │   ├── SpikeActivityPanel
│   │   ├── BehavioralComparePanel
│   │   ├── TreatmentTimelinePanel
│   │   ├── ElectrodePositionPanel  ← NEW
│   │   └── PsthPanel               ← NEW
│   │
│   ├── ontology/, marketing/, errors/, ui/   (existing, unchanged)
│
└── app/api/datasets/[id]/
    ├── spike-summary/route.ts     ← extracts auth, calls thin handler
    ├── treatment-timeline/route.ts ← same pattern
    ├── psth/route.ts              ← NEW, same pattern
    └── (other routes unchanged)
```

### The three call paths (after Phase 3)

```
                       ┌─ Browser
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  CHAT path: /ask                                                 │
│  Browser → Vercel /api/ask → AI SDK streamText → handler         │
│    → handler calls Railway endpoint (via postJson, no ctx)       │
│    → Railway does the heavy work, returns raw                    │
│    → handler decorates (chart_payloads + references)             │
│    → AI SDK streams back to browser                              │
│                                                                  │
│  WORKSPACE path: /my/workspace/[id]                              │
│  Browser → apiFetch /api/datasets/{id}/spike-summary             │
│    → Vercel wrapper route: extract Cookie + X-XSRF-TOKEN         │
│    → call handler with ToolContext.authHeaders                   │
│    → handler POSTs to Railway with auth forwarded                │
│    → Railway returns raw data scoped to user's access            │
│    → handler decorates → wrapper returns to browser              │
│    → Panel renders chart from chart_payloads                     │
│                                                                  │
│  DATA-BROWSER path: /datasets/[id]/*                             │
│  Browser → apiFetch /api/datasets/{id}/summary (etc.)            │
│    → Vercel rewrite → Railway directly (no Next.js function)     │
│    → Railway returns; browser consumes via existing hooks        │
└─────────────────────────────────────────────────────────────────┘
```

The chat + workspace SHARE the lib/ndi/tools handlers — same code, different callers. The data-browser uses the existing TanStack Query hooks (lib/api/datasets.ts, lib/api/documents.ts) which are simpler since they don't need chat-style decoration.

---

## How to add an 8th workspace panel (the pattern is well-established now)

1. **Backend (if new orchestration needed)** — add a service in
   `backend/services/<name>_service.py` + router in `backend/routers/<name>.py`
   + register in `backend/app.py` + tests. Return RAW data (don't replicate
   chat_payload framing).

2. **TS proxy** (only if chat needs it OR for code-export) — add
   `lib/ndi/tools/<name>.ts` with zod input + handler that POSTs to
   Railway + decorates response with chart_payload + references[].

3. **Chat tool registration** — add to `lib/ai/chat-tools.ts`. Wrap as
   `execute: (input) => handler(input)` so the AI SDK's `(input) => R`
   shape is satisfied (anonymous chat path).

4. **Wrapper route** (for workspace) — `app/api/datasets/[id]/<name>/route.ts`
   that extracts auth via `authHeadersFromRequest(req)` + calls handler.

5. **Chart component** — `components/ndi/charts/<Name>Chart.tsx` via
   the dynamic PlotlyMount pattern. aria-label is required (P1 #I-6).

6. **Workspace panel** — `components/workspace/<Name>Panel.tsx` with
   form + Run + chart + ShowCodeButton. Use PanelCard for the chrome.

7. **Code-export** — add `<name>` cases in `lib/ndi/code-export/python.ts`
   + `matlab.ts`.

8. **Wire into workspace** — add `<Panel datasetId={datasetId} />` in
   `app/(app)/my/workspace/[id]/workspace-client.tsx`.

9. **Tests** — handler proxy contract test (mock fetch, verify decoration),
   chart test (mock PlotlyMount, verify props passed), panel test (mock
   apiFetch, verify form + Run + Show Code wiring).

The PSTH commit (`f34a9b7`) is the cleanest reference for the full pattern across all 9 steps.

---

## What's tested

- **Frontend (cloud-app):** 1572 unit tests pass. Coverage spans:
  - Every chat tool handler (proxy contract tests after Phase 3)
  - Every workspace panel (form + Run + chart mount + Show Code wiring)
  - Every chart component (props passthrough, aria-label, render branches)
  - Code-export Python + MATLAB generators (per-tool snippets)
  - Auth-forwarding contract (`authHeadersFromRequest` + fetchJson/postJson)
  - Workspace routing (auth gate, dataset list, tab strip)
  - WorkspaceCTA visibility for signed-in vs signed-out users
  - Markdown chart-fence dispatcher

- **Backend (ndb-v2):** ~742 unit tests pass. Coverage spans:
  - Every service (signal, image, tabular_query, ontology, spike_summary,
    treatment_timeline, psth)
  - Every router (auth, CSRF posture)
  - The new shared orchestration helpers
  - Probe→element class alias
  - Caenorhabditis facet dedup

- **NOT tested (intentional):** Live Railway round-trips on the actual cloud (no integration harness yet — we trust the unit-test isolation + the smoke tests we run after each push).

---

## Open follow-ups (none blocking — for next session if scope allows)

From `apps/web/docs/architecture/2026-05-14-followup-gaps.md` and `2026-05-14-upstream-repo-asks.md`:

1. **DataPanel binary-kind audit** (Task-3 gap #3) — verify `useBinaryKind`
   recognizes every binary doc layout in production. Low priority; touches
   server-side binary_service.py.

2. **MATLAB code-export TODO sweep** (Gap #5) — audited; remaining TODOs
   are honest placeholders pending upstream NDI-matlab API additions (see
   upstream-asks doc items 4, 5, 6). No frontend-actionable work.

3. **Upstream-repo asks** — 12 items filed for ndi-python / ndi-matlab /
   ndi-cloud-node. 3 BLOCKING, 4 ENHANCEMENT, 5 CANONICALIZATION. The
   upstream maintainers can prioritize independently of cloud-app +
   ndb-v2 sprints.

4. **Live smoke test on Vercel preview** — verify all 7 panels render
   end-to-end with real data on a private dataset (best done together
   in a browser session post-compact).

---

## Things to verify together when you check this out

A practical smoke checklist for the live preview:

1. **Catalog → workspace funnel**
   - Visit `/datasets/[any-public-id]/overview` while signed out → see WorkspaceCTA at the top → click → land on `/login?returnTo=/my/workspace/[id]`
   - Sign in → redirect lands you in the workspace for the same dataset
   - Signed-in version of the CTA copy changes to "Open this dataset in your workspace →"

2. **/my workspace landing**
   - "Your datasets" tab shows your org's datasets (published + in-review)
   - "Public NDI catalog" tab shows the 8 public datasets
   - Clicking any card routes to `/my/workspace/[id]` (NOT the read-only `/datasets/[id]/overview`)

3. **/my/workspace/[id] — all 7 panels render**
   - Dataset Structure auto-loads on mount (counts + biology pills + class table)
   - Each of the other 6 has a form + Run button
   - Run on Signal Viewer with a known docId → SignalChart renders
   - Run on Spike Activity with kind=both → SpikeRaster + IsiHistogram both render
   - Run on Behavioral Compare on Dabrowska with `variableNameContains=ElevatedPlusMaze` + `groupBy=Treatment` → ViolinChart renders
   - Run on Treatment Timeline → GanttChart with bars per subject
   - Electrode Position View auto-loads → either map or empty-state
   - Run on PSTH with a vmspikesummary docId + stimulus_presentation docId → bar chart with vertical line at x=0

4. **Show Code button on every panel**
   - Click → modal opens with Python + MATLAB tabs
   - Snippets are runnable (the imports + API calls match NDI-python / NDI-matlab)
   - Copy + Download .py / .m buttons work

5. **Auth-scoping**
   - Workspace panels work on YOUR private datasets (auth forwards
     through Phase 2's ToolContext)
   - Workspace panels work on public datasets too (no auth needed —
     same code path, just no Cookie)
   - Anonymous user can't reach `/my/workspace/[id]` (redirects to /login)

6. **Heart on Railway**
   - Check Vercel function logs during a workspace panel run — should see
     `ask.tool.<name>.invoked` event + a short turnaround (Vercel does just
     the HTTP roundtrip to Railway + decoration; the heavy compute is
     Railway-side)
   - Check Railway logs — should see the actual orchestration work (PSTH
     binning, spike binary opening, treatment-row walking)

---

## What survives compaction

- All git history + commits pushed to both remotes
- The 4 architecture docs:
  - `apps/web/docs/architecture/2026-05-14-shared-core-spec.md` (Phase 1+2 plan)
  - `apps/web/docs/architecture/2026-05-14-followup-gaps.md` (Task-2/3 gaps)
  - `apps/web/docs/architecture/2026-05-14-upstream-repo-asks.md` (ndi-python/matlab/cloud-node)
  - **This doc** (handoff)
- All test files + the patterns they exemplify
- The shared `lib/ndi/tools/shared.ts` infrastructure (ToolContext, authHeadersFromRequest, postJson, fetchJson)
- The PSTH commit's pattern (cleanest reference for adding a panel end-to-end)

## What does NOT survive compaction

- Working memory of which agents ran which subtasks (commit messages capture it)
- The hypothesis trail on any open ambiguity (none currently — every gap is documented + scoped)
- Open Playwright browser state (any smoke test re-navigates from scratch)

---

## Reading order for next session

1. This doc.
2. `apps/web/docs/architecture/2026-05-14-shared-core-spec.md` — explains the lib/ndi vs lib/ai split + the auth-aware tool refactor.
3. `apps/web/docs/architecture/2026-05-14-followup-gaps.md` — names everything still open + the build path per item.
4. `apps/web/docs/architecture/2026-05-14-upstream-repo-asks.md` — what we can't fix from these two repos.
5. If smoking the preview: the "Things to verify together" section above.

Ready for `/compact`. Post-compact: read this doc, then smoke-test the live preview together. No code work is queued — everything in flight has shipped.

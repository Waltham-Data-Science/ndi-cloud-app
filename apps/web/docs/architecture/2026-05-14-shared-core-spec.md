# Shared-core architecture spec — 2026-05-14

Bird's-eye review of how the chat, the data browser, and the new /my
workspace fit together; what duplicates; what's a stopgap; the unified
shape we're moving to.

---

## TL;DR

Three surfaces ship today on one Next.js app:

| Surface | URL | Audience | Auth |
|---|---|---|---|
| Catalog browser | `/datasets/[id]/*` | Public (incl. anonymous) | Optional — public datasets anon; private requires session |
| Chat | `/ask` | Public (anonymous-only by design) | None |
| Workspace | `/my/workspace/[id]` | Logged-in users | Required (auth gate) |

All three converge on the same FastAPI backend (`ndi-data-browser-v2`).

The CODE that powers them is partially shared but lives in directories
named after the FIRST consumer rather than the SHARED nature:

- `lib/ai/` — tool handlers (called by chat AND workspace; not AI-only)
- `components/ai/` — mostly chat-UI shell, BUT also SignalChart +
  MultiTraceChart (used by chat + workspace + data browser delegation)
- `components/charts/` — Plotly chart layer (used by chat + workspace)
- `components/app/` — data-browser components, BUT also TimeseriesChart
  (called from SignalChart) and ViolinPlot/BoxPlot/Histogram/etc.
  (QuickPlot inline-table SVG family)
- `components/workspace/` — workspace panels (clean — only this surface)

Result: a developer reading the file tree has to know which surface
each directory was named after to find the right code. That's drift.

---

## What the investigation found

Three parallel Explore-agent reports captured at `/tmp/...tasks/` — the
high-points:

### 1. Chart component drift (`a958eaad`)

- **True duplication (1)**: `ViolinPlot` (SVG/d3, `components/app/`) vs
  `ViolinChart` (Plotly, `components/charts/`). Different libraries,
  different callers — but both render violin distributions of behavioral
  measurements. The Plotly one is the canonical going forward; the SVG
  one is QuickPlot-specific inline viz.
- **Composition pattern (1)**: `SignalChart` (`components/ai/`) owns
  the data fetch + colorbar logic and delegates rendering to
  `TimeseriesChart` (`components/app/`, 1-channel) or
  `MultiTraceChart` (`components/ai/`, 2+ channels). The delegation
  works but the layering is hidden by directory naming.
- **Surface-specific styling (2)**: Plotly path for chat-fenced + Task-2
  workspace charts; SVG/d3 path for QuickPlot inline viz on table rows.
  Intentional, not a stopgap — Plotly adds ~70 KB gz overhead per chart
  surface mounted, so the table-row inline path stays lightweight.
- **Naming inconsistency**: "Chart" suffix (Plotly variants) vs "Plot"
  suffix (SVG variants). No type-level guidance for which one is which.

### 2. Tool layer auth gaps (`aa6f5b58`)

**Critical correctness gap**: Workspace panels appear to work for
private datasets because the page is auth-gated, but the underlying
tool calls silently fail for any private record.

The chain that breaks:

```
[Workspace panel] apiFetch(/api/datasets/X/spike-summary)   ←  cookies present
        ↓
[Wrapper route] app/api/datasets/[id]/spike-summary/route.ts ←  request received
        ↓                                                       (cookies in req.headers)
[Tool handler] fetchSpikeSummaryHandler(input)              ←  NO ctx, ignores cookies
        ↓
fetch(`${baseUrl}/api/query`, { method: 'POST',             ←  NO Cookie header
                                headers: { Origin: ... } })
        ↓
[FastAPI] /api/query                                        ←  anonymous request,
                                                               returns public results only
```

Every chat tool handler hardcodes `fetch()` calls without forwarding
auth. The chat is correctly anonymous-only by design. The workspace
inherits that gap — even though the workspace KNOWS the user is
authed, the auth never reaches FastAPI.

**Practical impact**: A logged-in user opens the workspace on one of
their own private (in-review) datasets. They click Run on the Spike
Activity panel. The backend returns empty results because no Cookie
was forwarded. The panel renders "no spike data" — which looks like a
data issue but is actually an auth-plumbing bug.

### 3. Backend endpoint hygiene (`af70cd6b`)

The FastAPI side is well-organized. A few minor items:

- **Naming**: `/api/datasets/{id}/tabular_query` uses snake_case;
  `/api/ontology/batch-lookup` uses kebab. Minor inconsistency.
- **Path collisions resolved cleanly**: `/api/datasets/{id}/ndi_overview`
  + `/api/datasets/{id}/tabular_query` are in separate routers but
  share the dataset prefix — current router-by-feature split keeps
  deployment hygiene clean.
- **Two intentional duplications**: `/data/image` (explorer decode)
  + `/image` (chat tool, Pillow heatmap). Different shapes for
  different surfaces; this is fine — explorer wants raw, chat wants
  pre-rendered for the LLM fence.
- **No critical auth gaps** on the backend itself. Mutations are CSRF-
  protected; reads use `limit_reads`. The recent `/api/ontology/batch-lookup`
  CSRF exemption is correct.

---

## What the next-steps doc asks for (Tasks 2 & 3 gap check)

Per `/Users/audribhowmick/Documents/ndi-projects/ndi-next-steps/Summer 2026/`:

### Task 2 — Viewer & Common Plots

| Requirement | Status |
|---|---|
| Visualization of data structure | ✅ DatasetStructurePanel |
| Raster plots | ✅ SpikeRaster |
| PSTHs (peri-stimulus time histograms) | ❌ Not built |
| Raw traces | ✅ SignalChart |
| Electrode position views | ❌ Not built |
| Basic spike statistics | ✅ IsiHistogram |
| Common computations (top 5 day-1) | ⚠️ Partial — aggregate, tabular_query (violin), treatment_timeline; missing: PSTH, firing-rate-by-condition, tuning curves |
| Clear escalation path to API | ✅ Show Code button (Python + MATLAB) |

**Verdict**: 70% — 4/7 plots/views shipped; common computations covered
3/5 named cases. Missing: PSTH, electrode position view, tuning curve
computation. All are additive panels following the existing pattern;
none require architectural change.

### Task 3 — Web Viewer

| Requirement | Status |
|---|---|
| Anyone view our data | ✅ `/datasets/[id]/*` public surface (overview, tables, documents) |
| Anyone make simple plots | ⚠️ Limited — DataPanel renders binary docs anonymously, but no parameter-driven plot UI |
| Customer demo path | ✅ `/datasets/[id]/documents/[docId]` with DataPanel shows pre-computed signals/images for each doc |

**Verdict**: ~70% — anonymous browsing is solid; anonymous plot-creation
is limited to whatever DataPanel auto-renders. The interpretation
question is whether "anyone make simple plots" requires anonymous
plot-CREATION (currently no) or whether the existing anonymous
view-and-preview is sufficient. Per the user's earlier directive
("system should not allow just random public users to see [the
workspace]"), the answer is that the catalog + DataPanel anonymous
viewing is the demo path; the workspace is the sign-in funnel.

---

## Proposed unified architecture

Two structural moves and one correctness fix.

### Move 1 — Rename + relocate (Phase 1)

```
apps/web/
├── lib/
│   ├── ndi/                       ← was lib/ai
│   │   ├── tools/                 ← tool handlers
│   │   ├── chat-tools.ts          ← AI SDK adapter (was lib/ai/tools.ts)
│   │   ├── code-export/           ← Python + MATLAB snippet generators
│   │   ├── references.ts          ← reference model (shared)
│   │   └── (chat-specific files stay: system-prompt, hybrid-retrieval,
│   │        anthropic-client, voyage-client, db/, dataset-metadata,
│   │        rate-limit, feature-flag, conversation-store, use-conversation)
│
├── components/
│   ├── ndi/
│   │   ├── charts/                ← unified visualization layer
│   │   │   ├── PlotlyMount.tsx
│   │   │   ├── SignalChart.tsx          ← was components/ai/
│   │   │   ├── MultiTraceChart.tsx      ← was components/ai/
│   │   │   ├── TimeseriesChart.tsx      ← was components/app/
│   │   │   ├── FitcurveChart.tsx        ← was components/app/
│   │   │   ├── ViolinChart.tsx          ← Plotly, was components/charts/
│   │   │   ├── GanttChart.tsx           ← Plotly
│   │   │   ├── SpikeRaster.tsx          ← Plotly
│   │   │   ├── IsiHistogram.tsx         ← Plotly
│   │   │   ├── ImageChart.tsx           ← Plotly
│   │   │   └── inline/                  ← SVG/d3 family (was components/app/)
│   │   │       ├── ViolinPlot.tsx
│   │   │       ├── BoxPlot.tsx
│   │   │       ├── Histogram.tsx
│   │   │       ├── BarChartByGroup.tsx
│   │   │       ├── ScatterPlot.tsx
│   │   │       └── LinePlot.tsx
│   │   └── media/
│   │       ├── ImageViewer.tsx    ← was components/app/
│   │       └── VideoPlayer.tsx    ← was components/app/
│   ├── ai/                        ← chat-UI shell ONLY
│   │   └── (ChatInput, ChatMessage, ChatThread, Markdown,
│   │        SuggestedPromptChips, ShareConversationButton,
│   │        ToolCallIndicator, CodeExportButton, CitationChip,
│   │        SourcesPanel — chart files moved out)
│   ├── app/                       ← data-browser-specific
│   │   └── (DocumentExplorer, SummaryTableView, DataPanel, QuickPlot,
│   │        DatasetDetailHero, DatasetTabs, AccountSidebar, etc.)
│   ├── datasets/                  ← dataset-specific cards/forms
│   ├── workspace/                 ← workspace panels
│   ├── ontology/                  ← OntologyPopover + utils
│   ├── marketing/                 ← AuthCard, MarketingButton, etc.
│   ├── errors/                    ← ErrorState
│   └── ui/                        ← generic primitives (Card, Skeleton, etc.)
```

Mechanical work: rename + move + sweep imports. ~100 files touched but
no behavior change. Tests should still pass after.

### Move 2 — Auth-aware tool context (Phase 2)

Add an optional `ToolContext` parameter to every tool handler:

```typescript
export interface ToolContext {
  /** Forwarded auth headers (Cookie, X-XSRF-TOKEN). Undefined = anonymous. */
  authHeaders?: Record<string, string>;
}

export async function fetchSpikeSummaryHandler(
  input: FetchSpikeSummaryInput,
  ctx?: ToolContext,
): Promise<ToolResult<FetchSpikeSummaryToolResult>>;
```

Inside each handler, the `fetch()` calls merge `ctx?.authHeaders` into
their own headers. Chat /api/ask passes `undefined` (anonymous as
before). Workspace wrapper routes extract `Cookie` from
`req.headers.cookie` and pass it through.

After this, the workspace correctly works on private datasets.

### Move 3 — Defer

- Cross-repo package extraction — only worth doing when we have a 4th
  consumer (desktop GUI, Python CLI). The current monorepo gives us
  module-boundary discipline through directory structure alone.
- Backend endpoint name normalization (snake_case vs kebab) — minor
  cosmetic; defer until the next backend refactor.

---

## Execution plan for this session

1. ✅ Investigation (3 parallel Explore agents, this doc)
2. ☐ User scope confirmation — Task 3 interpretation
3. ☐ Phase 1: rename + relocate (mechanical)
4. ☐ Phase 2: auth-aware tool context (correctness)
5. ☐ Optional: Task 2 panel gaps (PSTH, electrode position view, tuning curve)

Total: ~6-8 substantial commits. Should be done in one focused session.

---

## Open question for the user

**Task 3 ("anyone make simple plots") interpretation**: does "anyone"
require ANONYMOUS plot-creation (lifting the workspace auth gate for
public-only datasets), or is the current "anonymous browse +
sign-in-to-plot" funnel sufficient? See `AskUserQuestion` below.

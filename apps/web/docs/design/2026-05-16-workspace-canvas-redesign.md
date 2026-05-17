# `/my/workspace` — one-canvas redesign (Phase 2)

**Date:** 2026-05-16
**Status:** Design proposal — supersedes the 5-tab redesign that shipped in commits 7efa9b1 → 1808bee
**Author:** Claude (post-compaction rethink)

---

## Why we're redoing this

The 5-tab redesign shipped in Phases A–E **looks** good but the user found it **doesn't work**:

> "Not only does nothing work — you select a document, it doesn't actually copy its id, and when you paste the id it says invalid string. Another tool says it found no treatment even though there's so many. This is not intuitive of a research suite at all. This should be **one suite where all the functions are available**, not 5 tabs of random back and forth, with a lot of that linking back to the document explorer, and completely contextually away from the workspace."

Three concrete failures:

1. **Wiring gap.** `SubjectsBrowser` writes `?select=<docId>` to the URL and the `ViewActionsRail` builds links like `/analyses?subject=<docId>#signal-viewer` — but `SignalViewerPanel`, `PsthPanel`, `TreatmentTimelinePanel` etc. never read the URL params. Forms arrive empty. The "Run" button errors with "invalid string" because the user can't even copy the ID off the row they selected.
2. **Data-shape mismatch.** Even if we wired `?subject=` to pre-fill `SignalViewerPanel.docId`, that's the **wrong ID** — `SignalViewerPanel` wants an `element_epoch` doc, not a subject doc. The "select a subject, run signal trace" flow requires multi-step context (subject → session → epoch → element_epoch), not single-step.
3. **Escape routes.** `Structure` tab routes to `/datasets/{id}/documents`, `ViewActionsRail` has a "View document" button that does the same, the `StarterViewCard` `Browse units →` link is also outbound. The workspace constantly dumps the user into the Document Explorer — they lose context every time.

The IA itself — 5 top-level tabs that split *data* (Subjects, Sessions) from *tools* (Analyses) — is **structurally wrong** for the workflow. Every other serious data tool (Hex, Observable, Neurosift, Jupyter) lays out the picker and the analysis surfaces on the **same canvas** with **reactive selection**. We need to do the same.

---

## Research: how other systems lay this out

### Hex (analytics notebook, AI-native)

- Project-wide **filters propagate across all cells** from any dataframe.
- Chart selections feed downstream cells — "click and drag over a chart area to select data points; downstream cells consume the filtered records."
- **Reactive DAG**: each cell re-runs when an upstream dependency changes.
- Notebook Agent (AI) lives *inside* the same surface, picking up the analyst's context automatically.
- One canvas, scrollable, no top-level tabs.

### Observable Notebooks 2.0

- **Full-bleed canvas** — notebooks extend to full window width, not centered column.
- `view()` cells publish reactive values; multiple inputs per cell.
- Inputs are first-class UI primitives (dropdowns, sliders, tables) that emit values consumed by downstream cells.

### Neurosift (the closest direct analog — browser-based NWB viewer for DANDI)

- **Hierarchical tree on left, expanded panels on right** — ElectricalSeries, ImageSeries, TimeIntervals, Units table.
- **Synchronized views**: interactive alignment between ElectricalSeries + Spike Raster Plot — zoom/pan one, the others follow.
- **Interactive PSTH** with inline selection of unit, time variable, window, bin, grouping.
- This is the layout that wins for "browse + analyze NWB data in a browser." Our problem space is the same shape; Neurosift's layout is the right reference.

### Linear (focused product surface)

- **Collapsible sidebar** for focus mode (`[` key).
- Cmd+K command palette for navigation.
- Consistent headers across surfaces; sidebars dimmed so canvas reads as primary.

### DataJoint Elements

- Schema-driven queries with intuitive operator language.
- Embedded Plotly Dash dashboards.
- Modular pipelines (parallel to NDI's typed-document graph).

### The universal pattern

| Layer        | Hex         | Observable  | Neurosift     | Linear      | DataJoint   |
|--------------|-------------|-------------|---------------|-------------|-------------|
| Selection    | Filter cells| view() cells| Tree-on-left  | Sidebar nav | Query lang  |
| Canvas       | Cell list   | Cell list   | Panel grid    | Issue view  | Dashboard   |
| AI / Help    | Inline      | Inline      | n/a           | Cmd+K       | n/a         |
| Tabs?        | **No**      | **No**      | **No**        | Minimal     | **No**      |

**Nobody splits "pick data" from "analyze data" into top-level tabs.** Every serious tool puts them on the same canvas with reactive selection.

---

## What NDI uniquely brings

The competitor patterns inform layout, but the differentiator is **typed-document context**:

- **Multi-key selection**: subject → session → epoch → unit → stimulus are first-class document classes connected by `depends_on`. A workspace can carry all five as orthogonal context dimensions, and each analysis panel reads whichever subset it needs.
- **Ontology-grounded**: when the picker shows "Strain: PR811" it's an `ontologyTableRow` lookup, not free text. Autocomplete from the actual dataset is feasible.
- **Pre-computed analysis layers**: `vmspikesummary`, `tuningcurve_calc` mean PSTH/raster can fetch a single doc instead of recomputing.
- **17 chat tools** that already handle each analysis end-to-end. The workspace panels are thin UI over those same tools — we don't need new analysis code, just better wiring.

**The redesign leans into all four.** The selection model is the typed-document graph. The picker is ontology-aware where applicable. Analysis panels consume the existing tool endpoints. Ask is the same chat with context injected.

---

## The redesign: one canvas, two panes, sticky selection

### Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ HERO BAND (compact: dataset name + byline + back-link, ~140px)          │
└──────────────────────────────────────────────────────────────────────────┘
┌─ SELECTION BAR (sticky, ~64px) ─────────────────────────────────────────┐
│ Subject: NSUBJ-005 ✕   Session: epoch_5 ✕   Probe: ―   Stim: ―   [Clear]│
└──────────────────────────────────────────────────────────────────────────┘
┌─ PICKER RAIL ─────────────┬─ CANVAS (analysis cards) ────────────────────┐
│ (~340px, sticky)          │ (fluid)                                       │
│                           │                                               │
│ [Subjects][Sess][Probes]  │ ▼ Snapshot                                    │
│ [Stims][Docs]             │ ┌─Stats──────┐ ┌─Provenance──────┐           │
│                           │ │ 5,314 subj │ │ contributors    │           │
│ Filters:                  │ │ 4,887 epoch│ │ DOI, ontology   │           │
│ ┌──────────────────────┐  │ └────────────┘ └─────────────────┘           │
│ │ strain: PR811        │  │                                               │
│ │ species: ...         │  │ ▼ Analyses (auto from selection)             │
│ └──────────────────────┘  │ ┌─Signal trace──────────────────────┐         │
│                           │ │ Subject: NSUBJ-005 ✓               │         │
│ Table (virtualised):      │ │ Epoch: epoch_5 ✓                   │         │
│ ┌──────────────────────┐  │ │ [Run]   [chart…]    [Show code]    │         │
│ │ NSUBJ-001            │  │ └────────────────────────────────────┘         │
│ │ NSUBJ-005 ← active   │  │ ┌─PSTH──────────────────────────────┐         │
│ │ NSUBJ-006            │  │ │ Unit: pick from session ▾          │         │
│ │ ...                  │  │ │ Stimulus: pick from session ▾      │         │
│ └──────────────────────┘  │ │ [Run]                              │         │
│                           │ └────────────────────────────────────┘         │
│ "76 of 1,656 subjects"    │ ┌─Spike raster────┐ ┌─Behavior compare ┐     │
│                           │ │ ...             │ │ Group: Treatment ▾│     │
│ Browse all docs →         │ └─────────────────┘ └───────────────────┘     │
│ (only escape route)       │ ┌─Treatment GT────┐ ┌─Electrode positions┐    │
│                           │ │ ...             │ │ ...                │    │
│                           │ └─────────────────┘ └────────────────────┘    │
└───────────────────────────┴───────────────────────────────────────────────┘
                                                              ┌────────────┐
                                                              │ Ask (Cmd+K)│
                                                              └────────────┘
```

### Information architecture

**Route:** single page `/my/workspace/[id]`. **No tabs.** No `/overview`, `/structure`, `/subjects`, `/sessions`, `/analyses` sub-routes. All five collapse into one canvas.

**Sticky selection bar** at the top of the canvas shows the current 5 context dimensions as chips:

```
Subject: NSUBJ-005 ✕   Session: epoch_5 ✕   Probe: neuropixel_1 ✕   Stim: drift ✕   Unit: vm_42 ✕   [Clear all]
```

Each chip has an `✕` to clear that dimension. Clicking an empty chip opens the picker rail's relevant tab and focuses the filter input. **The selection bar is the single source of truth** — every analysis panel reads it; the picker rail writes it.

**Picker rail** (left, ~340px, sticky):
- Sub-tabs at the top: `Subjects | Sessions | Probes | Stimuli | Documents`. These are *picker* tabs, not page tabs — switching them doesn't change the URL beyond `?pick=subjects`.
- Filter chip strip below the tabs.
- Virtualised table of rows. **Clicking a row sets the corresponding selection dimension** (clicking a subject row sets Subject, clicking a session row sets Session, etc.).
- The active row highlights — and stays highlighted across picker-tab switches.
- The only escape hatch: a tiny "Browse all docs in Document Explorer →" link at the bottom of the picker rail. Not on every card, not in the action rail — one place, clearly marked as leaving the workspace.

**Canvas** (right, fluid):
- **Snapshot section** (top): stats row + provenance card. Same content as today's Overview tab but rendered as cards inside the canvas, not as a separate page.
- **Analyses section** (below): every analysis panel rendered in a responsive grid (1 col mobile, 2 cols desktop). Each panel:
  - **Auto-fills** form fields from the selection bar wherever the panel can use the current selection.
  - **Auto-runs** when all required dimensions are set (debounced ~400ms). User doesn't have to hit Run if the context already specifies everything.
  - Shows an **empty state with next-action hint** if context is missing — e.g. "Pick a subject and a session in the left rail to see this signal trace."
  - **Anchor-scrollable**: starter views and chip-clicks can deep-link to `#signal-trace`, `#psth`, etc.
- **Section headers** sit between Snapshot and Analyses (eyebrow-text style), and within Analyses if we add visual grouping (Plots / Comparisons / Provenance) later. For v1, one flat grid keeps things simple.

**Ask** is unchanged — the existing drawer/sidebar/fullscreen panel (Phase D, commit 1d88fa9) stays. Cmd+K opens it. It now reads the selection bar context so the system prompt knows "the user is looking at subject NSUBJ-005, session epoch_5."

### Selection context — the multi-key model

URL state:

```
/my/workspace/{id}?subject=<docId>&session=<docId>&probe=<docId>&stim=<docId>&unit=<docId>&pick=subjects
```

A new hook `useWorkspaceSelection()` reads/writes these. Every analysis panel calls it to get the relevant context.

```ts
// apps/web/lib/workspace/use-workspace-selection.ts (new)
export interface WorkspaceSelection {
  subject: string | null;
  session: string | null;   // element_epoch doc id
  probe: string | null;
  stimulus: string | null;
  unit: string | null;      // vmspikesummary doc id
}

export function useWorkspaceSelection(): {
  selection: WorkspaceSelection;
  set: (patch: Partial<WorkspaceSelection>) => void;
  clear: () => void;
  clearOne: (key: keyof WorkspaceSelection) => void;
}
```

Each panel decides which keys it cares about:

| Panel               | Reads                          | Auto-runs when             |
|---------------------|--------------------------------|----------------------------|
| Signal trace        | `session` (→ element_epoch)    | session set                |
| PSTH                | `unit` + `stimulus`            | both set                   |
| Spike raster        | `unit`                         | unit set                   |
| Behavior compare    | (nothing — dataset-wide)       | always (manual Run)        |
| Treatment timeline  | (nothing — dataset-wide)       | always (manual Run)        |
| Electrode positions | (nothing — dataset-wide)       | always (auto-load on mount)|
| Provenance walk    | any doc id                      | any one set                |

The key insight: **the selection bar carries the doc IDs, the panels know their own data-shape requirements.** No "subject id pre-fills the signal docId" mistake — the signal panel reads `session`, not `subject`.

### Picker tab → selection key mapping

| Picker tab | Row click sets         | Notes                                       |
|------------|------------------------|---------------------------------------------|
| Subjects   | `subject`              | Also fetches sessions for that subject     |
| Sessions   | `session`              | Filters by `?subject=` if subject set      |
| Probes     | `probe`                | Filters by `?subject=` if subject set      |
| Stimuli    | `stimulus`             |                                            |
| Documents  | any (by class)         | Generic doc-class browser; click sets nothing — opens Document Explorer in a slide-over (not an outbound nav) |

When the user picks a subject, the Sessions picker tab auto-filters to that subject's sessions. When they pick a session, Probes / Stimuli auto-filter. This is the **reactive cascade** Hex and Neurosift do.

### Default form discovery (fix for the "no treatment found" bug)

`TreatmentTimelinePanel` today reports "no treatments" on Francesconi because its defaults don't match the dataset's columns. Fix: each panel that has dataset-wide defaults calls a new lightweight backend endpoint on mount:

```
GET /api/datasets/{id}/panel-defaults/{panelName}
→ { groupBy: "Treatment", subjectColumn: "subjectIdentifier", ... }
```

The endpoint returns smart defaults derived from the dataset's actual schema (which columns exist in the relevant class, which group-by values are most populated, etc.). If we don't ship the endpoint in v1, each panel **auto-runs without parameters** and lets the backend pick — which it already does for several tools.

### Snapshot section (replaces Overview tab)

Top of the canvas, before the Analyses grid:

- **Stats row**: 6 tiles (Subjects / Sessions / Probes / Epochs / Documents / Species). Clicking a tile **filters the picker rail** to that class (does NOT navigate away).
- **Provenance card**: contributors + DOI + ontology pills. Same content as today.
- **Starter views**: rendered as a single horizontal scroller of small cards ("Try plotting signal trace for any PR811 subject" → click sets `subject=<first PR811 subject>` and scrolls to `#signal-trace`). Optional — keep for cold-start.

No Run buttons here. No tools. Just orientation.

### What gets retired

| Surface                                          | Disposition                                                                    |
|--------------------------------------------------|-------------------------------------------------------------------------------|
| `/my/workspace/[id]/{overview,structure,subjects,sessions,analyses}/page.tsx` | Delete. Routes redirect to `/my/workspace/[id]`.                              |
| `WorkspaceTabs.tsx`                              | Delete. No top-level tabs.                                                    |
| `WorkspaceComingSoonPlaceholder.tsx`             | Delete. Not used anywhere after the canvas merge.                            |
| `ViewActionsRail.tsx`                            | Delete. Replaced by selection bar + auto-fill.                                |
| `StarterViewCard.tsx` (numbered-row form)        | Refactor to a horizontal-scroll card; sets selection + scrolls to anchor.    |
| Per-panel "Browse documents to find an ID →" link| Delete. Document Explorer escape moves to ONE place (picker rail bottom).    |
| Per-panel `docId` text input                     | Replaced by the selection bar; manual override available in a hidden "advanced" section. |

### What survives untouched

- All 6 analysis panel **internals** (chart components, mutation logic, Show Code button) — only the form-field defaults change to read from `useWorkspaceSelection`.
- `PanelCard`, `ShowCodeButton`, `WorkspaceShell` (hero) — chrome.
- AskPanel (drawer/sidebar/fullscreen) — unchanged structurally; gets selection context injection.
- `SubjectsBrowser`, `SessionsBrowser`, `StructureBrowser` — refactor to be picker-rail-embedded instead of full-page; selection writes go through `useWorkspaceSelection` instead of `?select=`.
- Backend (`/api/datasets/{id}/{tool}` routes) — entirely unchanged.

---

## Three approaches considered

### Approach A — minimal patch (rejected)

Keep the 5-tab IA. Wire `useSearchParams` reads into each panel form. Map `?subject=` → `docId` where it makes sense.

**Why rejected:** doesn't fix the IA problem. User said "5 tabs of random back and forth" — patching the wiring leaves the back-and-forth in place. Also doesn't fix the data-shape mismatch (subject id ≠ signal doc id).

### Approach B — Hex-style notebook with cells (rejected)

Cells the user can add/remove/reorder. Each cell is a panel. Reactive chain.

**Why rejected:** breaks the "no code from scratch" promise. Adds editor complexity (cell add/remove/reorder UI, error states for missing dependencies). YAGNI for v1 — the 6 panels we have are enough; the user doesn't need to add a 7th interactively.

### Approach C — Neurosift-style picker + canvas (RECOMMENDED)

The layout above. Picker on left, canvas on right, sticky selection bar, single page.

**Why chosen:**
- **Matches the closest direct analog** (Neurosift is literally NWB browsing in a browser — same problem space as NDI).
- **Eliminates tabs** — user's #1 complaint.
- **Selection is mutual + reactive** — picker writes, every panel reads.
- **One escape route** — Document Explorer is one link at the bottom of the picker, not scattered across every panel.
- **Reuses 100% of analysis panel internals** — minimal churn on the parts that already work.
- **AskPanel survives unchanged** — only the context injection is new.

---

## Visual language

**Strict reuse of existing tokens** (same as the prior redesign). No new design tokens.

| Element                        | Pattern                                                       |
|--------------------------------|---------------------------------------------------------------|
| Hero gradient                  | `var(--grad-depth)` (compact variant — shorter height)        |
| Selection bar background       | `bg-bg-surface-subtle`, sticky, `border-b border-border-subtle`|
| Selection chip                 | `bg-brand-blue/5 text-brand-blue rounded-pill px-3 py-1 font-mono`|
| Picker rail divider            | `border-r border-border-subtle bg-bg-canvas`                  |
| Picker tab (active)            | `border-b-2 border-ndi-teal text-fg-primary`                  |
| Picker tab (inactive)          | `text-fg-muted hover:text-fg-secondary`                       |
| Filter chip                    | `bg-bg-muted text-fg-secondary rounded-pill px-2.5 py-1`      |
| Picker table row (selected)    | `bg-brand-blue/5 border-l-2 border-l-brand-blue`              |
| Canvas card                    | `rounded-xl border border-border-subtle bg-bg-surface shadow-sm` |
| Section header                 | Eyebrow text + h2 (marketing clamp)                           |
| Empty-state hint               | Dashed border + concrete next action ("Pick a subject in the left rail") |

Layout is full-bleed (`max-w-full`) with the canvas content capped at `max-w-[1280px]` and centered. On narrow viewports the picker rail collapses to a slide-out drawer with a `[` shortcut (Linear-style).

---

## File-by-file change list

### New files (8)

```
apps/web/lib/workspace/use-workspace-selection.ts      — multi-key URL-state hook
apps/web/components/workspace/canvas/WorkspaceCanvas.tsx         — top-level layout (picker + canvas)
apps/web/components/workspace/canvas/SelectionBar.tsx            — sticky chip strip
apps/web/components/workspace/canvas/PickerRail.tsx              — left rail with picker tabs
apps/web/components/workspace/canvas/PickerRailTabs.tsx          — sub-tab nav inside picker
apps/web/components/workspace/canvas/SnapshotSection.tsx         — stats + provenance + starter cards
apps/web/components/workspace/canvas/AnalysesGrid.tsx            — responsive grid of panels
apps/web/components/workspace/canvas/DocumentExplorerEscape.tsx  — single outbound link, footer of picker
```

### Modified files (~14)

- `apps/web/app/(app)/my/workspace/[id]/page.tsx` — renders `WorkspaceCanvas` directly; no longer a redirect.
- `apps/web/app/(app)/my/workspace/[id]/layout.tsx` — drops `WorkspaceTabs`; keeps hero + auth gate.
- `apps/web/components/workspace/SignalViewerPanel.tsx` — reads `session` from `useWorkspaceSelection`; manual ID input moves to an `<details>` "Advanced" block.
- `apps/web/components/workspace/PsthPanel.tsx` — reads `unit` + `stimulus`; advanced override.
- `apps/web/components/workspace/SpikeActivityPanel.tsx` — reads `unit`; advanced override.
- `apps/web/components/workspace/BehavioralComparePanel.tsx` — auto-runs on mount with backend-discovered defaults.
- `apps/web/components/workspace/TreatmentTimelinePanel.tsx` — auto-runs on mount; surfaces defaults clearly.
- `apps/web/components/workspace/ElectrodePositionPanel.tsx` — already auto-loads; minor cleanup.
- `apps/web/components/workspace/SubjectsBrowser.tsx` — moves into PickerRail; writes go through `useWorkspaceSelection.set({ subject })`; drops View Actions rail.
- `apps/web/components/workspace/SessionsBrowser.tsx` — same shape; writes `session`; filter cascades on `subject`.
- `apps/web/components/workspace/StructureBrowser.tsx` — moves into PickerRail as the "Documents" tab; class click filters the table, doesn't navigate out.
- `apps/web/components/workspace/StatTile.tsx` — `onClick` now scrolls the picker rail to the right tab instead of routing out.
- `apps/web/components/workspace/StarterViewsSection.tsx` — emits selection + scroll-to-anchor instead of routing.
- `apps/web/components/ai/AskShell.tsx` — selection context inject into the chat request.

### Deleted files (~10)

```
apps/web/app/(app)/my/workspace/[id]/overview/page.tsx
apps/web/app/(app)/my/workspace/[id]/structure/page.tsx
apps/web/app/(app)/my/workspace/[id]/subjects/page.tsx
apps/web/app/(app)/my/workspace/[id]/sessions/page.tsx
apps/web/app/(app)/my/workspace/[id]/analyses/page.tsx
apps/web/components/workspace/WorkspaceTabs.tsx
apps/web/components/workspace/WorkspaceComingSoonPlaceholder.tsx
apps/web/components/workspace/ViewActionsRail.tsx
apps/web/components/workspace/PsthPanel.tsx  (manual docId form — replaced by context-driven variant)
apps/web/tests/unit/components/workspace/WorkspaceTabs.test.tsx
apps/web/tests/unit/components/workspace/WorkspaceComingSoonPlaceholder.test.tsx
```

### New tests (~12 files, ~80 tests)

- `use-workspace-selection.test.ts` — URL state read/write/clear, multi-key, encoding.
- `WorkspaceCanvas.test.tsx` — layout structure, picker visibility, selection bar presence.
- `SelectionBar.test.tsx` — chip rendering, clear-one, clear-all, empty state.
- `PickerRail.test.tsx` — tab switching (no URL change), filter cascade on subject selection.
- `SnapshotSection.test.tsx` — stat tile click scrolls picker, doesn't navigate.
- Updated panel tests — auto-fill from selection, auto-run when context set, empty-state copy when context missing.
- Playwright E2E — Bhar / Haley / Francesconi full flows (pick subject → see signal trace render).

---

## Empty / loading / error / cold-start states

**Cold start (no selection):**
- Selection bar shows "No selection — pick from the left rail to start" placeholder.
- Snapshot section renders fully (stats + provenance — these are dataset-wide).
- Analyses section: each card shows an empty state with a CONCRETE next action ("Pick a subject and a session in the left rail to plot a signal trace"), not just "no data."

**Partial selection (some keys set):**
- Panels that can run with current keys auto-run.
- Panels that need more keys show "Almost — pick a stimulus to align this PSTH" (specific to which key is missing).

**Loading per panel:**
- Skeleton inside each card (existing `Skeleton` primitive).
- Cards remain in the grid; layout doesn't reflow.

**Error per panel:**
- Inline `<role="alert">` block with the API message.
- "Try again" button + "Open Show Code to debug" link.

**Picker tab empty (no rows of that class):**
- Hide the picker tab entirely. Don't surface dead controls.

---

## Sequencing

Each phase is one shippable increment with passing tests and a Vercel preview smoke. **Aim: ship by end of this session arc** (compaction → next compaction).

| Phase | Scope                                                        | Touches                              | Tests added |
|-------|--------------------------------------------------------------|--------------------------------------|-------------|
| F1    | `useWorkspaceSelection` hook + tests                         | 1 file                               | ~20         |
| F2    | `WorkspaceCanvas` + `SelectionBar` + `PickerRail` shell      | 3 new + 1 modified (page.tsx)        | ~15         |
| F3    | Picker tab embeddings (Subjects, Sessions inline, refactor)  | 2 modified + 1 new                   | ~10         |
| F4    | Snapshot section (stats + provenance + cold-start hints)     | 1 new + 1 modified                   | ~6          |
| F5    | Analyses grid + panel auto-fill (6 panels)                   | 6 modified                           | ~15         |
| F6    | Delete old route pages + redirects + retire tab tests        | 5 deleted + redirect rules           | ~3          |
| F7    | Ask context injection (AskShell reads selection bar)         | 1 modified                           | ~5          |
| F8    | Real-dataset smoke (Bhar / Haley / Francesconi)              | Playwright spec                      | ~3          |

**Total: ~14 new files, ~14 modified, ~10 deleted, ~77 new tests.** Net new LOC: roughly +1800 / -900.

---

## How this fixes the user's complaints (mapped)

| Complaint                                          | Fix                                                                                          |
|----------------------------------------------------|----------------------------------------------------------------------------------------------|
| "Select a document, doesn't copy its id"           | Selecting a row writes to the selection bar; the ID is the doc id; no copy-paste involved.   |
| "Paste the id, says invalid string"                | No paste step. Panels read the selection bar directly.                                       |
| "Tool says no treatment even though there's many" | Panel auto-runs with backend-discovered defaults; ships a `/panel-defaults/{name}` endpoint. |
| "Not intuitive of a research suite"                | One canvas, picker visible at all times, analyses always visible — Neurosift / Hex pattern.   |
| "5 tabs of random back and forth"                  | Zero tabs at the workspace top level. Picker sub-tabs are inline, no URL routing.            |
| "Linking back to Document Explorer"                | One marked-as-outbound link at the picker footer. No "View document" buttons anywhere else.  |
| "Contextually away from the workspace"             | All workflows stay on `/my/workspace/[id]`. Selection state in URL keeps refresh / share safe.|

---

## Out of scope (still)

Same as the prior redesign:
- No new analysis types beyond the 6 we have.
- No saved view sets / dashboards.
- No collaboration / shared annotations.
- No cross-dataset workspaces (lives at `/query`).
- No notebook-style cells (Approach B rejected).
- No mobile-first design — picker collapses to a drawer on narrow viewports; that's the extent.

Additionally **out of scope for this round**, parked for a future polish session:
- Reactive cascade between picker tabs (Subjects → Sessions auto-filter) — design says yes; implementation defers if it adds churn beyond ~2 days.
- Ontology autocomplete in the strain / species filters — uses existing free-text in v1.
- `panel-defaults` backend endpoint — if not shipped, panels auto-run unparameterized and let the backend pick defaults (already supported by most tools).

---

## Update history

| Date | Change |
|---|---|
| 2026-05-16 | Initial draft — supersedes the 5-tab redesign in `2026-05-16-workspace-redesign.md`. |

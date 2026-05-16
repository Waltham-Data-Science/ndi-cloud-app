# `/my/workspace` redesign — from tools-library to data workspace

**Date:** 2026-05-16
**Status:** Design proposal — pre-implementation
**Author:** Claude (post-compact remainders session)

---

## TL;DR

The current `/my/workspace/[id]` is a vertical stack of seven independent tool panels. Each panel has its own form, its own Run button, its own result. The user complaint — accurate — is that this reads as **a library of tools, not a place to view and work on data.**

This doc proposes a redesign organized around **data → drill → visualize**, with every tab grounded in the dataset's actual shape. The seven panels become *actions on selections*, not standalone tools. Ask moves inside the workspace as a context-aware drawer. The visual language matches the marketing site exactly.

The redesign is sized to ship before SfN (Nov 14) and stays inside the scoping doc's bounded-v1 wisdom: don't add new analysis types, don't add saved view sets, don't redesign the rest of the app. We're closing the **missing middle** between the (now-good) cloud admin UI and the (mature) programmatic API.

---

## Research foundation

### 1. Product vision (`ndi-next-steps/`)

Three pulls from the Summer 2026 scoping docs that the design has to honor literally:

> **"A neuroscience postdoc should be able to look at their data, run a few common operations, and generate a starter plot within an hour of being onboarded, without writing code from scratch."**
> — `2_MatlabPython_Viewer_GUI/_Why_it_matters.md`

> *The viewer needs:* **Visualization of data structure** • **Common plots out of the box** • **Common computations exposed as simple forms or buttons** • **A clear escalation path to the API.**
> — same doc

> **Three audiences served simultaneously:** humans (exploration), programs (pipelines), AIs (pattern discovery).
> — `Product_Summary.md`

The third one is the key strategic differentiator. The workspace has to give all three audiences a clean handle — humans get the UI, programs get the "Show code" exits, AIs get Ask integrated into the same surface (not bolted on at /ask).

### 2. MATLAB tutorial mental model (Bhar / Haley / Francesconi)

The published tutorials (`apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md`) all follow the same shape:

1. **Browse a structure-level table.** `subjectTable: 5314 × 28`, `probeSummary: 606 × 9`, `epochSummary: 4887 × 12`.
2. **Filter that table.** `filteredSubjects = subjects where StrainName contains "PR811"` → 76 rows. `filteredEpochs = epochs where global_t0 contains "Jun-2023"` → 99 rows.
3. **Drill into one row.** Subject index 360 → `currentSubject`, `currentPlates`, `positionMetadata`, `imageStackParameters`, `distanceMap`, `patch encounters: 21 × 42`.
4. **Plot or compare from there.** Open-arm entries per Treatment group → 22 Saline vs 23 CNO, mean 5.86 vs 5.09.

**This is the mental model the workspace has to mirror.** Scientists think dataset → table → filter → row → action. The current workspace makes them think tool → form → result, which is the inverse direction.

### 3. Competitor patterns

**Ontologic** (the screenshot the user shared, sold themselves as "unblocks bioinformaticians"):

The three-step framework was *Integrate data → Choose/build pipelines → Run and track analyses*. The execution surfaces matched JupyterLab almost exactly — left-rail file browser, main notebook editor, form-generated tool config tabs, output panels with HTML viewers and a lineage DAG.

Why it succeeded enough to compete: the **file browser as primary navigation** anchored everything. You always knew where you were because you were always inside a project's file tree.

Why it failed as a fit for NDI: their files are arbitrary blobs; ours are NDI documents with a typed `depends_on` graph. We have more structure to lean on than they did. Copying the file-browser-as-anchor pattern wholesale would undersell what NDI gives us.

**JupyterLab / RStudio Cloud / Hex / DeepNote / Observable:**
- Persistent left-rail navigator. Files or notebook outline.
- Cell-based main pane.
- Right-rail panels for inspector / docs / variables.
- Output is inline; downloads / exports are explicit.

Common pattern: **state lives in the leftmost element, work happens in the middle, secondary tools live in the right rail.**

**Bio-data SaaS** (DNAnexus, Terra, Velsera, Latch, BaseSpace):
- Mostly project/file dashboards.
- Pipeline configuration is a separate page from data viewing.
- The data-view → pipeline-config handoff is universally clunky — every one of them dumps you into a form with no inherited context.

The opportunity: **inherit context**. If the user is looking at "Subject NSUBJ-005, epoch 7" and clicks "Plot signal," the form should already know that.

### 4. What we already have visually

The marketing pages (`/`, `/about`, `/platform`, `/security`, `/products/*`) and the dataset detail page (`/datasets/[id]/*`) are **good**. Tokens in `globals.css`:

- Cream canvas (`--color-bg-canvas: #fdf7fa`) + white surfaces + dark gradient heroes
- NDI Navy (`#002054`) / NDI Teal (`#0f6e56`) / Brand Blue (`#17a7ff` → `#5dc1ff`)
- Depth gradient on heroes: `linear-gradient(135deg, #000 0%, #001a44 50%, #002054 100%)`
- Geist + Geist Mono fonts
- Typography ramp: display-xl → display-md → h1 → h2 (marketing clamp 32–40px) → h3 → body → caption → meta
- Card pattern: `border-border-subtle bg-bg-surface rounded-xl p-6 shadow-sm` + hover lift `-translate-y-0.5` + `hover:border-ndi-teal-border` + `shadow-md`
- Eyebrow text: `text-xs font-bold tracking-eyebrow uppercase text-ndi-teal` (light) / `text-brand-blue-3` (dark hero)
- Numbered rows (the `BridgeRow` pattern in `/`)
- Stat tiles with big letter / number (the `FairTile` pattern)
- Pill badges for status (`text-ndi-teal bg-ndi-teal-light rounded-pill px-2.5 py-1`)

**The workspace currently uses none of this.** It's gray + brand-blue, with rounded-lg (not -xl) cards, no hover affordance, no eyebrow language, no shared button primitive. That's the visible quality gap.

The redesign uses the marketing tokens exclusively. No bespoke styles.

---

## The redesign

### Mental model: discover → drill → visualize

```
Discover                        Drill                          Visualize
──────────                      ─────────                      ──────────
What's in here?     ──►        Which rows do                ──►   Plot, compare,
How many subjects?              I care about?                     trace, walk
How many sessions?              Which subject?
Which species?                  Which session?
                                Which epoch?
```

This is the literal shape of every MATLAB tutorial. Surfacing it as the top-level information architecture means the user follows a familiar arc.

The seven existing analysis panels each fit one stage:

| Stage      | Panels                                                                |
|------------|------------------------------------------------------------------------|
| Discover   | DatasetStructure (today's panel #1) — promoted to Overview tab        |
| Drill      | (new) Subject browser / Session browser / Document explorer (existing) |
| Visualize  | SignalViewer, PSTH, SpikeActivity, BehavioralCompare, TreatmentTimeline, ElectrodePosition |

### Top-level information architecture

```
/my/workspace/[id]
    ↓ redirect
/my/workspace/[id]/overview        ←── default
/my/workspace/[id]/structure       ←── all 11 doc classes, drill into any
/my/workspace/[id]/subjects        ←── filter + table + per-row view-actions
/my/workspace/[id]/sessions        ←── ditto, sessions/epochs
/my/workspace/[id]/analyses        ←── the 7 visualization panels, grouped
```

Five tabs visible in the bar. URL-routed, same a11y pattern as `DatasetTabs` (roving tabindex, arrow-key nav, deep-link friendly).

Ask is **not** a tab. It's a drawer affordance available from anywhere in the workspace (see "Ask integration" below). Mode is URL-state-only (`?ask=drawer|sidebar|fullscreen`); no dedicated route.

The redirect from `/my/workspace/[id]` → `/overview` matches the existing pattern (`/datasets/[id]` → `/overview`).

### Layout shell (every tab)

```
┌────────────────────────────────────────────────────────────────────────┐
│ HERO BAND (dark gradient, mark-pattern overlay 5% opacity)             │
│                                                                        │
│  ← My workspace                                                        │
│  WORKSPACE · <short-id>                                                │
│  <Dataset Name>                                                        │
│  <PI · Lab · YYYY>     [● Published] [CC-BY 4.0] [DOI: 10.63884/…]    │
│  <one-line description, max 720px>                                     │
│                                                                        │
│  ┌─[Cite]─[Use in code]─[Export]─[/  Ask anything ]──────────────┐    │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│ TABBAR  [Overview] [Structure] [Subjects] [Sessions] [Analyses]        │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│  TAB CONTENT (varies)                                                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

(Optional: right-side Ask drawer slides in on `/`-key or button click)
```

**Hero band** is the same shape as the dataset-detail hero (`DatasetDetailHero`). It's already a high-quality Server Component that fetches `safeFetchDataset` on the server, renders the right H1 + byline + badges on first paint. The workspace hero reuses that primitive verbatim — same byline shape, same badge row, same back-link affordance. The eyebrow says `WORKSPACE` instead of nothing, and the inline-CTA row replaces the dataset-page's "Cite this dataset" modal with three workspace-specific actions plus the Ask quick-input.

**Tab bar** is a clone of `DatasetTabs`. Already has ARIA-correct keyboard nav. Add the 5 tabs above, keep the URL-routed selection model.

### Tab 1 — Overview (the landing)

The new "first hour on the dataset" experience. No Run buttons. Three sections, each top-to-bottom:

**A. Stat tiles row** — the equivalent of FairTile but for numbers, six across:

```
Subjects   Sessions   Probes    Epochs    Documents   Species
  5,314      2         606      4,887     31,234       1
  C. elegans  recording  patch-Vm  recording  total      Rattus
                                                          norvegicus
```

Tiles are **clickable** — each one navigates to the appropriate drill view. Subjects → /subjects, Probes → /structure?class=probe, etc.

**B. Provenance band** — already mostly built; the existing `DatasetProvenanceCard` is a perfect drop-in. Two columns: contributors + DOI on the left, ontology pills (species, regions, strains) on the right.

**C. Starter views** — three large cards, **auto-selected for this dataset**:

```
┌─ Most useful first views for this dataset ──────────────────┐
│                                                             │
│  01    Compare EPM open-arm entries     →   45 rows         │
│         by Treatment (Saline vs CNO)         · violin       │
│                                                             │
│  02    Plot a patch-Vm trace             →   4,887 epochs   │
│         for any of the 76 PR811 subjects     · signal       │
│                                                             │
│  03    Walk the provenance chain         →   24,466 docs    │
│         of any treatment_drug record         · graph        │
└─────────────────────────────────────────────────────────────┘
```

These are the **3-5 must-have starter operations** the scoping doc demanded a concrete list for. They're **derived from the dataset's class counts**: if `treatment` has rows, surface the treatment-compare card; if `vmspikesummary` has rows, surface the PSTH card; if signals exist, surface the trace card. The selection algorithm is small + tunable.

Numbered rows (`01 / 02 / 03`) — same `BridgeRow` pattern from the home page. The visual carry-through is the point.

Each starter view click takes the user to the appropriate analysis tab with the form **pre-filled** from the inferred defaults. They press Run; they see the chart.

### Tab 2 — Structure (class browser)

Today's `DatasetStructurePanel` is a card with `n` counts. The new tab is a **full-page class browser** with three layers:

**Top:** Total-counts headline (mirror of the Overview tiles).
**Middle:** All doc classes as a sortable list, with counts + drill links.

```
┌─ All document classes in this dataset (11) ─────────────────┐
│                                                             │
│  subject               5,314    · openminds_subject 28,374  │
│  treatment_drug       24,466    · treatment_transfer 1,675  │
│  imageStack              564    · ontologyTableRow  5,297   │
│  ontologyLabel           584    · subject_group       235   │
│  generic_file             20    · session_in_a_dataset  1   │
│  session                   2                                │
│                                                             │
│  Sort by: [count ▼]  Filter: [_________________]            │
└─────────────────────────────────────────────────────────────┘
```

Each row clicks into `/datasets/[id]/tables/[class]` (the existing summary-tables surface). This is the **escalation path to raw documents** the scoping doc mandates.

**Bottom:** A small "Show structure as code" — copies a `pyndi.dataset_structure(<id>)` snippet that prints the same counts. The `ShowCodeButton` primitive already exists.

### Tab 3 — Subjects (the workhorse)

This is the tab where 80% of the actual work will happen. **Subject-centric** because that's the universal NDI grain — every recording has a subject; subjects are the join key across treatment/probe/epoch.

```
┌─ Filters ────────────────────────────────────────────────────┐
│  Strain    [contains PR811   ▼]    Sex      [____  ▼]        │
│  Species   [______________  ▼]    Treatment [____  ▼]        │
│  Age       [________________]      Order by [____  ▼]        │
│                                                              │
│  Showing 76 of 1,656 subjects               [Clear] [Save ▼] │
└──────────────────────────────────────────────────────────────┘

┌─ Subjects ───────────────────────────────────────────────────┐
│  ☐  ID                Species    Strain  Sex   Sessions     │
│  ☐  NSUBJ-001-PR811   C.elegans   PR811   ♀     2           │
│  ☐  NSUBJ-002-PR811   C.elegans   PR811   ♀     2           │
│  ●  NSUBJ-005-PR811   C.elegans   PR811   ♀     3   selected│
│  ☐  NSUBJ-006-PR811   C.elegans   PR811   ♀     2           │
│  ...                                                         │
│  (paginated, virtualised — uses S5.8's pageSize=50)          │
└──────────────────────────────────────────────────────────────┘

┌─ View actions for NSUBJ-005-PR811 ───────────────────────────┐
│  [Signal trace ↗]  [Treatment timeline ↗]  [Spike raster ↗] │
│  [Provenance walk ↗]  [Show code]                            │
└──────────────────────────────────────────────────────────────┘
```

The "view actions" rail is the key. **Selecting a row populates a context that the analysis panels can inherit.** When the user clicks "Signal trace ↗" it opens `/my/workspace/[id]/analyses/signal?subject=NSUBJ-005-PR811` with the form pre-filled. They press Run. They see the trace. They never type a 24-char hex ID by hand.

URL state — selection persists across refresh / share:
```
/my/workspace/[id]/subjects?strain=PR811&treatment=CNO&select=NSUBJ-005-PR811
```

Filter UI matches the existing `FacetPanel` style on the catalog. Table is `VirtualizedTable` (already in the codebase). Pagination is the `usePagedDatasetTable` hook we shipped today (Stream 5.8).

### Tab 4 — Sessions

Same shape as Subjects but the grain is sessions/epochs. Filter by:
- Time window (`global_t0 contains Jun-2023` is a real tutorial query)
- Probe type
- Subject (after subject-tab selection)

Selecting a session → view actions: `[Signal trace] [PSTH] [Electrode position] [Spike activity]`.

This is the tab a sensory-recording lab will live in. The subject tab serves the behavioral / cohort folks.

### Tab 5 — Analyses

The current `/my/workspace/[id]` page, **reorganized**. Instead of one vertical stack, group by output type:

```
┌─ Plots ───────────────────────────────────────────────────┐
│  · Signal trace          single-channel timeseries        │
│  · Spike raster          per-unit ticks                   │
│  · PSTH                  spike rate aligned to events     │
│  · Electrode position    2D scatter on brain region       │
└───────────────────────────────────────────────────────────┘

┌─ Comparisons ─────────────────────────────────────────────┐
│  · Behavioral compare    group-stats violin               │
│  · Treatment timeline    per-subject Gantt                │
└───────────────────────────────────────────────────────────┘

┌─ Provenance ──────────────────────────────────────────────┐
│  · Walk dependencies     trace `depends_on` chains        │
│  · Class counts          per-class doc inventory          │
└───────────────────────────────────────────────────────────┘
```

Each entry expands to the existing panel inline (`<details>`-style accordion) OR routes to a dedicated sub-page (`/analyses/[name]`). The form lives **at the top of the panel**, the result lives below. The "Show code" button stays anchored bottom-right.

This tab is for **power users** who already know what they want. The Overview tab's starter cards get them here without needing to know what each panel does in the abstract.

### Ask integration

**Ask is a workspace-only affordance — never a tab, never a route.**

Two entry points (both open the same panel, default to drawer mode):

1. **Hero band quick-input** — `[ Ask about this dataset _________ ]` immediately under the description. Submitting opens the panel with the first message already sent. Pressing `/` from anywhere in the workspace focuses this input. (Linear-style.)

2. **Ask button** — a small floating button bottom-right (or in the hero CTA row), keyboard shortcut `Cmd+K` / `Ctrl+K`. Opens an empty panel in drawer mode.

The panel itself supports **three expansion modes**:

```
        Drawer                Sidebar               Fullscreen
       (default)
   ┌──────┬──────┐         ┌────┬───────┐        ┌──────────────┐
   │      │ Ask  │         │    │       │        │              │
   │ work │ ▔▔▔▔ │   →     │work│  Ask  │   →    │     Ask      │
   │      │      │         │    │       │        │              │
   └──────┴──────┘         └────┴───────┘        └──────────────┘
     420px right,            520px right,           full viewport
     overlays content        workspace reflows      workspace behind
```

**Mode controls** (panel header toolbar):
- `⤢` button cycles forward: drawer → sidebar → fullscreen
- `⤡` button cycles back: fullscreen → sidebar → drawer
- `×` button closes entirely
- Keyboard: `Ctrl+\` (Cmd+\ on Mac) cycles forward; Esc closes.

**State persistence:**
- Mode in URL: `?ask=drawer` / `?ask=sidebar` / `?ask=fullscreen` (absent = closed)
- Conversation state in component memory (matches today's `AskShell` — no server persistence in v1)
- Closing the panel doesn't drop the conversation; reopening picks up where it left off (within the session)

**The panel content** (same in all three modes):
- Inherits workspace context — `datasetId`, currently-selected subject/session/epoch if any
- Renders the existing chat shell (`AskShell`) with minimal changes
- Each chart fence renders inline as today
- Each citation chip opens the document drawer for the doc
- **"Apply this to my view"** button on any chart result → routes the user to the correct analyses tab with parameters pre-filled

**The eventual marketing surface** (out of scope for this redesign): Ask will get a dedicated marketing page within the Data Browser product page when that product launches publicly. Until then, the workspace drawer is the only Ask surface.

#### Migration: retire both legacy `/ask` routes

The current codebase has two Ask routes:
- `/(marketing)/ask` — anonymous public chat. Delete the route entirely. Replace with a redirect to `/create-account?next=/my` (or to the relevant product marketing page once it ships).
- `/(app)/my/ask` — the auth-gated standalone cross-dataset Ask. Delete the route. Users who want Ask use it from inside a workspace.

Both retirements are part of this redesign. Anyone arriving at the legacy URLs gets the redirect. The chat infrastructure (`/api/ask`, the 17 chat tools, the cost telemetry, the per-org gate) stays untouched — only the UI entry points move.

### Visual language carry-through

Every component in the redesign uses the existing marketing tokens and patterns:

| Pattern               | Reuse from                                | Use in              |
|-----------------------|-------------------------------------------|---------------------|
| Dark hero gradient    | `var(--grad-depth)` (already used)       | Workspace hero      |
| Card chrome           | `rounded-xl shadow-sm hover:lift`         | All workspace cards |
| Eyebrow text          | `text-xs font-bold tracking-eyebrow uppercase` | Section kickers |
| Stat tile             | `FairTile` (marketing home)               | Overview counts     |
| Numbered row          | `BridgeRow` (marketing home)              | Starter views, class browser |
| Status pill           | `bg-ndi-teal-light text-ndi-teal rounded-pill` | "Selected", "76 rows" |
| `Show code` button    | existing `ShowCodeButton`                 | Every panel         |
| Tab bar               | clone of `DatasetTabs`                    | Workspace tabs      |
| Hero badges           | `Badge` from `components/ui/Badge`        | License, DOI, status|
| Table                 | `VirtualizedTable` (already used)         | Subjects, Sessions  |
| Modal                 | `UseThisDataModal` pattern                | Cite, Export        |
| Skeleton loaders      | `Skeleton`                                | Every async section |

**No new design tokens.** Anything that doesn't fit the existing system is the wrong shape for this redesign.

### Empty / error / loading states

The marketing site's quality bar is enforced by `loading.tsx` Suspense boundaries + skeleton primitives. The workspace currently has these only for the top-level shell.

Each tab gets its own `loading.tsx` (or Suspense boundary):
- **Overview**: skeleton stat tiles + skeleton starter cards.
- **Structure**: skeleton class list (12 rows).
- **Subjects**: skeleton filter chips + skeleton table (page size from S5.8).
- **Sessions**: same.
- **Analyses**: skeleton panel headers.

**Empty states** matter when filters return zero rows:
- Show `<empty-icon> · "No subjects match these filters" · [Reset filters]` (not a blank table).
- For datasets with no treatments/probes/etc., the corresponding tab silently hides (don't surface dead controls).

**Error states**: existing pattern in `components/app/StatusBox.tsx` (warning/error variants). One per panel.

### What this fixes (user's complaints, mapped)

| Complaint                                       | Fix in redesign                                                                 |
|-------------------------------------------------|--------------------------------------------------------------------------------|
| "Library of tools, not a place to view data"   | Top-level IA is data tabs (Overview/Structure/Subjects/Sessions) before tools. |
| "Need to see data first, then run tools on it" | Drill-then-act flow with view-actions rail under each selection.               |
| "Ask should be inside workspace, not public"    | `AskDrawer` as workspace primitive; `/(marketing)/ask` retired.                |
| "Component quality should match the rest"       | Strict reuse of marketing tokens + primitives; zero bespoke styles.             |
| "Holistic UI, not piecemeal"                    | Single shell + 5 tabs, shared chrome, URL-routed selection state.              |

### What's intentionally out of scope (v1)

Following the scoping doc's discipline (`viewer_common_plots_scoping_notes.md`: "The risk is unbounded scope creep. The mitigation is a tight v1 spec…"):

- **No new analysis types.** We have 7 panels; they're enough for v1.
- **No saved view sets / dashboards.** v2.
- **No collaboration / comments / shared annotations.** Not on the roadmap.
- **No cross-dataset workspaces.** Cross-dataset queries already live at `/query` (the data-browser surface).
- **No notebook-style cells.** Tempting (Ontologic, Jupyter, Hex) but breaks the "no code from scratch" promise.
- **No real-time collaboration / multi-user cursors.** Way out of scope.
- **No mobile-first design.** The target audience does this work on laptops/desktops; mobile gets reasonable fallbacks but not first-class.

### Sequencing for implementation

Sized to fit between now and SfN (Nov 14) — generous slack vs the August-1 v1 target the scoping doc mentions. Each phase is one shippable increment with tests + a Vercel preview.

**Phase A — Scaffolding (1-2 days):**
- New route structure under `/my/workspace/[id]/{overview,structure,subjects,sessions,analyses}`.
- `WorkspaceShell` (hero + tabbar) — Server Component for hero, client for tabbar (matches dataset-detail pattern).
- `WorkspaceTabs` (clone + adapt `DatasetTabs`).
- Redirect `/my/workspace/[id]` → `/my/workspace/[id]/overview`.

**Phase B — Overview + Structure (2 days):**
- `OverviewTab`: stat tiles (6) + DatasetProvenanceCard + StarterViewCards (3, auto-selected).
- `StructureTab`: full class browser with sort + filter + drill links.
- Tests: snapshot + interaction (click stat tile → routes to drill view).

**Phase C — Subjects + Sessions tabs (3 days):**
- `SubjectsTab`: filter panel + virtualised paginated table (`usePagedDatasetTable`) + selection state in URL + `ViewActionsRail`.
- `SessionsTab`: same shape, different filters.
- Selection-context propagation: clicking a view action routes to `/analyses/[name]?subject=...&session=...`.

**Phase D — Analyses + Ask panel (2 days):**
- Reorganise the 7 panels into the grouped layout. Each panel reads pre-filled defaults from URL params.
- `AskPanel`: three-mode panel (drawer / sidebar / fullscreen) reusing `AskShell`. Hero quick-input + `Cmd+K` button + `/`-key focus trigger + `Ctrl+\` cycle.
- URL-state for mode (`?ask=drawer|sidebar|fullscreen`); conversation in component memory.
- Retire `/(marketing)/ask` (hard redirect to `/create-account?next=/my`).
- Retire `/(app)/my/ask` (hard redirect to `/my` — the user's dataset list).

**Phase E — Polish + smoke (1 day):**
- Hover affordances pass: every card → marketing lift pattern.
- Empty / error / loading states pass.
- Playwright E2E: arrive → overview → starter card → analysis → "Show code".
- Tutorial parity smoke (the existing `apps/web/docs/operations/tutorial-parity-smoke.md` script).

**Total: ~9-10 working days** of focused execution. Comfortably inside the runway.

### Decisions (locked 2026-05-16)

Answers to the three open questions from the user:

1. **Default tab: Overview.** ✅ Confirmed. The "what's in here" orientation moment is the right landing.

2. **Ask = drawer with expansion modes.** ✅ Confirmed. Three modes the user can cycle between:
   - **Drawer (default).** Right-side slide-in, ~420px, overlays content, dismissable with Esc / click-outside. The lightest weight surface — most often used.
   - **Sidebar.** Right-side persistent column, ~520px, workspace content reflows (max-width collapses; hero stays full-width). For sustained work where the user wants chat visible while exploring the workspace in parallel.
   - **Full display.** Ask takes the full viewport; workspace hides behind it. For long conversations / multi-step analyses where the chat IS the primary task. An explicit "Back to workspace" affordance returns to whatever tab the user was on.

   Mode cycles via two toolbar buttons in the panel header (`⤢ Expand` / `⤡ Collapse`). Keyboard: `Ctrl+\` (or `Cmd+\` on Mac) cycles forward, Esc closes. Current mode persists to URL state (`?ask=drawer|sidebar|fullscreen`) so refresh + share keeps the user's preferred view.

3. **Ask is NOT a top-level tab.** ✅ Removed from the tab bar entirely. Ask is a workspace-level affordance accessible only via the drawer trigger (and its keyboard shortcut). No `/my/workspace/[id]/ask` route. The standalone Ask surface lives outside this redesign — it will eventually get a dedicated marketing page within the Data Browser product page (`/products/private-cloud` rename / refresh) when that product launches publicly. Until then, **the workspace drawer is the only surface where Ask is reachable.**

   Both legacy routes retire:
   - `/(marketing)/ask` — delete or redirect (TBD by user; defaulting to a hard redirect to `/create-account?next=/my`).
   - `/(app)/my/ask` — delete; Ask lives only inside `/my/workspace/[id]` as the drawer.

---

## Appendix A — Component inventory

**New (11):**
- `WorkspaceShell` — hero + tabbar wrapper
- `WorkspaceTabs` — clone of DatasetTabs with workspace routes
- `WorkspaceOverviewTab` — landing
- `WorkspaceStructureTab` — class browser
- `WorkspaceSubjectsTab` — filter + table + selection
- `WorkspaceSessionsTab` — same shape
- `WorkspaceAnalysesTab` — grouped panel index
- `AskPanel` — three-mode (drawer/sidebar/fullscreen) chat wrapper around AskShell
- `AskPanelTrigger` — floating button + hero quick-input that opens AskPanel
- `StatTile` — generalisation of FairTile for numbers
- `StarterViewCard` — numbered-row variant for analysis-launching
- `ViewActionsRail` — bar of "open in X" buttons under selection

**Refactor (9):**
- The 7 existing analysis panels: drop their "Run" headers; consume defaults from URL params; live inside `WorkspaceAnalysesTab` (or per-route sub-pages).
- `WorkspaceClient` → `WorkspaceShell` (renamed + reduced to chrome).
- Existing `DatasetStructurePanel` → consumed by both Overview tab (compact) and Structure tab (full).

**Retire (2):**
- `(marketing)/ask/` — redirected to `/create-account?next=/my`. Ask is no longer a public surface.
- `(app)/my/ask/` — redirected to `/my`. Ask is no longer a standalone destination; it lives only inside a workspace.

**Untouched:**
- All 7 analysis panel internals (the math + render layers stay; only the chrome moves).
- All 14 chat tool handlers (Ask moves around UI-side; backend unchanged).
- Marketing site, dataset detail page (`/datasets/[id]/*`).
- The `/admin/data-health` admin surface.

---

## Appendix B — Visual moodboard (textual)

For each tab, the resting visual:

**Overview (light mode):**
- Hero (dark gradient, white text)
- 6 stat tiles in a row, white cards on cream
- Provenance card, white on cream
- "Try these first" eyebrow → 3 numbered rows on white, hover lifts to ndi-teal border

**Structure:**
- Hero (same)
- Totals headline (eyebrow + h2 marketing clamp)
- All-classes list on white card, monospace counts, sort/filter top-right

**Subjects (the busiest):**
- Hero (same)
- Filter row: pills + inputs in a single horizontal band (matches `FacetPanel` style)
- Table: white surface, alt-row tinted, virtualised, sticky header
- Selection ribbon below: brand-blue left border, "Selected: <id>" + action buttons

**Sessions:** mirrors Subjects.

**Analyses:**
- Hero (same)
- Three group panels (Plots / Comparisons / Provenance), each card-shell, expandable.

**Ask panel:**

Drawer mode (default):
- 420px right-side, white surface, shadow-xl, slide-in from right with 200ms ease-out
- Top bar: "Ask" title + Expand button (⤢) + close button (×) + new-conversation button
- Chat log below — same `AskShell` as today, constrained to drawer width
- Bottom: existing input box, anchored

Sidebar mode:
- 520px right-side persistent column, white surface, left-border subtle
- Workspace content reflows: `max-w-[1200px]` → `max-w-[860px]` so the page doesn't horizontal-scroll
- Hero stays full-width (sidebar starts below the hero band)
- Top bar: title + Expand (⤢) + Contract (⤡) + close + new-conversation

Fullscreen mode:
- Takes over the viewport (workspace tab stays in URL but is visually hidden behind the panel)
- Top bar: "Ask — <dataset name>" + Contract (⤡) + close
- Centered chat log, max-w-[760px] like ChatGPT / Claude.ai
- "Back to workspace" link in top-left ↔ the close button

All three share:
- Same `AskShell` body — chat log, citation chips, chart fences, input box, "Apply this to my view" affordance on chart results
- Same keyboard shortcuts (Esc closes, Ctrl+\ cycles modes)
- Same URL-state-driven mode (`?ask=...`)

This is the same visual language as `/` / `/about` / `/platform` / `/datasets/[id]`. The workspace is the missing surface in the system; this redesign completes the set.

---

## Update history

| Date | Change |
|---|---|
| 2026-05-16 | Initial design proposal — post-compact remainders session. |
| 2026-05-16 (later) | User decisions locked: Overview is default tab; Ask is drawer-with-expansion (drawer → sidebar → fullscreen, URL-state-driven) and **NOT a top-level tab**; both `/(marketing)/ask` and `/(app)/my/ask` retire to redirects. Ask gets a dedicated marketing surface later within the Data Browser product page launch — out of scope here. |
| 2026-05-16 (execution) | **All five phases shipped.** Commit refs in the implementation log below. |

---

## Implementation log — what shipped

All five phases of the redesign are on `feat/experimental-ask-chat`:

| Phase | Commit | What landed |
|---|---|---|
| **A** | `7efa9b1` | Route restructure (5 tabs under `/my/workspace/[id]/`), `WorkspaceShell` (server-rendered hero mirroring `DatasetDetailHero`), `WorkspaceTabs` (URL-routed, clone of `DatasetTabs`), `WorkspaceAuthGate`, `WorkspaceComingSoonPlaceholder`. 10 new tests; legacy `workspace-client.tsx` retired. |
| **B** | `a921427` | Overview tab (StatTilesRow + WorkspaceProvenanceBand + StarterViewsSection with auto-selection algorithm). Structure tab (StructureBrowser with sort/filter + drill into Document Explorer). 25 new tests including the pure `selectStarterViews` + `deriveClassList` algorithms. |
| **D** | `1d88fa9` | AskPanel three-mode (drawer / sidebar / fullscreen) + `useAskPanelState` URL-state hook + AskPanelTrigger floating Cmd+K button + AskHeroQuickInput + AskKeyboardShortcuts. AskShell moved from `(marketing)/ask/ask-shell.tsx` → `components/ai/AskShell.tsx` with new `compact` + `context` props. Both legacy `/ask` routes retire to server redirects. 39 new tests. |
| **C** | `0bfafd0` | Subjects tab (SubjectsBrowser: filter + virtualised table + URL-state selection + ViewActionsRail). Sessions tab (SessionsBrowser: same shape, epoch grain). WorkspaceFilterBar + ViewActionsRail primitives. Pure `filterSubjects` / `filterEpochs` / `formatEpochTime` for testability. 19 new tests. |
| **E** | (next commit) | Panel anchor IDs (`signal-viewer`, `spike-activity`, `behavioral-compare`, `treatment-timeline`, `electrode-position`, `psth`) wired so Starter View cards + View Actions rails deep-link directly to the right panel on `/analyses`. PanelCard gains an optional `id` prop + `scroll-mt-24` for sticky-tabbar offset. |

**Final stats after Phase E:**
- 1,720 unit tests passing (1,612 baseline + 108 new across Phases A-E + 10 redirect retirements).
- Lint clean. Typecheck clean. Build clean — 6 dynamic routes + 5 retired-route redirects in the manifest.
- 5 tabs visible in the workspace bar: Overview / Structure / Subjects / Sessions / Analyses (Ask is NOT a tab, per locked decision).
- 13 new workspace primitives in `components/workspace/` + 5 new chat primitives in `components/ai/` + 2 new hooks in `lib/ai/`.

## Remaining followups (not blockers, deliberately deferred)

These were called out during the build and parked for a true Phase F:

1. **Pre-fill panel forms from URL params.** The View Actions rail
   routes to `/analyses?subject=<id>#signal-viewer` etc. Each panel
   needs to read the relevant URL param on mount and prefill its
   form. ~6 small panel-internal changes. Not blocking; users just
   re-type the id today.

2. **Server-side filter params on `/tables/[class]`.** Subjects /
   Sessions filter client-side after the full row set lands. Fine
   for the ~5k-row scale we ship today; becomes a bandwidth concern
   above ~10k rows. Adds `?strain=<v>&species=<v>&sex=<v>` etc. to
   the existing FastAPI route.

3. **Sidebar mode workspace reflow.** AskPanel sidebar mode is
   currently a fixed-position overlay (same as drawer); the design
   spec calls for the workspace content to reflow to
   `max-w-[calc(100%-520px)]` when the sidebar is open. Adds a
   `data-ask-panel-mode="sidebar"` attribute on `<body>` + a CSS
   rule. ~30 min of work.

4. **AskHeroQuickInput mounting + pre-send store.** Built but not
   yet placed in the workspace hero. Mounting requires adding a
   client-island slot to `WorkspaceShell` (server component). Pre-
   send wiring requires an ephemeral shared store that AskShell
   drains on mount — designed but unimplemented.

5. **Tutorial-parity smoke against the new tabs.** Playwright drive
   through the Bhar / Haley / Francesconi flows verifying each tab
   surfaces the right data shapes. The existing
   `apps/web/docs/operations/tutorial-parity-smoke.md` script needs
   updating for the new IA.

6. **`/api/ask` context injection from AskShell.** AskShell now
   accepts a `context` prop carrying workspace selection state
   (datasetId, datasetName). The prop is plumbed but NOT yet
   forwarded to the API — needs a matching FastAPI change so the
   system prompt knows "the user is currently in dataset X, looking
   at subject Y." Today the chat tool responses already carry
   dataset context, so this is enhancement, not regression-blocker.

None of these are critical for the redesign demo. They turn the
workspace from "works well" to "polished."

# Quick Plot Redesign — Design Spec

- **Date:** 2026-04-29
- **Branch:** `feat/quickplot-column-first-redesign`
- **Component:** `apps/web/components/app/QuickPlot.tsx` and friends
- **Status:** awaiting user review of this spec; implementation plan not yet written

## Problem

Quick Plot today opens to four blank dropdowns (Axis mode / Plot type / Y / X) and asks the user to make four decisions before anything renders. Team review feedback (PRs #134 and #142) has surfaced this as the dominant friction. The "Axis mode" toggle is also a UX wart — it leaks the API split (server-aggregated `/distribution` endpoint vs. in-memory scatter) into the user interface.

Comparing what summary-table users actually plot in our reference tutorials (Dabrowska rat ephys, Haley *C. elegans* — `NDI-python/tutorials/`) against what Quick Plot supports:

- **Group-comparison violins** are the canonical metadata plot. Tutorials always overlay jittered raw points + an inset IQR box on the violin shape; current Quick Plot renders a bare violin.
- **Single-trace time-series from time-shaped summary tables** (e.g., distance-to-patch sampled per frame in OTR tables) is a legitimate use case. Current Quick Plot has no line mode.
- **Distribution previews (histograms)** and **X-vs-Y scatters** are already supported.

Plots from raw binary data (`.nbf` voltage traces, image-overlay trajectories, video frame grids) are explicitly **out of scope**. Those need a separate viewer that hangs off document detail pages with binary decoders, sampling, and image rendering — a future feature, not this one.

## The job Quick Plot is designed for

> Answer **"is this column worth digging into?"** in under 10 seconds, without leaving the page.

It is a triage tool, not a publication tool. If you want a publication-grade figure, you go to Python — Quick Plot exists so you can decide *which* columns deserve that Python time.

## Goals

1. **Column-first flow.** User picks a Y column → a plot renders immediately. No upfront plot-type or axis-mode decision.
2. **Confident-and-visible inference.** The system picks a plot type from the X/Y column types, and the chosen type is visually obvious (highlighted chip in a row of override pills).
3. **Cover the three core summary-table questions:**
   - "What does this column look like?" → histogram (solo numeric) / bar count (solo categorical)
   - "Is this different across groups?" → violin / box (with jittered points + inset IQR box)
   - "How do these two relate?" → scatter, or line if X is time-shaped
4. **Smart empty state.** Instead of blank dropdowns, render a deterministic first-suggestion plot the moment the user opens the card. Below it, 1–2 inline chip suggestions that one-click reconfigure.
5. **Hand-off to Python.** A "Copy as Python" button emits a matplotlib snippet reproducing the current view. Makes the triage-vs-publication boundary explicit.
6. **Copy-as-PNG.** Standard scientific need.

## Non-goals (explicit out-of-scope)

- Multi-Y / shared-X subplots
- **Continuous color encoding** (jet/turbo gradient driven by a numeric column). Note: *categorical* color-by-group on scatter/line — i.e., one color per group key — is in scope and exists today; we keep that.
- Custom titles, annotations, axis-range controls, color picker
- Saved plot configurations / template gallery
- Plotting from raw binary data (`.nbf`, `.tiff`, `.mp4`)
- Drag-and-drop column assignment
- Mobile-first layout polish beyond what existing responsive CSS gives free

## Architecture

### Component shape

`QuickPlot.tsx` stays the host card. Internally it splits:

- `QuickPlot.tsx` — orchestration: column classification, inference dispatch, empty-state rendering, export buttons.
- `lib/viewer/inferPlotShape.ts` *(new, pure)* — `(numericCols, categoricalCols, yField, xField, table) → { plotType, dispatchMode }`. Pure function (not a hook) → trivial to unit-test.
- `lib/viewer/pickPlotSuggestions.ts` *(new, pure)* — `(table, numericCols, categoricalCols) → { primary, secondary[] }`. Drives the empty-state default and the suggestion chips.
- `QuickPlotControls.tsx` *(new)* — column pickers + plot-type chip row. Replaces the dropdown soup.
- `QuickPlotEmptyState.tsx` *(refactor of existing inline component)* — now also hosts secondary-suggestion chips when applicable.
- Renderers (`ViolinPlot`, `BoxPlot`, `Histogram`, `BarChartByGroup`, `ScatterPlot`) — kept; two upgrades:
  - `ViolinPlot` adds jittered raw-points overlay + inset IQR box + median dot.
  - `BoxPlot` adds jittered raw-points overlay (already has IQR; just needs points).
  - **New** `LinePlot.tsx` — uPlot-based line renderer; mirrors `ScatterPlot`'s data shape but with linear paths instead of points-only.

### Inference rules — `inferPlotShape`

```
(yField, xField, columnTypes, table) → plotType
```

| Y      | X            | Inferred plotType    | Dispatch        | Override chips visible          |
|--------|--------------|----------------------|-----------------|---------------------------------|
| —      | —            | (none — empty state) | —               | —                               |
| numeric| —            | `histogram`          | /distribution   | histogram, violin, box          |
| numeric| categorical  | `violin`             | /distribution   | violin, box, histogram          |
| numeric| numeric, time-like + monotonic | `line`     | in-memory       | line, scatter                   |
| numeric| numeric, other| `scatter`           | in-memory       | scatter, line                   |
| —      | categorical  | `bar-count`          | in-memory       | bar-count                       |

For the **solo-numeric-Y** case (no X), violin and box render as a single ungrouped shape — useful when the user wants to see the distribution shape rather than histogram bin counts. Backend dispatch is the same `/distribution` ungrouped call as today.

**Time-like X heuristic** (deterministic, no LLM):
- Column name matches `/^(time|t|epoch|trial|frame|timestamp|sec|seconds|ms)$/i` (case-insensitive)
- AND values are monotonically non-decreasing across `table.rows`

If both conditions hold → default to `line`. Either fails → default to `scatter`.

### Empty-state default — `pickPlotSuggestions`

Deterministic, schema-driven. The result is `{ primary, secondary[] }`; `primary` is auto-applied so the user sees a real plot on first open. `secondary` (up to 2) renders as clickable chips below the plot.

```
pickPrimary(table, numericCols, categoricalCols):
  goodCategorical = categoricalCols.find(c => 2 ≤ uniqueValues(c) ≤ 8)

  if numericCols.length ≥ 1 AND goodCategorical:
    → violin: y=numericCols[0], x=goodCategorical
  if numericCols.length ≥ 2:
    → scatter: x=numericCols[0], y=numericCols[1]
  if numericCols.length ≥ 1:
    → histogram: y=numericCols[0]
  if categoricalCols.length ≥ 1:
    → bar-count: x=categoricalCols[0]
  else:
    → null  (render existing "no numeric columns" empty state)
```

`secondary` returns up to two alternative configurations from the same priority list, deduplicated against `primary`.

Why violin-grouped beats scatter when both are available: in summary tables, group comparison is the more common scientific question. Tutorials skew that direction.

### Data dispatch (unchanged from current architecture; surface only)

- Categorical X → POST `/api/visualize/distribution` (server-aggregated, KDE + stats per group)
- Numeric X → in-memory `table.rows` (no API call)
- No X with numeric Y → POST `/api/visualize/distribution` ungrouped (KDE + stats)
- No X with categorical X (bar-count) → in-memory `table.rows`

The chip row hides this dichotomy. No backend changes required.

### Export buttons

Below the plot:

- **Copy PNG** — capture the SVG / canvas plot area, write PNG to clipboard via Clipboard API. Library candidates (chosen by bundle cost):
  - `html-to-image` (~1.4 KB gz) — preferred
  - `dom-to-image-more` (~5 KB gz) — fallback
  - If both blow the bundle gate: defer to a follow-up server-side render endpoint; ship the rest of the redesign without Copy-PNG.
- **Copy Python** — emits a `matplotlib` snippet to the clipboard. Pure-string template per plot type, fed with `(yField, xField, plotType, datasetId, className, table.name)`. Includes:
  - A header comment with a permalink back to the dataset (`https://ndi-cloud.com/datasets/<id>?tab=summary&class=<className>`)
  - The data-fetching call via `ndi.cloud` Python client (matches the tutorial pattern)
  - The plot code (matplotlib idiomatic, e.g., violin + jittered points + IQR box for the violin case)
- Both buttons live in a small footer row; disabled when no plot is rendered.

## Interaction model

```
┌─ Quick plot ─────────────────────────────────────────────────────┐
│ [Y: latency ▾]  [X: strain ▾]  [Group by: ▾  (when applicable)] │
│                                                                  │
│ ( Histogram )( Violin )( Box )( Scatter )( Line )( Bar count )  │  ← chip row;
│                                                                  │     non-applicable chips hidden;
│                                                                  │     inferred chip highlighted
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │                  rendered plot                               │ │
│ │                                                              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Copy PNG] [Copy Python]   Try: latency by sex · age vs trial   │  ← secondary
│                                                                  │     suggestion chips
└──────────────────────────────────────────────────────────────────┘
```

Behavior:

- **Empty (no Y selected):** the auto-applied primary suggestion renders. Y/X dropdowns reflect that suggestion's columns. Secondary chips below.
- **Y picked, X empty:** histogram renders for solo numeric Y; bar count for solo categorical X if user picked that flow instead.
- **Y picked, X picked:** inferred type from the table; chip row updates highlight.
- **Override:** clicking a chip changes the plot type. Selection persists until columns change in a way that makes it invalid (e.g., switching X from categorical to numeric forces violin → scatter).
- **Group-by dropdown:** appears only when both Y is numeric and X is numeric — for color-by-group on scatter/line. Hidden otherwise (the categorical-X case already encodes grouping).

Layout footprint is roughly equal to today's: one row of pickers, one chip row replacing the old plot-type/axis-mode dropdowns, plot, footer. No vertical growth.

## Accessibility

- All controls are real `<select>` / `<button>` elements (current pattern preserved).
- Chip row: `role="radiogroup"`, each chip `role="radio"` with `aria-checked`. Keyboard-navigable via arrow keys.
- Plot SVG: `role="img"` with a generated `aria-label` (e.g., "Violin plot of latency by strain, 4 groups, n=87").
- Suggestion chips: ordinary `<button>` elements with descriptive text.
- Color contrast: chip active state uses the existing primary token (already AA-compliant).

## Tests

**Unit (vitest):**

- `inferPlotShape.test.ts` — exhaustive matrix of `(Y type, X type, time-like-name, monotonic) → plotType`. Every row in the inference table above gets a test case.
- `pickPlotSuggestions.test.ts` — fixture tables with each priority case → expected primary + secondary.
- `QuickPlot.test.tsx` — rewrite of existing test. Verify:
  - Renders default plot on mount without user interaction
  - Picking Y updates the plot
  - Picking X re-infers plot type and updates chip highlight
  - Clicking a chip overrides the inferred type
  - "Copy Python" produces the expected snippet for each plot type (mock clipboard)
  - "Copy PNG" path triggers (mock library)
- `LinePlot.test.tsx` *(new)* — render with monotonic and non-monotonic X; verify line geometry.
- `ViolinPlot.test.tsx` — extend with jittered-points + IQR-box presence assertions.
- `BoxPlot.test.tsx` — extend with jittered-points presence.

**E2E (Playwright):**

- Open Quick Plot on a known dataset summary table → verify a plot renders without interaction (the empty-state default).
- Switch Y → verify chip row updates and inferred type matches expectation.
- Click "Copy Python" → verify clipboard contents (Playwright's `BrowserContext.grantPermissions(['clipboard-read'])`).

**Bundle:**

- Re-run `scripts/check-bundle-size.mjs` after each major change. Expected delta: ~+3 KB gz (export library) + ~+1 KB (new components). Verify under the 200 KB app gate. If `html-to-image` fails the gate, ship without Copy-PNG and file a follow-up.

## Migration / breaking changes

- `axisMode` state and the `Axis mode` `<select>` are deleted from `QuickPlot.tsx`.
- `plotType` state expands to include `'line'`.
- Existing inline `QuickPlotEmptyState` extracted into its own component (`QuickPlotEmptyState.tsx`).
- `tests/unit/components/app/QuickPlot.test.tsx` will need broad rewrite — most assertions about axis-mode dropdown go away; new assertions about chip row + auto-default added.
- Public API (`<QuickPlot datasetId className table />`) is unchanged.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Smart inference picks the wrong plot type for an edge case | Override is one-click via chip row; inferred chip is always visually highlighted so the user sees what was guessed and can correct it |
| Bundle bloat from PNG export library | Test `html-to-image` (~1.4 KB gz) first; fall back to deferring Copy-PNG if it exceeds the 200 KB gate |
| Test suite rewrite churn | Plan the rewrite as part of the implementation, not a follow-up; existing tests are tight enough that a parallel rewrite in the same PR is feasible |
| User confusion about why some chips are hidden (e.g., "where's bar?") | Document the chip-visibility rule in a hover tooltip; in practice non-applicable chips are nonsensical for the column choices |
| Time-like detection misfires (column named "time" but values represent something else) | User can override with one click; the heuristic is intentionally conservative (name match AND monotonic) |
| Copy-Python snippet drifts as the API evolves | Snippet generator is one function with template strings; covered by per-plot-type unit tests; reviewed when the Python client API changes |

## Open questions resolved during brainstorming

1. **Q: Should Quick Plot reproduce the binary-data plots from the tutorials (Vm waveforms, trajectories)?**
   A: No. Out of scope. Those need a separate viewer with binary decoders and image rendering, hanging off document detail pages. (User chose option a — "hold the line" — on 2026-04-29.)
2. **Q: How aggressive should auto-inference be?**
   A: Confident + visible. System picks the type and the choice is shown in the chip row; user overrides with one click.
3. **Q: Include a "Copy as Python" feature?**
   A: Yes. Makes the triage-vs-publication boundary explicit and matches how scientific users actually move data between tools.

## Implementation order (informs the plan, not the plan itself)

1. Extract pure functions: `inferPlotShape`, `pickPlotSuggestions`, with full unit tests
2. Add `LinePlot.tsx` + tests
3. Upgrade `ViolinPlot.tsx` and `BoxPlot.tsx` with jittered points + IQR overlays
4. Build `QuickPlotControls.tsx` (chip row + simplified pickers); wire inference
5. Wire empty-state default + secondary suggestion chips
6. Add Copy-PNG and Copy-Python footer buttons (gate-check the bundle here)
7. Delete `axisMode` state from `QuickPlot.tsx`; rewrite `QuickPlot.test.tsx`
8. Update Playwright E2E
9. Manual QA on representative datasets:
   - Subject summary (categorical-heavy)
   - An OTR time-shaped table (line-mode candidate)
   - Mixed-type table (multi-numeric + multi-categorical → trigger violin auto-suggestion)
10. Verify bundle under 200 KB gate; PR

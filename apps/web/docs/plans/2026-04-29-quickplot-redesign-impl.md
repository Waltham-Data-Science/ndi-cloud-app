# Quick Plot Column-First Redesign — Implementation Plan

**Goal:** Convert Quick Plot from a 4-dropdown decision tree into a column-first triage tool that infers plot type from column types, renders a default plot on open, and exposes Copy-PNG / Copy-Python escape hatches.

**Architecture:** Two new pure functions (`inferPlotShape`, `pickPlotSuggestions`) drive a chip-row UI (`QuickPlotControls`). Renderers are kept; `ViolinPlot` / `BoxPlot` get jittered-point overlays; new `LinePlot` for time-shaped X. `axisMode` toggle is deleted. Backend dispatch stays the same — selection logic moves into the inference function.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, vitest + Testing Library, uPlot 1.6, d3-array. Adds `html-to-image` (~1.4 KB gz) for Copy-PNG. No backend changes.

**Spec:** [`apps/web/docs/specs/2026-04-29-quickplot-redesign-design.md`](../specs/2026-04-29-quickplot-redesign-design.md)

---

## File structure

**Created:**
- `apps/web/lib/viewer/inferPlotShape.ts` — pure inference function
- `apps/web/lib/viewer/pickPlotSuggestions.ts` — pure suggestion picker
- `apps/web/lib/viewer/pythonSnippet.ts` — per-plot-type matplotlib snippet templates
- `apps/web/components/app/LinePlot.tsx` — uPlot-based line renderer
- `apps/web/components/app/QuickPlotControls.tsx` — chip row + dropdowns
- `apps/web/tests/unit/lib/viewer/inferPlotShape.test.ts`
- `apps/web/tests/unit/lib/viewer/pickPlotSuggestions.test.ts`
- `apps/web/tests/unit/lib/viewer/pythonSnippet.test.ts`
- `apps/web/tests/unit/components/app/LinePlot.test.tsx`
- `apps/web/tests/unit/components/app/QuickPlotControls.test.tsx`

**Modified:**
- `apps/web/components/app/QuickPlot.tsx` — orchestration + Copy-PNG / Copy-Python buttons; delete `axisMode`
- `apps/web/components/app/ViolinPlot.tsx` — add jittered points + inset IQR box + median dot
- `apps/web/components/app/BoxPlot.tsx` — add jittered points overlay
- `apps/web/tests/unit/components/app/QuickPlot.test.tsx` — rewrite for new flow
- `apps/web/package.json` — add `html-to-image`

---

## Task 1: Add `inferPlotShape` pure function (TDD)

**Files:**
- Create: `apps/web/lib/viewer/inferPlotShape.ts`
- Create: `apps/web/tests/unit/lib/viewer/inferPlotShape.test.ts`

- [ ] **Step 1: Write the failing test**

Test the full inference matrix from the spec. Cover: empty inputs, solo-numeric-Y, numeric-Y with categorical-X, numeric-Y with numeric-X (scatter and line cases), no-Y with categorical-X. Verify the time-like X heuristic (name match `/^(time|t|epoch|trial|frame|timestamp|sec|seconds|ms)$/i` AND monotonic non-decreasing values).

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/web && pnpm vitest run tests/unit/lib/viewer/inferPlotShape.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Pure function: `(yField, xField, numericCols, categoricalCols, table) → { plotType, dispatchMode } | null`. Heuristic: time-like = name regex match AND monotonic values across `table.rows[xField]`. Return null when Y is unset (caller falls back to suggestions).

- [ ] **Step 4: Run test to verify pass**

Same command. All cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/viewer/inferPlotShape.ts apps/web/tests/unit/lib/viewer/inferPlotShape.test.ts
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): inferPlotShape pure function + tests"
```

---

## Task 2: Add `pickPlotSuggestions` pure function (TDD)

**Files:**
- Create: `apps/web/lib/viewer/pickPlotSuggestions.ts`
- Create: `apps/web/tests/unit/lib/viewer/pickPlotSuggestions.test.ts`

- [ ] **Step 1: Write the failing test**

Cover the priority order:
1. `numericCols ≥ 1 && groupableCat (2-8 uniques)` → violin
2. `numericCols ≥ 2` → scatter (first two numeric cols)
3. `numericCols ≥ 1` → histogram
4. `countableCat (2-20 uniques)` → bar-count
5. else → null (degenerate table)

Verify the high-cardinality identifier guard (5314-unique column does NOT become a bar suggestion). Verify secondary[] returns up to 2 dedup'd alternatives.

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/web && pnpm vitest run tests/unit/lib/viewer/pickPlotSuggestions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Walk priority list; build primary; walk again excluding primary's plot+columns to build secondary[]. Compute uniqueValues by scanning `table.rows[col]` once per col.

- [ ] **Step 4: Run test to verify pass**

Same command.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/viewer/pickPlotSuggestions.ts apps/web/tests/unit/lib/viewer/pickPlotSuggestions.test.ts
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): pickPlotSuggestions empty-state default + chips"
```

---

## Task 3: Add `pythonSnippet` generator (TDD)

**Files:**
- Create: `apps/web/lib/viewer/pythonSnippet.ts`
- Create: `apps/web/tests/unit/lib/viewer/pythonSnippet.test.ts`

- [ ] **Step 1: Write the failing test**

For each plot type (`histogram`, `violin`, `box`, `scatter`, `line`, `bar-count`) verify the emitted snippet contains:
- A permalink comment with the dataset URL
- A `ndi.cloud.dataset(...)` call with the dataset ID
- The right matplotlib call (`plt.hist`, `ax.violinplot` + jitter overlay, `plt.scatter`, `plt.plot`, `plt.bar`)
- Correct column references for `yField` / `xField`

Also verify safe escaping of column names with quotes / backslashes.

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/web && pnpm vitest run tests/unit/lib/viewer/pythonSnippet.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Switch on `plotType`; per-case template string fed with escaped column names + dataset metadata. One exported `formatPythonSnippet({ plotType, datasetId, className, yField, xField })` function. Internal `escapePyString(s)` helper.

- [ ] **Step 4: Run test to verify pass**

Same command.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/viewer/pythonSnippet.ts apps/web/tests/unit/lib/viewer/pythonSnippet.test.ts
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): per-plot-type matplotlib snippet generator"
```

---

## Task 4: Add `LinePlot.tsx` (mirror ScatterPlot, line geometry)

**Files:**
- Create: `apps/web/components/app/LinePlot.tsx`
- Create: `apps/web/tests/unit/components/app/LinePlot.test.tsx`

- [ ] **Step 1: Write the failing test**

Render with a fixture of 50 rows `(t, distance)`, monotonic t. Verify:
- `data-testid="line-plot"` exists on the container
- A point-count line is shown ("50 points")
- An empty-state message renders when no rows have finite numeric values for both X and Y

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/web && pnpm vitest run tests/unit/components/app/LinePlot.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Copy the `ScatterPlot.tsx` shape: same prop signature `{ rows, xField, yField, groupBy?, xLabel?, yLabel?, height? }`; same data shape transformation; the only difference is the uPlot series config — use `paths: undefined` (uPlot's default linear path) and `points: { show: false }` instead of points-only.

- [ ] **Step 4: Run test to verify pass**

Same command.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/app/LinePlot.tsx apps/web/tests/unit/components/app/LinePlot.test.tsx
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): add LinePlot for time-shaped numeric X"
```

---

## Task 5: Upgrade `ViolinPlot.tsx` — jittered points + inset IQR box + median dot

**Files:**
- Modify: `apps/web/components/app/ViolinPlot.tsx`
- Create: `apps/web/tests/unit/components/app/ViolinPlot.test.tsx`

- [ ] **Step 1: Write the failing test**

Render `<ViolinPlot groups=...>` with 2 groups of n=20 each. Verify:
- `data-testid="violin-points"` element renders ≥ 40 dots (one per raw value)
- `data-testid="violin-iqr-box"` rectangles render (one per group, width ~8% of group slot)
- `data-testid="violin-median-dot"` circles render (one per group)

The existing violin shape SVG continues to render (`data-testid="violin-path"` or similar — confirm in the existing component).

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/web && pnpm vitest run tests/unit/components/app/ViolinPlot.test.tsx
```

Expected: FAIL — assertions about new test IDs fail.

- [ ] **Step 3: Implement**

In `ViolinPlot.tsx`, after the existing violin shape is drawn for each group, draw:
1. Jittered scatter points: for each `value` in the group, plot at `x = groupCenterX + uniformRandom(-jitterWidth, jitterWidth)`, `y = scaleY(value)`, with low opacity. Use a deterministic PRNG seeded by group index so re-renders are stable.
2. Inset IQR box: a `<rect>` from `(groupCenterX - boxWidth/2, scaleY(q3))` to `(groupCenterX + boxWidth/2, scaleY(q1))`. boxWidth ≈ 8% of slot width.
3. Whiskers: `<line>` from `(groupCenterX, scaleY(min))` to `(groupCenterX, scaleY(q1))` and `(groupCenterX, scaleY(q3))` to `(groupCenterX, scaleY(max))`.
4. Median dot: white-filled `<circle>` at `(groupCenterX, scaleY(median))`.

Add `data-testid` attributes to the new `<g>` wrappers.

- [ ] **Step 4: Run test to verify pass**

Same command.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/app/ViolinPlot.tsx apps/web/tests/unit/components/app/ViolinPlot.test.tsx
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): add jittered points + IQR box + median dot to ViolinPlot"
```

---

## Task 6: Upgrade `BoxPlot.tsx` — jittered points overlay

**Files:**
- Modify: `apps/web/components/app/BoxPlot.tsx`
- Create: `apps/web/tests/unit/components/app/BoxPlot.test.tsx`

- [ ] **Step 1: Write the failing test**

Render `<BoxPlot groups=...>` with 2 groups of n=15 each. Verify `data-testid="box-points"` renders ≥ 30 dots.

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/web && pnpm vitest run tests/unit/components/app/BoxPlot.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Same jittered-points pattern as ViolinPlot, drawn to the right of the box (or just over it with low opacity — match what tutorials do, which is overlay).

- [ ] **Step 4: Run test to verify pass**

Same command.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/app/BoxPlot.tsx apps/web/tests/unit/components/app/BoxPlot.test.tsx
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): add jittered points overlay to BoxPlot"
```

---

## Task 7: Add `QuickPlotControls.tsx` — chip row + simplified pickers

**Files:**
- Create: `apps/web/components/app/QuickPlotControls.tsx`
- Create: `apps/web/tests/unit/components/app/QuickPlotControls.test.tsx`

- [ ] **Step 1: Write the failing test**

Render `<QuickPlotControls>` with a fixture and verify:
- Y dropdown lists ONLY numeric columns (no categoricals)
- X dropdown lists all columns plus a "— None —" option
- Chip row renders chips matching `inferPlotShape`'s table for the current X/Y
- The inferred chip has `aria-checked="true"`
- Clicking a non-active chip calls `onPlotTypeChange`
- Chip row uses `role="radiogroup"` and chips use `role="radio"`

- [ ] **Step 2: Run test to verify failure**

```bash
cd apps/web && pnpm vitest run tests/unit/components/app/QuickPlotControls.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Props: `{ table, numericCols, categoricalCols, yField, xField, plotType, onYChange, onXChange, onPlotTypeChange }`. Three dropdowns + chip row. The chip row queries a small `chipsForShape(yField, xField, columnTypes)` function that returns the visible chip set per the spec table.

- [ ] **Step 4: Run test to verify pass**

Same command.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/app/QuickPlotControls.tsx apps/web/tests/unit/components/app/QuickPlotControls.test.tsx
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): chip row controls — column-first picker UX"
```

---

## Task 8: Refactor `QuickPlot.tsx` — wire inference, suggestions, default render

**Files:**
- Modify: `apps/web/components/app/QuickPlot.tsx`

- [ ] **Step 1: Replace component body**

Delete:
- `axisMode` state
- The `Axis mode` `<select>` element
- The `xRequired` / `groupModeCanRun` / `scatterCanRun` branches that were specific to axisMode

Add:
- `useMemo` over `pickPlotSuggestions(table, numericCols, categoricalCols)` to compute primary/secondary
- On mount, if `yField` and `xField` are both empty AND `primary` exists, seed state from `primary`
- `useMemo` over `inferPlotShape(...)` to compute `inferredPlotType`; the user's `plotType` state defaults to `inferredPlotType` and re-syncs when the user changes columns
- Render `<QuickPlotControls>` instead of the inline dropdown row
- Render the secondary suggestion chips below the plot, each as a `<button>` that re-seeds Y/X/plotType
- Keep all existing renderer dispatch (`<ViolinPlot>`, `<BoxPlot>`, `<Histogram>`, `<BarChartByGroup>`, `<ScatterPlot>`); add `<LinePlot>` for `plotType === 'line'`

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm tsc -b --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/app/QuickPlot.tsx
git commit --author="audriB <audri@walthamdatascience.com>" -m "refactor(quickplot): column-first flow — drop axisMode, wire inference + suggestions"
```

---

## Task 9: Add Copy-PNG and Copy-Python footer buttons

**Files:**
- Modify: `apps/web/package.json` (add `html-to-image`)
- Modify: `apps/web/components/app/QuickPlot.tsx`

- [ ] **Step 1: Install html-to-image**

```bash
cd /Users/audribhowmick/Documents/ndi-projects/ndi-cloud-app && pnpm --filter web add html-to-image
```

Expected: package added; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Add the footer row to QuickPlot.tsx**

Below the plot region, render a row with:
- "Copy PNG" button → captures the plot container `<div ref={plotRef}>` via `htmlToImage.toBlob(plotRef.current)`, writes to clipboard via `ClipboardItem` API. Toast / inline confirmation on success; inline error on failure.
- "Copy Python" button → calls `formatPythonSnippet({ plotType, datasetId, className, yField, xField })` and writes the result to `navigator.clipboard.writeText`. Inline confirmation.

Both buttons are disabled when no plot is rendered (no `plotType` or no resolved data).

- [ ] **Step 3: Bundle gate check**

```bash
cd apps/web && pnpm build && node scripts/check-bundle-size.mjs
```

Expected: pass under 200 KB app gate. If fails, gate the Copy-PNG button behind a feature flag and file a follow-up.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json /Users/audribhowmick/Documents/ndi-projects/ndi-cloud-app/pnpm-lock.yaml apps/web/components/app/QuickPlot.tsx
git commit --author="audriB <audri@walthamdatascience.com>" -m "feat(quickplot): Copy-PNG and Copy-Python footer buttons"
```

---

## Task 10: Rewrite `QuickPlot.test.tsx`

**Files:**
- Modify: `apps/web/tests/unit/components/app/QuickPlot.test.tsx`

- [ ] **Step 1: Replace test body**

New cases:
- Renders a default plot on mount when `pickPlotSuggestions` returns a primary
- "No numeric columns" empty state still renders when the table has no numeric cols
- Switching Y triggers re-inference; chip highlight updates
- Clicking a chip overrides the inferred plot type
- Clicking a secondary suggestion chip re-seeds the controls
- Clicking "Copy Python" writes the matplotlib snippet to clipboard (mock `navigator.clipboard.writeText`)
- Clicking "Copy PNG" calls the html-to-image library (mock `html-to-image`)

Delete cases that referenced `axisMode` or the four-dropdown layout.

- [ ] **Step 2: Run tests**

```bash
cd apps/web && pnpm vitest run tests/unit/components/app/QuickPlot.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/unit/components/app/QuickPlot.test.tsx
git commit --author="audriB <audri@walthamdatascience.com>" -m "test(quickplot): rewrite tests for column-first flow + Copy-PNG/Python"
```

---

## Task 11: Run full quality gates and fix anything that breaks

- [ ] **Step 1: Lint**

```bash
cd apps/web && pnpm lint
```

Expected: clean. Fix any errors inline.

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && pnpm tsc -b --noEmit
```

Expected: clean.

- [ ] **Step 3: Full unit test suite**

```bash
cd apps/web && pnpm vitest run
```

Expected: all green. Fix any regressions in other components/tests caused by the refactor.

- [ ] **Step 4: Build**

```bash
cd apps/web && pnpm build
```

Expected: clean build.

- [ ] **Step 5: Bundle size gate**

```bash
cd apps/web && node scripts/check-bundle-size.mjs
```

Expected: pass under 200 KB app gate.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit --author="audriB <audri@walthamdatascience.com>" -m "fix(quickplot): post-refactor lint/typecheck/test fixes"
```

(Skip if no fixes needed.)

---

## Task 12: Push branch

- [ ] **Step 1: Push**

```bash
git push -u origin feat/quickplot-column-first-impl
```

(PR creation deferred — user will open it. The user explicitly asked to stop when implementation is complete on the feature branch.)

---

## Self-review

**Spec coverage** — every spec section maps to at least one task:
- Goal §1 (column-first flow) → Tasks 7, 8
- Goal §2 (confident + visible inference) → Tasks 1, 7, 8
- Goal §3 (three core questions covered) → Tasks 4, 5, 6, 8
- Goal §4 (smart empty state) → Tasks 2, 8
- Goal §5 (Copy-Python) → Task 3, 9
- Goal §6 (Copy-PNG) → Task 9
- Architecture → Task 1, 2, 3, 4, 7, 8
- Inference rules → Task 1
- Empty-state default → Task 2
- Y-numeric scoping → Task 7
- Dual cardinality (groupableCat / countableCat) → Task 2
- Renderer upgrades (jittered points / IQR box) → Tasks 5, 6
- Tests → every implementation task has paired tests; Task 10 covers QuickPlot integration; Task 11 covers full suite + bundle
- Migration (delete `axisMode`) → Task 8
- Risks → Bundle gate is a blocker in Task 9; degraded path is documented (gate Copy-PNG behind a flag and file follow-up)

**Placeholder scan** — no TBD / TODO / "implement later" / vague-error-handling lines.

**Type consistency** — `inferPlotShape` is used by `QuickPlotControls` (Task 7) and `QuickPlot` (Task 8) with the same signature `(yField, xField, numericCols, categoricalCols, table) → { plotType, dispatchMode } | null`. `pickPlotSuggestions` is used by `QuickPlot` only (Task 8). `formatPythonSnippet` is used in Task 9 with the parameters shown in Task 3.

No gaps found. Plan ready for execution.

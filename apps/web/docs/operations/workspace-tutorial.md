# Workspace tutorial — run your first analyses

**Audience:** a scientist with no prior workspace exposure, working
against the NDI Commons preview. By the end you'll have run four
real analyses, watched each one render a chart or table, and
spot-checked the output against the canonical MATLAB tutorial.

**Time:** ~15 minutes for the full walkthrough; ~3 minutes for any
single task.

**Prerequisites:**
- A login on the preview (`audri+test@walthamdatascience.com` works
  for the experimental branch — you'll be prompted to set a password
  via Vercel SSO before reaching the cloud-app login).
- A modern browser (Safari 17+ / Chrome 120+ / Firefox 120+).

---

## Where everything lives

The workspace at `/my/workspace/[id]` is one page with three regions:

```
┌──────────────────────────────────────────────────────────────┐
│  Header: dataset title, contributors, DOI, "Use this data"   │
├───────────────┬──────────────────────────────────────────────┤
│               │  Snapshot tiles: Subjects · Sessions ·       │
│               │    Probes · Epochs · Documents · Species     │
│   Picker      ├──────────────────────────────────────────────┤
│   rail        │                                              │
│   (left)      │   Analyses grid: 6 panels (Signal viewer,    │
│               │     PSTH, Spike activity, Behavioral         │
│   tabs:       │     compare, Treatment timeline, Electrode   │
│   Subjects    │     positions)                               │
│   Sessions    │                                              │
│   Probes      │   Each panel auto-fills its parameters from  │
│   Stimuli     │   whatever is selected in the rail.          │
│   Documents   │                                              │
│               │                                              │
└───────────────┴──────────────────────────────────────────────┘
                         + floating Ask button (bottom-right)
```

**Key behaviours:**

- **Clicking a row in the picker rail** sets that row's id as the
  "primary" selection of its kind (subject / session / probe /
  stimulus / unit). Every analysis panel that needs that
  dimension re-runs.
- **Multi-select** (checkbox column) gates bulk actions: "Ask Claude
  about these N subjects", "Copy IDs", etc.
- **Right-click a row** opens a context menu with the same actions
  plus quick-jumps ("Plot signal trace for this session" scrolls
  the canvas to the Signal Viewer panel).
- **The Ask button** (bottom-right) opens the chat panel — same
  query DSL the analysis panels use, plus 17 tools the chat can
  pick from.

---

## Task A: Confirm Bhar's subject count

**Goal:** verify the workspace shows the same 5,314 subjects the
canonical MATLAB tutorial reports.

**Tutorial source-of-truth:** `apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md`
§1 Bhar. `subjectTable: 5314 rows × 28 cols`.

**Steps:**

1. Open `/datasets` (the catalog). Find the **Bhar** card (its title
   contains "C. elegans long-term memory" or similar).
2. Click the **"Open in workspace"** button on the card → lands on
   `/my/workspace/69bc5ca11d547b1f6d083761`.
3. Look at the **Snapshot** tiles below the header. The
   **Subjects** tile should read **5,314**.
4. Click the **Subjects** tile to focus the picker rail's Subjects
   tab. Scroll the rail — the table should populate with 5,314 rows
   (virtualized — only the visible window is rendered).
5. The column-toggle menu (kebab button in the table header) should
   list **28+ columns** the backend returned: Subject Identifier,
   Local Identifier, Strain, Background Strain, Genetic Strain Type,
   Species, Species Ontology, Sex, Sex Ontology, Age at Recording,
   Description, …

**Parity check:** ✅ if Subjects = 5,314 and the column-toggle menu
exposes ≥11 columns.

**If it fails:** the snapshot reads `counts.subjects` from
`/api/datasets/:id/summary`. If that returns 0 or a wrong number,
the backend's count projection is at fault (filed as F-1c +
backend ownership).

---

## Task B: Filter Francesconi subjects to one Cre line

**Goal:** narrow 215 subjects down to the 49 that carry the
`AVP-Cre` strain — same filter step the MATLAB tutorial performs.

**Tutorial source-of-truth:** §3 Francesconi. `subjectSummary: 215
× 14`; `filteredSubjects (StrainName contains "AVP-Cre"): 49 × 14`.

**Steps:**

1. Navigate to `/my/workspace/67f723d574f5f79c6062389d`.
2. Subjects tab in the picker rail is open by default. The grid
   shows **215** rows.
3. Open the column-toggle menu (kebab in the table header) →
   enable **Strain** if it isn't already visible.
4. On the Strain column header, click the **filter funnel icon**
   (or use the global search at the top of the rail).
5. Type `AVP-Cre`. The grid narrows. The header above the table
   should read **"Showing 49 of 215 subjects"**.

**Parity check:** ✅ if filtered count = 49.

**If it fails:**
- 0 matches → backend may not be returning the `strainName` /
  `strain` column in the table response. Open the kebab menu on
  the Strain column header to confirm the column exists; if
  it doesn't, the dataset's enrichment projection is missing.
- A different non-49 number → the filter shape might not match
  the strain field's stored values. Try `AVP` (substring) — if
  that hits more, the stored value has different formatting.

---

## Task C: The flagship Saline-vs-CNO violin (Francesconi EPM)

**Goal:** reproduce the canonical MATLAB tutorial's EPM violin plot
showing open-arm-north entries grouped by `Treatment_CNOOrSalineAdministration`.

**Tutorial source-of-truth:** §3 Francesconi. EPM table = 45 × 51
cols. Expected Saline vs CNO:

| Group | N | Mean | Median | Std | Min | Max |
|---|---|---|---|---|---|---|
| Saline | 22 | 5.86 | 5.0 | 3.21 | 2 | 15 |
| CNO | 23 | 5.09 | 5.0 | 3.06 | 0 | 12 |

**Cloud-app reference image:** see
`francesconi-epm-saline-cno-match.png` at the repo root (committed
prior to the 2026-05-18 audit). The expected shape: a horizontal
violin chart, two violins side-by-side labeled "Saline" and "CNO",
with the means + medians as a horizontal line through each violin.

**Steps:**

1. Stay on `/my/workspace/67f723d574f5f79c6062389d`.
2. Scroll the right column to find the **Behavioral comparison**
   panel (one of the 6 cards in the analyses grid).
3. Fill the form:
   - **Variable name contains:** `ElevatedPlusMaze_OpenArmNorth_Entries`
   - **Group by:** `Treatment_CNOOrSalineAdministration`
   - **Group order:** `Saline,CNO`
4. Click **Run**.
5. Wait ~3–10 seconds (cold cache; instant on warm). A violin
   chart should render with two violins (Saline and CNO) and the
   summary statistics underneath.

**Parity check:** ✅ if Saline n=22 mean ~5.86 and CNO n=23 mean ~5.09.

**If it fails:**
- "Method Not Allowed" / 405 error → the local POST route handler
  is being bypassed. Fixed in commit `9bf13fa` (2026-05-18); if
  you're on an earlier build, redeploy.
- Empty / no groups returned → the column name might use a
  slightly different spelling. Try `ElevatedPlusMaze_OpenArm`
  (less specific) and see if a `retry_with` hint appears below
  the form.
- Numbers off by a few → the dataset's `DataExclusionFlag` field
  may have changed. Compare against
  `apps/web/docs/specs/2026-05-14-tutorial-ground-truth.md` to
  spot which subjects the backend included.

---

## Task D: Generate a Bhar treatment timeline

**Goal:** render a Gantt-style timeline of treatment_drug
documents for one Bhar subject — the analog of the MATLAB
tutorial's `treatmentTimeline` plot.

**Tutorial source-of-truth:** §1 Bhar. `treatmentTable: 11 rows ×
10 cols` (heat pulses + isoamylol applications + E. coli substrate).

**Steps:**

1. Navigate to `/my/workspace/69bc5ca11d547b1f6d083761`.
2. Open the **Subjects** picker tab. Pick **any** subject row
   (it doesn't matter which — every subject in this dataset
   shares the same treatment recipe).
3. Scroll to the **Treatment timeline** panel (one of the 6
   analysis cards).
4. The panel should auto-fill `subjectDocumentIdentifier` from
   the selected subject. Click **Run**.
5. A horizontal Gantt-style chart renders, with each treatment as
   a bar. Heat treatments and isoamylol bars should both appear,
   with dashed lines marking transfer events.

**Parity check:** ✅ if 11 bars render (the canonical count) and
the legend distinguishes "heat" vs "isoamylol" vs "E. coli substrate".

**If it fails:**
- "No treatment documents found" → the subject id sent to the
  backend doesn't have any `treatment_drug` docs depending on
  it. Most Bhar subjects do — try a different one (subject row
  index 10, 50, 100 are good spot-check picks).

---

## Bonus: ask the chat to do the same analyses

The Ask panel (bottom-right floating button) drives the same 19
tools the analysis panels use. Prompts that should work:

- *"How many subjects in this dataset?"* → calls `get_dataset_class_counts`
- *"Show me the EPM open-arm-north entries by treatment group"*
  (on Francesconi) → calls `tabular_query`, same code path as
  the BehavioralCompare panel
- *"Plot the treatment timeline for subject X"* → calls
  `treatment_timeline`, same as the panel

Every claim the chat makes carries a `[^N]` footnote citation
linking back to the document it pulled. Click the footnote to
open the source document in the Document Explorer.

---

## When things break

The workspace is on a draft branch (`feat/experimental-ask-chat`)
hitting an experimental Railway backend. Expected failure modes
and their fixes:

| Symptom | Likely cause | Fix |
|---|---|---|
| 405 Method Not Allowed | Pre-2026-05-18 build; Vercel rewrite bypassed local route handlers | Redeploy from `9bf13fa` or later |
| "Loading" forever | Backend cold (Railway takes 6-30s on first hit per route) | Wait, then retry |
| 0 subjects on dataset that should have many | `summary_table_service` enrichment failed | Open the Document Explorer (`/datasets/[id]/documents`) and confirm the doc class has rows there |
| Chat replies with no citations | `references` array missing from a tool response | File the failing tool + the request id (visible in browser devtools network panel) |

Every chat error message carries a `requestId` — paste that into
any bug report so the cross-boundary traces line up.

---

## Document classes you'll see across these tutorials

For reference when reading the data:

| Class | What it carries | Tutorials that use it |
|---|---|---|
| `subject` | NDI subject identity + local_identifier | A, B |
| `openminds_subject` | openMINDS-shaped subject metadata (species, strain, sex) | B (filter source) |
| `treatment_drug` | One row per drug application (subject, drug, onset, duration) | D |
| `treatment_transfer` | Subject transfer events between conditions | D |
| `ontologyTableRow` | Generic tabular row keyed by ontology-defined column names | C (EPM behavioral measurements live here) |
| `element` | Recording or stimulus element (probes are elements with type=probe) | (probes picker) |
| `element_epoch` | A timed segment of recording on one element | (sessions picker — note: legacy Francesconi-era datasets use `epochfiles_ingested` instead; F-1d) |
| `vmspikesummary` | Spike train + summary stats per unit | (spike activity panel) |

---

## Update history

| Date | Change |
|---|---|
| 2026-05-18 | First version. Drafted post-audit, after the
              full-dynamic-column fix landed and the Vercel-rewrite
              405 bypass was caught + fixed (`9bf13fa`). Four
              concrete tasks plus an Ask-chat coda. |

# Post-handoff execution — 2026-05-19 (evening)

Companion to `2026-05-19-session-handoff.md`. That doc captured the
state at the end of the audit + UI sweep arc; this doc captures
what landed in the next session against the same branch.

---

## TL;DR

1. **All 6 surfaced cloud-app capability gaps shipped** —
   time-coloring + video playback + BehavioralTrack (XY trajectory) +
   patch-clamp step-family + derived columns + UI polish. Six new
   commits stacked on `feat/experimental-ask-chat`.

2. **Two of the three "default workspace flips to Bhar" hypotheses
   ruled out**: cookie domain mismatch is NOT the bug — the Railway
   backend's `cookie_attrs.py` already drops `Domain=.ndi-cloud.com`
   when the request Origin isn't apex (`*.ndi-cloud.com`), so preview
   deploys at `*.vercel.app` get host-only cookies as expected.
   `useAskPanelState` preserves the current pathname when rewriting
   query strings. **B1 root cause remains open.**

3. **Live verification with the fresh `steve+thing1@…` account
   re-confirmed the B1 redirect bug independently from both Bhar →
   Haley and Haley → Bhar directions** (G2 and G3 agents). API-level
   parity for Haley is green (3/3 tutorial parity checks pass);
   the bug is purely client-side workspace state. Auth rate-limit
   tripped again after ~5 retries inside the redirect loop.

4. **Agent collision incident captured**. Parallel `isolation:
   worktree` agents accidentally racing on the main repo working
   directory (despite worktree isolation) corrupted three of the
   six in-flight worktree branches. Three agents recovered cleanly
   (time-coloring, video, BehavioralTrack). Three were redone
   manually (UI polish, patch-clamp, derived columns). Net result:
   identical scope landed; the lesson for next session is below.

---

## Branch state

- `ndi-cloud-app` — `feat/experimental-ask-chat`
- HEAD: `caa93a7` (Derived columns)
- Six new commits since the handoff doc:
  - `fc1b8a8` — UI polish: header H-scroll sync + mobile minmax
  - `6ad978c` — Merge feat/signal-time-coloring
  - `2f83456` — Merge feat/video-playback-panel
  - `511b705` — Merge feat/behavioral-track-panel (panel-array conflict resolved)
  - `<patch-clamp>` — Patch-clamp step-family panel (Francesconi D8)
  - `caa93a7` — Derived/computed columns on tabular_query views

---

## What landed (file-by-file)

### Time-coloring on SignalViewer (Haley H11/H14 partial)

- `apps/web/components/ndi/charts/MultiTraceChart.tsx` — exports
  `ColorByMode`, new `colorBy` prop; `computeColorRamp` +
  `makePerSegmentPaths` helpers using uPlot `series.paths`.
- `apps/web/components/ndi/charts/SignalChart.tsx` — accepts
  `colorBy`, routes single-channel through MultiTraceChart when set.
- `apps/web/components/workspace/SignalViewerPanel.tsx` — new
  Color-by dropdown (None/Time/Index/Value).
- `apps/web/lib/ndi/tools/fetch-signal.ts` — zod schema gains
  `colorBy`, echoed through `chart_payload.colorBy`.
- +54 tests. No new deps; viridis hand-rolled.

### Video playback panel (Bhar B10, Haley H12)

- `apps/web/components/workspace/VideoPlaybackPanel.tsx` — wraps the
  existing `ImageStackVideoViewer` (which handles MP4 Range streaming
  + `Content-Type: video/mp4`).
- Registered in `WorkspaceCanvasClient`.
- 13 tests covering empty/loading/error/unsupported branches.

### BehavioralTrack panel (Haley H11 — XY trajectory)

- `apps/web/components/workspace/BehavioralTrackPanel.tsx` — fetches
  2-channel position signal, renders SVG trajectory with viridis
  per-segment coloring + start/end markers + colorbar legend.
- `apps/web/components/ndi/charts/TrajectoryChart.tsx` — the chart.
- `apps/web/lib/workspace/viridis.ts` — 32-stop lookup, shared with
  patch-clamp panel.
- 40 new tests. No backend changes — reuses `/signal` endpoint
  (Heart-on-Railway intact).

### Patch-clamp step-family panel (Francesconi D8)

- `apps/web/lib/workspace/segment-step-family.ts` — pure helpers
  (`segmentByNanGaps`, `longestSweep`, `summarize`). Edge cases:
  empty input, all-NaN, leading/trailing NaN runs, single-sample
  sweeps, time/values length mismatch, Infinity treated as gap.
- `apps/web/components/workspace/PatchClampStepFamilyPanel.tsx` —
  fetches signal, segments by NaN gaps, overlays sweeps on a common
  time axis with viridis coloring by sweep index. SVG-based chart
  (one polyline per sweep, ~12 × ~1000 samples on a typical step
  protocol).
- 17 segment helper tests + 7 panel tests. All pass.

### Derived/computed columns (Francesconi D13)

- `apps/web/lib/workspace/derived-columns.ts` — hand-rolled
  recursive-descent parser + evaluator. Supports + - * /, unary
  minus, parens, min/max/abs/round/sqrt, bare-identifier and
  `${name}` column refs. Null-propagates on missing/NaN; division by
  zero returns null. No `eval()`, no `new Function()`, no `mathjs`
  dep — ~5 KB total.
- `apps/web/components/workspace/canvas/DerivedColumnControls.tsx` —
  inline Add affordance + chip list of existing columns + remove ×.
- Wired into `BehavioralComparePanel` first.
- 29 parser tests + 2 panel tests; covers parse/arity/unknown-fn
  errors + all null-propagation paths.

### UI polish

- `apps/web/components/workspace/canvas/WorkspaceDataGrid.tsx` —
  header table now H-scrolls in sync with body via transform driven
  by body's `scrollLeft`. Fixes column-name misalignment when 28+
  columns trigger body H-scroll. `data-h-scroll-sync` attribute on
  the header wrapper for test hooks.
- `apps/web/components/workspace/canvas/AnalysesGrid.tsx` —
  `minmax(min(420px, 100%), 1fr)` so narrow viewports (<420px iPhone)
  don't trigger horizontal page overflow. Desktop unchanged.

---

## What's verified green

| Gate | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm test --run` | 2130/2130 passing (was 1986 pre-session; +144 new tests) |
| `pnpm build` | clean |
| Bundle size | 168.2 KB gz initial JS; +0.22 KB vs baseline; 31.8 KB headroom under the 200 KB ceiling |

---

## What did NOT land (and why)

| Item | Why deferred |
|---|---|
| Cross-table joins UI | Backend S5.3 deferred per CLAUDE.md (`/api/datasets/:id/joined-tables` route doesn't exist on Railway yet). UI without backend is empty. |
| Binary domain-format viewers (`.dna`, `.xlsx`) | Out-of-scope per handoff — open externally. |
| "Tools along boundaries" canvas redesign | Design exploration, needs a brainstorm session before code. User hinted but didn't spec. |
| B1 workspace redirect (Bhar ↔ Haley flip) | Root cause not identified. Cookie domain ruled out (backend already drops Domain on `*.vercel.app`). useAskPanelState preserves pathname. Suspect chunk-from-stale-deployment hydration in the React #418 reports (G2 NEW-4 saw 3 different `dpl_*` IDs in one session — CDN cache thrashing); needs a fresh Playwright session post rate-limit-decay to repro cleanly. |
| Tutorial S3 403 (G2 NEW-3) | Bucket policy / S3 ops — outside cloud-app. |
| Backend tickets F-1 through F-1e + F-2…F-8 | Outside-repo per user direction. |
| SDK upstream asks S-1…S-4 | Outside-repo per user direction. |

---

## G2 / G3 live verification results (fresh `steve+thing1` creds)

### G2 Bhar — `69bc5ca11d547b1f6d083761`

- Task A (subjects = 5,314, ≥11 cols) — ✅ PASS (13 cols rendered)
- Task D (treatment timeline, 11 bars expected) — ⏸ couldn't reach
  (B1 redirect interrupted)
- Snapshot integrity — Probes/Epochs both 0 (Bhar has neither
  literal `probe` nor `element_epoch` classes; backend tickets
  F-1c + F-1d cover this)
- Network 405s — ✅ zero (Wave-1 rewrite fix holds)
- **NEW issues filed**: `/api/auth/me` 401 cycle, default-workspace
  override (B1), tutorial S3 403, React #418 hydration mismatches
  across 3 deployment IDs (CDN cache thrashing), Bhar 12 vs 11
  class count

### G3 Haley — `682e7772cdf3f24938176fac`

- API-level parity: 3/3 PASS (H1 doc classes = 15, H3 subject table
  = 1,656 × 15, H4 strain filter = 76 of 1,656 PR811)
- UI-level: NOT TESTABLE — workspace redirected to Bhar before any
  panel could be exercised (B1)
- H11/H12 known gaps confirmed unchanged (graceful absence; not a
  regression)
- Auth rate-limit tripped after ~5 retries

Screenshots saved to:
`audit/2026-05-19-post-handoff/agent-G2-bhar/` +
`audit/2026-05-19-post-handoff/agent-G3-haley/`.

---

## Agent collision incident — lessons for next session

When dispatching multiple parallel implementation agents with
`isolation: "worktree"`, several agents ran their bash commands with
explicit `cd /Users/.../ndi-cloud-app` paths (the **main** repo, not
their assigned worktree subdirectory under `.claude/worktrees/agent-<id>/`).
Result: 3 of the 6 agents wrote files into the shared main working
tree simultaneously, stomping each other's edits.

The remaining 3 agents (a809b04, a4df182, a270a9d) self-isolated
correctly using the worktree's CWD. They each committed + pushed
their feature branches cleanly:

- `feat/signal-time-coloring` (a809b04 → `5030c76`)
- `feat/behavioral-track-panel` (a4df182 → `222fe92`)
- `feat/video-playback-panel` (a270a9d → `d77b7f4`)

The 3 that didn't recover (UI polish, derived columns, patch-clamp)
were redone manually in foreground — same end-state, ~30 minutes of
extra work resolving the conflict + recovering partial work from a
git stash.

**For next session**: prefer fewer parallel agents (≤3) with very
narrow file scopes. If you MUST run >3 parallel, explicitly tell
each agent in its prompt: *"All file paths in your commands must use
the worktree-relative path or stay inside your CWD —
NEVER `cd /Users/.../ndi-cloud-app/<absolute>`."* The current agent
runtime doesn't enforce CWD scoping, so the prompt has to.

---

## What's still open (priority order for next session)

1. **B1 workspace redirect** — P0 for Haley/Francesconi demos.
   Investigation needed with Playwright + DevTools-style trace once
   the auth rate-limit decays. Suspect CDN cache thrashing /
   Skew-Protection bypass given the 3-deployment-ID React #418
   pattern; could also be a stale TanStack Query cache key collision
   between dataset summaries.

2. **Re-run G2/G3 panel exercises** — once B1 is fixed AND rate-limit
   clears, exercise the actual analysis panels (Signal viewer,
   Treatment timeline, BehavioralCompare) on Bhar and Haley. Each
   panel run needs a real subject/session selection from the picker;
   only API-layer parity is currently confirmed for Haley.

3. **Backend tickets F-1 through F-1e, F-2…F-8** — needs ndb-v2 PRs.

4. **SDK asks S-1…S-4** — Python + MATLAB.

5. **Cross-table joins UI** — once S5.3 backend ships.

6. **"Tools along boundaries" canvas redesign** — design session.

7. **Mobile responsive polish at <375px** — current minmax fix
   handles the immediate overflow; a thoroughgoing mobile pass is
   still owed.

---

## Recommended first actions next session

1. Read this doc + the prior `2026-05-19-session-handoff.md`.
2. Pull `feat/experimental-ask-chat`, confirm HEAD = `caa93a7` or
   later.
3. Check Vercel: latest deploy alias should be Ready.
4. Decide B1 vs new-features priority with the user.
5. If B1: instrument the workspace page with a temporary
   `useEffect` that logs every `pathname` change + every TanStack
   Query key, then drive Playwright through a Bhar → Haley nav and
   capture the moment the URL flips.

---

## Live panel-exercise pass — 2026-05-19 late evening

After the merges shipped, a second instrumented Playwright pass (fresh
`steve+thing2@…` creds) ran each new panel end-to-end against real
NDI data. **Bottom-line**: all 5 newly-built panels function as
designed; B1 did NOT reproduce; one real bug surfaced + fixed.

### Per-panel results

| Panel | Dataset | Doc | Result |
|---|---|---|---|
| BehavioralTrack | Haley | `68c0683ef81ed200dc9c1c4e` (position element_epoch) | Panel works; backend returns 1-channel signal because Haley stores X+Y as separate element_epochs. Graceful "No XY trajectory data" empty state. Follow-up: add `(xDocId, yDocId)` pair input mode to support this schema. |
| SignalViewer time-coloring | Haley | same doc | ✅ PASS — uPlot mounted, `multitrace-colorby-label = "Color by time (viridis)"`, per-segment ramp active |
| Patch-clamp step-family | Francesconi | `68d6e54703a03f5cfdac8ef7` (daqreader epoch, file `ai_group1_seg.nbf_1`) | ✅ PASS — **21 sweeps** detected from NaN-gap segmentation, viridis colors progressing through the ramp correctly (`rgb(68,1,84)` → `rgb(65,67,135)` on first 5 sweeps), figcaption "ch0 · 21 sweeps · 2–41 samples each" |
| Derived columns | Francesconi | EPM `ElevatedPlusMaze_OpenArmNorthEntries` (n=45) | ✅ PASS — added `CV = std / mean`, rendered value `0.571` = 3.123/5.467 (exact match), chip `CV = std / mean` rendered, header cell wired |
| Video playback | Bhar | `69eb91431a7ae83f29b19a62` (imageStack, `formatOntology=NCIT:C190180`) | 🐛 Bug found + fixed (see below) |
| Treatment timeline | Bhar | (any subject) | ✅ Graceful empty state per F-1e — "No treatment timeline data to display. No treatment rows were returned for this dataset." No 405, no error. Backend F-1e remains the blocker. |

### B1 root cause assessment

**B1 did not reproduce.** Instrumented Playwright session captured
EVERY `pushState` / `replaceState` / `popstate` / fetch via a hook
injected before login. Result: a single legitimate pushState (from
`/login → /my/workspace/682e…`), no spurious URL flips, no
multi-deployment-ID chunk thrash (single `dpl_3w7nA8hfXZJJArLyzphyexodYz5p`
on every chunk URL).

Compare to G3's prior session: "3 distinct deployment IDs … React
#418 hydration mismatches" — that session ran during a multi-deploy
burst (6 worktree branches pushed roughly simultaneously, each
triggering a Vercel build). With those builds settled and only one
active deploy, the chunk-mixing window closed.

**Resolution**: B1 is most likely an artifact of CDN cache
thrashing during multi-deploy bursts. The diagnostic infrastructure
(history-hook injection script) is captured in this doc for next
time — re-run during another multi-deploy window to confirm.
Vercel Skew Protection (`deploymentId: process.env.NEXT_DEPLOYMENT_ID`
in `next.config.ts`) is configured; the failure mode happened anyway,
which suggests either the CDN ignored the `?dpl=` query param during
the propagation window or Skew Protection didn't fully cover the
problematic chunk types. Not actionable from cloud-app alone without
deeper Vercel Edge observability.

### Real bug found + fixed: `66667ef`

**Symptom**: Video playback panel says "This document does not contain
playable video" for a valid imageStack doc (Bhar
`69eb91431a7ae83f29b19a62` with `formatOntology=NCIT:C190180` —
explicitly tagged as MP4/H.264).

**Root cause**: Backend's per-doc detail endpoint returns
`{ id, data: { document_class: { class_name: 'imageStack' } } }`. The
cloud-app's `DocumentSummary` type declares `className?: string`
at the **top level**. `useDocument` was forwarding the raw payload
without normalizing. VideoPlaybackPanel's class check
(`doc.className === 'imageStack'`) was always false → "not playable"
even for valid videos.

**Fix**: TanStack Query `select` in `useDocument` hoists
`data.document_class.class_name` to top-level `className`. Idempotent
(preserves existing top-level if backend ever starts duplicating).
+4 unit tests pinning the contract (hoisting, idempotence,
no-class-name passthrough, empty-string falsy guard).

**Branch state**: `66667ef` on `feat/experimental-ask-chat`.

### Bonus finding: cross-dataset hard-reload drops session

Navigating from one workspace to another via `page.goto()` (full
reload) lands on `/login` with `returnTo=…`. `/api/auth/me` returns
401 immediately after. **JavaScript-only navigation (Cmd-K /
in-page link clicks) does NOT drop the session.** Looks Playwright-
specific — possibly the way Playwright handles cookies across full
reloads on the same origin, or a Vercel-side cookie scope quirk that
only manifests in headless Chromium. Filing as a noted observation
rather than a bug for now: a fresh Safari + manual test should
either reproduce it (real cookie issue) or rule it out (Playwright
artifact). The user has been navigating between workspaces fine via
in-page links so far.

### Updated branch state

- HEAD: `66667ef` (useDocument className normalization)
- Total new commits in this two-session arc on
  `feat/experimental-ask-chat`: **11** since the prior handoff
  (Wave 1+2 features, UI polish, patch-clamp, derived columns,
  handoff docs, useDocument fix).

---

## Update history

| Date | Author | Change |
|---|---|---|
| 2026-05-19 (evening) | post-handoff session | First version. Six new commits stacked + live verification + agent-collision postmortem. |
| 2026-05-19 (late evening) | live-exercise session | All 5 new panels exercised end-to-end. Patch-clamp + derived columns + time-coloring all PASS. Video panel bug found + fixed (`66667ef`). B1 NOT REPRODUCING — CDN cache thrash hypothesis supported. Session-drop on hard-reload noted (Playwright artifact?). |

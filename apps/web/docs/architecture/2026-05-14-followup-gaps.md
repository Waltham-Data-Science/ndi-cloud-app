# Task 2 / Task 3 — remaining gaps + follow-up spec

After Phase 1 (rename + chart consolidation) and Phase 2 (auth-aware
ToolContext), here's what's still missing from the ndi-next-steps
spec — explicitly enumerated so the next session can pick up cleanly.

---

## Task 2 — remaining panels

The workspace ships 5 panels:
- Dataset Structure
- Signal Viewer (SignalChart)
- Spike Activity (SpikeRaster + IsiHistogram)
- Behavioral Compare (ViolinChart)
- Treatment Timeline (GanttChart)

The scoping doc names 5 common plots. We have 3 (raster, raw trace,
ISI). Two are not built:

### Gap 1 — PSTH panel (peri-stimulus time histogram)

**What it computes**: spike count per time bin (e.g., 10ms) around
stimulus events, averaged across trials. Standard neuroscience
visualization — relates a stimulus to a neural response.

**Why it's not yet built**: requires a new aggregator on the backend.
Computing PSTH needs both vmspikesummary spike times AND
stimulus_presentation (or stimulus_response) event times. The
current chat tool layer has fetch_spike_summary (spikes) and
query_documents (events) — but no tool that joins them and bins
spikes around stimulus onsets.

**Build path** (estimated 1-2 days):
1. Backend: new `/api/datasets/{id}/psth` endpoint in
   `ndi-data-browser-v2/backend/routers/psth.py`. Inputs: vmspikesummary
   docId, stimulus_presentation docId (or query that resolves to one),
   t0/t1 window relative to stimulus onset, bin size. Output: bin
   centers + counts arrays + raw spike-per-trial matrix for raster
   underlay (optional V1.5).
2. Frontend tool: `lib/ndi/tools/psth.ts` wrapping the backend.
3. AI SDK registration in `lib/ai/chat-tools.ts`.
4. Code-export branches in `lib/ndi/code-export/python.ts` +
   `matlab.ts` (NDI-python / NDI-matlab equivalents — both have the
   primitives, just need the wiring).
5. Chart component: `PsthChart.tsx` (Plotly bar + optional smoothed
   line overlay). Could reuse IsiHistogram's bin-render path with
   different x-axis semantics.
6. Workspace panel: `PsthPanel.tsx`. Form: unit docId picker
   (text input + "Browse vmspikesummary docs →" deeplink), stimulus
   class selector ("stimulus_presentation" / "stimulus_response"),
   window slider, bin size slider, Run. Same Show Code wiring as
   the other panels.

### Gap 2 — Electrode position view

**What it shows**: spatial coordinates of probes/electrodes within
a subject's brain — a 2D or 3D scatter colored by depth or recording
quality.

**Why it's not yet built**: requires probe documents to carry
coordinate data (x, y, z in some atlas frame). Some NDI datasets
have this in the `probe_location` class, some don't. For the panel
to work generically, it needs to gracefully no-op on datasets that
don't have coordinate-carrying docs.

**Build path** (estimated 1-2 days):
1. Frontend: extend `query_documents` to surface
   `data.probe_location.coordinates` (or similar) if present.
2. Chart component: `ElectrodeMapChart.tsx`. Plotly scatter with
   optional brain-region atlas underlay. Could be 2D for V1 (top-
   down view) — 3D adds significant viewer complexity.
3. Workspace panel: `ElectrodeMapPanel.tsx`. Auto-loads from
   probe_location docs on mount; empty-state if dataset doesn't
   have them.
4. No backend change needed — existing `query_documents` endpoint
   already returns the coordinates if they're in the doc.

---

## Task 3 — remaining gaps

Per the strategic call confirmed this session ("sign-in funnel — keep
workspace auth-gated"), Task 3 lives at the existing public catalog
surface `/datasets/[id]/*`. Two gaps to close:

### Gap 3 — DataPanel feature parity on public datasets

DataPanel renders TimeseriesChart / ImageViewer / FitcurveChart /
VideoPlayer / SVG inline plots from binary documents. It's the
"anonymous user sees data" path. Today it works for documents whose
binary kind is one of these — but:

- Many element_epoch records that COULD render a signal trace don't
  trigger DataPanel because the kind probe doesn't recognize the
  binary layout. Worth a sweep.
- The DataPanel is rendered on the document-detail page
  (`/datasets/[id]/documents/[docId]`). Discovery is one extra
  click — users browse Documents, click a row, then see the chart.
  A "featured documents" carousel on the overview tab would
  surface representative plots zero-clicks-deep.

**Build path** (estimated 1 day):
1. Audit `useBinaryKind` (lib/api/binary.ts) for missing detections.
2. Add a "Featured plots" component to
   `app/(app)/datasets/[id]/overview/page.tsx` that surfaces 2-3
   curated documents per dataset from the sidecar (already exists
   for `binarySignalExample`).

### Gap 4 — Sign-up CTAs on the public catalog

If the workspace is the conversion target, the public catalog should
clearly say "sign up → make your own plots." Today the public catalog
doesn't promote the workspace. The signed-out user has no clear path
from "I see what's here" → "I want to work with this."

**Build path** (estimated half-day):
1. Add a "Work with this dataset →" CTA on every
   `/datasets/[id]/overview` for signed-out users. Routes to
   `/login?returnTo=/my/workspace/[id]`.
2. Add the same CTA on the document-detail page next to the
   DataPanel ("Sign in to plot any signal, any window →").

---

## Architecture follow-ups (not in scoping doc but worth flagging)

### Cross-repo SDK package (deferred)

Right now `lib/ndi/` is a Next.js-monorepo-internal directory. When a
4th consumer arrives (desktop GUI, Python CLI wrapping the same NDI
tools, etc.) we'd factor `lib/ndi/{tools,code-export,references}` into
a separate npm package `@ndi/web-sdk` so it can be `npm install`-ed
into other Next.js apps or React Native shells. Not worth doing now
— we have one consumer (this app) with three surfaces; the directory
structure is enough boundary.

### Backend response-shape generalization (deferred)

Several FastAPI endpoints return chat-specific keys (`chart_payload`,
`source` provenance envelopes). The workspace panels currently
consume these payloads happily, but it's a chat-flavored API.
Refactoring to "raw data + reference list" would be cleaner — the
chat-fence rendering can compose the chart_payload client-side from
the raw data. Cosmetic; defer.

### Tool description verbosity (in progress)

Phase-1 of the chat system-prompt trim happened earlier this session
(commit `8d15ff5`, ~23% shorter). The tool descriptions themselves
(`lib/ai/chat-tools.ts`) are still ~5K tokens. Marginal cost win
post-prompt-caching, but a leaner registry reads better. Defer.

### MATLAB code-export coverage

`lib/ndi/code-export/matlab.ts` has TODO branches for some tools.
The Python side is more complete. Worth a sweep to catch up the
MATLAB generators when we have a real customer who prefers MATLAB.

---

## Reading order for next session

1. The pre-compact handoff series:
   - `apps/web/docs/specs/2026-05-14-pre-compact-handoff.md`
   - `apps/web/docs/specs/2026-05-14-post-compact-nav-p0-batch.md`
2. The architecture spec (companion to this doc):
   - `apps/web/docs/architecture/2026-05-14-shared-core-spec.md`
3. This doc (gaps to close)

Total open work in priority order:
1. PSTH panel (Task 2 gap 1) — most-requested neuroscience viz
2. Electrode position view (Task 2 gap 2) — second-most-requested
3. Sign-up CTAs on /datasets/[id]/* (Task 3 gap 4) — funnel polish
4. DataPanel binary-kind audit (Task 3 gap 3) — discoverability polish
5. MATLAB code-export TODO sweep — customer-driven, defer until needed

Estimated to ship all 5: ~1 sprint of focused intern work, following
the patterns established in this session.

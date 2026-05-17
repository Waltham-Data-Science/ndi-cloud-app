# Backend follow-ups from the 2026-05-18 audit

**Companion to:** `apps/web/docs/reviews/2026-05-18-comprehensive-audit-findings.md`
**Audience:** maintainers of `ndi-data-browser-v2` (Railway FastAPI) and NDI-python / NDI-matlab.
**Branch context:** changes here would land on `ndi-data-browser-v2/main` (production) or against the NDI SDKs.

The cloud-app side of every bug surfaced by the 2026-05-18 audit
has been fixed in `feat/experimental-ask-chat`. Several findings
either (a) belong on the Railway backend, (b) would benefit from
upstream SDK changes, or (c) need ground-truth verification once
the cloud-app fixes deploy. Each item below is a concrete ticket
the right team can pick up without re-running the audit.

---

## Backend (ndi-data-browser-v2) — proposed tickets

### F-1 (carry-forward) — Backend projection for `stimulus_presentation`
- **Why:** `StimuliPicker` currently calls `useDocuments(datasetId, 'stimulus_presentation', 1, 200)` which hits the generic documents list. Backend's pageSize cap is 200; any dataset with >200 stimulus_presentation docs is silently truncated. A curated `/tables/stimulus` projection (like `/tables/element_epoch`) would give the picker the full set + sortable columns.
- **Acceptance:** new route `/api/datasets/:id/tables/stimulus` returning `{columns, rows}` envelope matching the existing tables-router pattern. Cloud-app switches the picker over once it ships.

### F-2 (carry-forward) — `?subject=` filter on `/tables/element_epoch`
- **Why:** Sessions cascade is currently client-side — fetch all element_epoch, filter by subjectDocumentIdentifier. For datasets with thousands of sessions across hundreds of subjects, that's wasteful.
- **Acceptance:** `/api/datasets/:id/tables/element_epoch?subject=<docId>` returns only the subject's sessions. Cloud-app's `SessionsBrowser` adds the query param.

### F-3 — Optional `?direction=downstream` on `/dependencies` to match prompt
- **Why:** The `walk_provenance` chat tool's input schema doesn't carry a `direction` parameter (handler always walks upstream). The system prompt previously claimed `direction=upstream` could be passed; audit C2 stripped that. If downstream walks are useful (e.g. "what tuning_curve_calcs depend on this element_epoch?"), add it.
- **Acceptance:** route signature accepts `direction: 'upstream' | 'downstream' = 'upstream'`. The walk semantics match the user's mental model — upstream = "what produced this", downstream = "what was produced from this".

### F-4 (carry-forward) — Stable query keys + dedup on panel mutation chains
- **Why:** Some workspace panel mutations don't use stable query keys so repeated identical picks re-fire the network call. Backend can help by being idempotent (already is) but the cloud-app side is the bigger leverage.
- **Owner:** primarily cloud-app, but the canonical mutation contract can be specified by the backend so deviations are detectable.

### F-5 — Source-of-truth for "Railway returns bulk-fetch shape"
- **Why:** The cloud-app's correctness depends on Railway's `list_by_class` returning the bulk-fetch shape (with `data`), not the upstream `[DocumentListItemResponse]` shape (without `data`). This contract is implicit. A future optimization (e.g. skipping `bulk_fetch` when the upstream query already returned everything inline) could silently break every panel that reads `doc.data`.
- **Acceptance:** ADR-009 (or backend-side spec) documenting "all `/api/datasets/:id/documents` list responses include `data` per document." Backend tests assert the field is present.

### F-6 — Investigate 0-count regression on `/tables/element_epoch` for Bhar / Francesconi / Haley
- **Why:** Visual QA on the live preview reported "0 element_epoch / 0 stimulus_presentation documents in their respective pickers" despite the dataset Snapshot reporting nonzero `Sessions` counts. May resolve once cloud-app B1 (paging passthrough) deploys; if not, the projection itself returns no rows for these datasets — needs Railway-side inspection.
- **Acceptance:** confirmed live + a debug log / migration if the projection's filter is wrong.

### F-7 — `aggregate_documents` could use `bulk_fetch` for hydration
- **Why:** The `aggregate-documents` service currently materializes doc bodies one class at a time. Switching to chunked `bulk_fetch` (≤500/call) would shave round trips for large aggregations.
- **Owner:** backend; not user-visible until aggregations grow.

### F-8 — Unify `tabular_query` POST wrapper with GET-only backend
- **Why:** Cloud-app's `/api/datasets/[id]/tabular-query` wrapper is POST that calls the GET-only Railway endpoint. Works but smells. Either add a POST variant on Railway that accepts the body shape, or make the wrapper GET-only.
- **Priority:** low — purely architectural cleanup.

---

## SDK (NDI-python / NDI-matlab) — proposed asks

### S-1 — Add `walk_provenance` / `dependencies` helper
- **Why:** The depends_on graph is a first-class NDI concept but neither SDK exposes a traversal helper. Every consumer (web workspace, Railway, hypothetical CLI users) hand-rolls a BFS. A single `ndi.cloud.api.documents.walkDependencies(datasetId, docId, direction, max_depth)` would mirror the Railway endpoint.
- **Audience:** Python + MATLAB.

### S-2 — Add a `tableFromDocuments(...)` helper
- **Why:** The old `cli-parity.md` invented `ndi.query.table_from_documents(...)` because the audit author thought it should exist. It SHOULDN'T be named that, but a helper that takes a list of document summaries (or full docs) and emits a tidy table (struct array in MATLAB, pandas DataFrame in Python) would close a real gap.
- **Audience:** Python + MATLAB. Naming should align with the existing `ndi.fun.docTable.*` family.

### S-3 — Server-side text search on `/datasets/published`
- **Why:** Both web's `list_published_datasets` and the audit found the upstream Cloud has no q= parameter on `/datasets/published`. The cloud-app and the chat both now filter client-side, which works because the catalog is small. As the catalog grows, this won't scale.
- **Audience:** upstream Cloud (not the Railway proxy — the proxy passes through unchanged).

### S-4 — Python `downloadDataset` interactive default for `target_folder`
- **Why:** MATLAB's `ndi.cloud.downloadDataset('<id>')` prompts for a download directory via `uigetdir` when the second arg is omitted. Python has no equivalent — `target_folder` is required. For "I just want to grab this dataset" flows, an `input("...")` prompt would close the parity gap.
- **Audience:** NDI-python.

---

## Verification owed once the cloud-app fixes deploy

After `feat/experimental-ask-chat` redeploys to the Vercel preview:

1. **B3 (classCounts)** — chat tool returns non-empty class data for Bhar / Haley / Francesconi.
2. **B4 (walk_provenance max_depth)** — chat tool honors `maxDepth: 6` (truncates at backend's actual cap).
3. **B5 (list_published_datasets)** — chat tool's `query: "memory"` returns substring-matched datasets, not unfiltered top-20.
4. **D-A (scroll preservation)** — replicate Agent D's test on all 3 datasets; scrollY should survive every picker click.
5. **D-C (header count)** — apply a column filter inside the Subjects grid; outer header count should update.
6. **0-count regression** — verify element_epoch / stimulus_presentation pickers populate for Bhar / Francesconi / Haley.
7. **Pulse animation (D-B)** — manual interactive verification: pick a session, watch SignalViewer briefly ring.
8. **Column resize (D-D)** — manual mouse drag on column edges in Subjects grid.

Items 7 and 8 are most likely Playwright test-harness limitations rather than real bugs but deserve a once-over on a real browser.

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

### F-1c (NEW 2026-05-18 follow-up audit) — Snapshot `counts.probes` lies for datasets without literal `probe` class
- **Why:** `/api/datasets/:id/summary` returns `counts.probes` which counts the literal `probe` class. Per Agent C's schema audit `probe` doesn't exist as an NDI document class — it's a Python runtime alias for `element`. Datasets like Francesconi report `counts.probes: 0` despite carrying 606 `element` documents and 3 probe types. Cloud-app applied a fallback (commit 9bf13fa) but the cleaner fix lives on the backend.
- **Acceptance:** `counts.probes` counts `element` docs (matching the `_CLASS_ALIASES['probe']` resolution used by `/tables/probe`). When the resolved count differs from the literal-`probe` count, log it for observability.

### F-1d (NEW 2026-05-18 follow-up audit) — Legacy-shaped epoch classes don't resolve via `element_epoch`
- **Why:** Sessions picker calls `useSummaryTable('element_epoch')` which returns `rows: 0` for Francesconi (`67f723d574f5f79c6062389d`) even though the dataset has 1604 `epochfiles_ingested` + 1605 `daqreader_mfdaq_epochdata_ingested` documents that map to the same conceptual "epochs" the tutorial expects (`epochSummary: 4887 × 12 cols`). Older NDI conversion pipelines write `epochfiles_ingested` / `daqreader_*_ingested` instead of the newer `element_epoch` shape. Backend's `_CLASS_ALIASES` aliases `epoch → element_epoch` but doesn't extend further to the legacy classes.
- **Acceptance:** add `element_epoch → [epochfiles_ingested, daqreader_*_ingested]` (or the appropriate legacy list) to `_CLASS_ALIASES`. The summary_table_service's existing fallback chain (`for alias in _CLASS_ALIASES[class_name]`) takes care of the projection without further code changes. Re-verify against Francesconi + any other pre-2025 dataset.

### F-1b (NEW 2026-05-18 follow-up audit) — Treatment-broadcast cols missing in `/tables/subject`
- **Why:** the public `/datasets/[id]/tables/subject` view shows dataset-specific broadcast columns derived from the `treatment` doc class — Sophie's `Treatment Left Eye Premature Eye Opening Name/Ontology` (4 cols), Francesconi's `Optogenetic Tetanus Stimulation Target Location Name/Ontology` (2 cols), etc. These DO NOT appear in `useSummaryTable('subject').data.columns`. The public side's `table-shell.tsx` does an extra pivot/broadcast that the API response doesn't replicate.
- **Acceptance:** push the pivot into `summary_table_service.py` so `/api/datasets/:id/tables/subject` returns the broadcast columns inline. Per ADR-001 (Heart-on-Railway) the projection belongs on the backend; once it does, every cloud-app surface (public table view, workspace SubjectsBrowser, chat answers via `query_documents`) sees the same columns without each layer needing its own pivot.
- **Workaround on cloud-app today:** the public `table-shell.tsx` carries the pivot logic in JS — see `apps/web/app/(app)/datasets/[id]/tables/[className]/table-shell.tsx` lines ~340-925 ("discoverDynamicColumns / appendDynamicColumns / join treatment-table per subject"). A shared `lib/data-quality/broadcast-treatments.ts` helper could be extracted and reused by SubjectsBrowser as a stopgap, but ADR-001 prefers the backend pivot.

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

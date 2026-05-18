# Comprehensive NDI audit — findings + dispositions

**Audit date:** 2026-05-18
**Audit plan:** `apps/web/docs/reviews/2026-05-18-post-compaction-audit-plan.md`
**Ground truth:** 14 NDI-family repos at HEAD on 2026-05-17 + the full
upstream Cloud API swagger at
`/Users/audribhowmick/Documents/ndi-projects/_audit-deps/NDI-cloud-api-swagger.md`.
**Branch:** `feat/experimental-ask-chat` (cloud-app), `feat/ndi-python-phase-a` (ndb-v2).

---

## Executive summary

Four parallel audit agents covered seven dimensions:

| Agent | Dimensions | Bugs found | Severity |
|---|---|---|---|
| **A — Export layer** | Snippet correctness + carryability | ~15 | 4 HIGH, 4 MEDIUM, 2 LOW |
| **B — Runtime layer** | Cloud-app ↔ Railway ↔ upstream contract | 5 | 4 HIGH, 1 LOW |
| **C — Schema / system-prompt** | Class names + LLM-facing claims | 5 | 1 invented class, 4 prompt errors |
| **D — Visual / E2E** | Playwright on live preview | 3 | 1 HIGH, 2 MEDIUM |

**Bugs fixed in this audit:** 20 / 28
**Bugs deferred (backend or follow-up):** 8 — see `2026-05-18-backend-followups.md`.

The single highest-impact silent bug was **B3**: the chat tool
`get_dataset_class_counts` was reading the wrong field name
(`counts` instead of `classCounts`) and returning empty class data
to every LLM invocation since Stream 4.3 shipped on 2026-05-15.
Closely behind were **D-A** (scroll position jumps to top on every
picker click — user-flagged earlier) and **B4** (walk_provenance
silently ignored its caller's `maxDepth`).

The `doc.data` question — flagged as the highest-priority unknown
going into the audit — turned out to be **resolved by design**:
Railway's `DocumentService.list_by_class` always returns the
`bulk_fetch` shape (with `data` populated), so every cloud-app
consumer reading `doc.data?.<...>` is correct. The cloud-app never
talks to the upstream Cloud directly; that contract holds and
deserves an ADR (filed as a follow-up).

---

## Confirmed bugs + dispositions

Each finding has: file:line + concrete fix + status. Severity is
audit-assigned; rank is by impact-not-severity (an LLM-facing bug
that returns silently-wrong data ranks above a syntax bug a user
would see immediately).

### B3 — `get_dataset_class_counts` reads wrong field (HIGH, LLM-facing) — **FIXED**
- **File:** `apps/web/lib/ndi/tools/get-dataset-class-counts.ts:28,51`
- **Issue:** Interface typed `counts` but backend returns `classCounts`. Every chat invocation returned `Object.keys(undefined) = []`. The LLM was told "this dataset has no classes" for every dataset since 2026-05-15.
- **Fix:** Renamed interface field + key access.

### B4 — `walk_provenance` uses non-aliased query param (HIGH) — **FIXED**
- **File:** `apps/web/lib/ndi/tools/walk-provenance.ts:113` + test
- **Issue:** Emitted `?depth=` but FastAPI uses `alias="max_depth"`. Backend silently fell back to default 3 for every chat-driven walk regardless of caller's `maxDepth: 1` or `maxDepth: 6`.
- **Fix:** Emit `?max_depth=` + test asserts the aliased name.

### B1 — Tables proxy strips pagination query params (HIGH) — **FIXED**
- **File:** `apps/web/app/api/datasets/[id]/tables/[className]/route.ts`
- **Issue:** Stream 5.8 added page+pageSize support on the backend tables endpoint, but the cloud-app proxy was discarding `req.url`. Every `usePagedDatasetTable` call fell through to the legacy unpaged envelope; the ~95% egress saving the spec promised never landed for traffic flowing through this proxy.
- **Fix:** Mirror the documents-route pattern — forward `page` + `pageSize` via URLSearchParams.

### B2 — `useImageStackParameters` uses pageSize=500 (latent CRITICAL) — **FIXED**
- **File:** `apps/web/lib/api/binary.ts:246-251`
- **Issue:** Backend caps pageSize at 200; 500 → silent 422 (FastAPI rejects before service dispatch). Latent today (no production imageStack has sibling partner docs) but would have broken canvas decode for any dataset that did.
- **Fix:** 500 → 200, matching Steve's StimuliPicker fix in `4b2d22d`.

### B5 — `list_published_datasets` sent unsupported `&q=` (HIGH, LLM-facing) — **FIXED**
- **File:** `apps/web/lib/ndi/tools/list-published-datasets.ts:67-69`
- **Issue:** Backend route accepts only `page`+`pageSize`; `?q=` was silently dropped. LLM thought its keyword search worked, presented unfiltered first-20 as relevant.
- **Fix:** Replace server-side q with client-side substring filter on name+description (the cloud catalog is small, ~30 entries). Updated tool description + unit test. Companion fix in `code-export/python.ts` and `code-export/matlab.ts` (Bug A8): emit client-side filter, not invalid `query=` kwarg.

### A1 — Python `downloadDataset` missing required `target_folder` (HIGH, user-facing) — **FIXED**
- **File:** `apps/web/components/datasets/UseThisDataModal.tsx:79`
- **Issue:** Real signature: `downloadDataset(cloud_dataset_id, target_folder, ...)`. Snippet emitted `("<id>")` only — copy/paste raised `TypeError: missing 1 required positional argument`.
- **Fix:** Emit second arg `"~/ndi-datasets"` + comment explaining the asymmetry with MATLAB's `uigetdir`-fallback form. Updated `UseThisDataModal.test.tsx` assertions.

### A2 / A5 — MATLAB `[b, answer, ...]` return shape (HIGH, user-facing) — **FIXED**
- **File:** `apps/web/lib/ndi/code-export/matlab.ts` (6+ sites: `getDataset`, `getDatasetSummary`, `documentClassCounts`, `ndiqueryAll`, `ndiquery`, `getDocument`, `getFile`)
- **Issue:** Every MATLAB cloud-API wrapper returns 4 values; single-LHS capture grabs the boolean. `dataset = getDataset(id)` → `dataset = true`, every downstream access errors.
- **Fix:** Emit `[success, dataset] = ...` everywhere. Same for the inner walk-provenance loop's getDocument call.

### A4 — MATLAB `ndiquery / ndiqueryAll` arg shape (HIGH, user-facing) — **FIXED**
- **File:** `apps/web/lib/ndi/code-export/matlab.ts` (6 sites)
- **Issue:** Wrappers take the `ndi.query` OBJECT (then extract `searchstructure` internally). Cloud-app emitted `q.searchstructure` directly → failed the `(1,1) did.query` arg validator.
- **Fix:** Pass `q` not `q.searchstructure`. Plus the consequent: `ndiqueryAll` returns a struct array of summaries (no `.data`), so to get full bodies we now emit a `bulkFetch` chain.

### A9 — `ask-prefill-bus.buildPrefillPrompt` invents SDK names (HIGH, LLM-facing) — **FIXED**
- **File:** `apps/web/lib/ai/ask-prefill-bus.ts:123`
- **Issue:** Emitted `ndi.query.find / ndi.query.dependencies / ndi.cloud.api.files.read_signal` — none exist in either SDK. This is the bulk-action prefill that gets typed into the chat — highest-traffic surface for a wrong API.
- **Fix:** Replace with real names: `ndi.cloud.api.documents.ndiquery / bulkFetch / ndi.cloud.api.files.getFile`, plus an honest note that depends_on walks are manual.

### A3 / A10 / A11 / A12 / A14 — `cli-parity.md` broken throughout (HIGH, user-facing) — **FIXED**
- **File:** `apps/web/docs/operations/cli-parity.md`
- **Issue:** About half the snippets referenced functions that don't exist (`ndi.query.find`, `ndi.query.dependencies`, `ndi.query.create`, `ndi.query.table_from_documents`, `ndi.cloud.api.psth.compute`, `ndi.cloud.api.files.read_signal`), used snake_case Python aliases instead of camelCase, and called `>> ndi.setup` instead of the real `>> ndi_setup`.
- **Fix:** Whole-doc rewrite. Replaced every snippet with names verified against NDI-matlab `0c94d92` + NDI-python `9c64acb`. Added a top-level audit-history note. Added a "Common gotchas" section that catalogues the `[b, answer, ...]` capture rule, the `ndiqueryAll → bulkFetch` chain, the `ndi.database` class-not-module rule, and Python's `target_folder` requirement.

### A6 / A7 — `ndi.database.openbinarydoc` doesn't exist as a package fn (MEDIUM) — **FIXED**
- **Files:** `apps/web/lib/ndi/code-export/python.ts:498`, `apps/web/lib/ndi/code-export/matlab.ts:428`
- **Issue:** `ndi.database` is a class, not a module. `openbinarydoc` is a method on session/dataset. Calls as emitted would `AttributeError` (Python) / fail unresolved (MATLAB).
- **Fix:** Python — use `ndi.cloud.filehandler.fetch_cloud_file(<ndic-uri>)` for the direct download path; document the session-method alternative in a comment. MATLAB — emit `S.database_openbinarydoc(doc, filename)` as the session-method form. Updated tests.

### A8 — Python `getPublished` doesn't accept `query=` (MEDIUM, user-facing) — **FIXED**
- **File:** `apps/web/lib/ndi/code-export/python.ts:193`
- **Issue:** Real signature `getPublished(page, page_size, *, client=)`. Passing `query=` raised `TypeError`.
- **Fix:** Emit the call without `query=`; when caller supplied one, add a client-side substring filter mirroring the chat-tool runtime.

### A13 — Python `documentClassCounts` iteration wrong (LOW-MEDIUM) — **FIXED**
- **File:** `apps/web/lib/ndi/code-export/python.ts:230-232`
- **Issue:** Iterated `counts.items()` directly but the return shape is `{datasetId, totalDocuments, classCounts}` — `.items()` printed `("datasetId", "..."), ("totalDocuments", N), ("classCounts", {...})` instead of per-class entries.
- **Fix:** Iterate `counts.get("classCounts", {}).items()`.

### C1 — `thumbnail` is not an NDI class (MEDIUM, LLM-facing) — **FIXED**
- **Files:** `apps/web/lib/ai/system-prompt.ts:258`, `apps/web/lib/ai/chat-tools.ts:710`
- **Issue:** Both descriptions listed `thumbnail` as a valid `fetch_image` className. No `thumbnail.json` schema exists; the backend's `binary_service.py` maps `"thumbnail" → "image"` as a kind hint, NOT as a class-alias the user can query.
- **Fix:** Drop `thumbnail` from both descriptions; keep `"image"` and `"imageStack"`.

### C2 — `walk_provenance direction=upstream` parameter doesn't exist (HIGH, LLM-facing) — **FIXED**
- **File:** `apps/web/lib/ai/system-prompt.ts:175-176`
- **Issue:** Prompt told LLM to pass `direction=upstream`, but `walk-provenance.ts` schema declares no `direction` input. The handler always walks upstream. LLM kept emitting a phantom parameter that did nothing.
- **Fix:** Strip the `direction=upstream` mention; rewrite to "always upstream by default; cap is 6". (Future: extend the schema to support downstream walks if needed — captured as a follow-up.)

### C3 — `lookup_ontology` examples use non-existent field paths (MEDIUM, LLM-facing) — **FIXED**
- **File:** `apps/web/lib/ai/chat-tools.ts:494-498`
- **Issue:** Examples mentioned `subject.species`, `subject.strain`, `probe.brainRegion`, `element.cellType` — none of those fields exist on the named class. Species/strain are on openminds_subject; brainRegion is a backend projection from probe_location; cellType lives on ontologyTableRow or backend enrichment.
- **Fix:** Rewrote the example block to use realistic paths (openminds_subject + probe_location + ontologyTableRow).

### C4 — `aggregate_documents` examples use invented fields (MEDIUM, LLM-facing) — **FIXED**
- **File:** `apps/web/lib/ai/chat-tools.ts:522-524,540-541`
- **Issue:** Mentioned `data.subject.weight_grams`, `data.probe.impedance_ohms`. Zero hits anywhere in NDI schemas (only `mean_firing_rate` was real).
- **Fix:** Rewrote with verified field paths (`data.vmspikesummary.mean_vm`, `data.element.ndi_element_class`, etc.). Updated python.ts / matlab.ts defaults accordingly.

### C5 — `ndi-query.ts` examples use non-existent `subject.strain` / `subject.dob` (LOW, LLM-facing) — **FIXED**
- **File:** `apps/web/lib/ndi/tools/ndi-query.ts:154-156`
- **Issue:** Examples in the input-schema docstring referenced `subject.strain` and `subject.dob` — neither exists on the canonical `subject` schema. Silent 0-hit returns.
- **Fix:** Rewrote example clauses with real paths (`subject.local_identifier`, `openminds_subject.openminds_id`, `vmspikesummary.mean_firing_rate`, `element.ndi_element_class`).

### D-A — Scroll position resets on row click in all pickers (HIGH, user-visible) — **FIXED**
- **Files:** `apps/web/lib/workspace/use-workspace-selection.ts:217`, `apps/web/components/workspace/{SubjectsBrowser,SessionsBrowser,StructureBrowser,canvas/DocumentsPicker}.tsx`
- **Issue:** Every `router.replace(url)` was called without `{ scroll: false }`. Next.js's default is to scroll to top on route change. User scrolled to mid-page to see analysis cards → clicked any picker row → page yanked to top. User had flagged this earlier; the audit confirmed reproduction on Bhar/Francesconi/Haley.
- **Fix:** `{ scroll: false }` on all 5 `router.replace` sites in the workspace. Central writer in `useWorkspaceSelection` carries the change for the chip-bar selection; per-browser `updateSearch` helpers carry it for the filter chips.

### D-C — "Showing X of Y" header stays stale after column filter (MEDIUM, user-visible) — **FIXED**
- **Files:** `apps/web/components/workspace/canvas/WorkspaceDataGrid.tsx`, `apps/web/components/workspace/SubjectsBrowser.tsx`
- **Issue:** The grid's in-row column-filter popovers + global search live inside WorkspaceDataGrid (TanStack state). The outer `WorkspaceFilterBar` header reflected only URL-chip filters → narrowed grid to 1 row, header still said "1,656 of 1,656 subjects."
- **Fix:** Added `onFilteredRowsChange` callback prop on WorkspaceDataGrid; SubjectsBrowser tracks the grid-reported count in local state and passes that to the outer header. Same pattern can be replicated for Sessions/Structure if needed.

---

## Inconclusive / deferred

### D-B — Pulse-on-selection-change animation not firing (MEDIUM, user-visible) — **INCONCLUSIVE**
- **Files:** `apps/web/components/workspace/PanelCard.tsx`, `apps/web/lib/workspace/use-panel-change-indicator.ts`, plus the panels that wire `usePanelChangeIndicator`
- **Issue:** Agent D's MutationObserver detected 0 `class` flips containing `ring-brand-blue` during selection changes; cards stayed at `ring-2 ring-transparent`.
- **Analysis:** The implementation looks correct. `usePanelChangeIndicator` fires on dep changes; `ring-2 ring-brand-blue/40 shadow-md` is the on state. Possible causes: (a) Playwright MutationObserver targeted wrong element / wasn't watching subtree, (b) Tailwind v4 class compilation issue, (c) deps array element-equality not flipping because Next.js's useSearchParams returned the same Map reference.
- **Disposition:** Manual re-verification on the next preview deploy. No code change yet.

### D-D — Column resize handles unresponsive to synthetic events (LOW) — **INCONCLUSIVE**
- **Issue:** Playwright synthetic `pointer*` events didn't produce a width change. Likely Radix's `setPointerCapture` not firing.
- **Disposition:** Manual mouse-drag verification before any code change.

### 0 element_epoch / 0 stimulus_presentation counts on Bhar / Francesconi / Haley — **DEFERRED (backend?)**
- **Possible causes:** (a) Dataset Snapshot reports nonzero `Sessions` via `summary_table_service`; the picker fetches via different code paths (`useSummaryTable('element_epoch')` and `useDocuments('stimulus_presentation', 200)`). These may legitimately return 0 if the curated projection has no qualifying rows, OR if the backend Stream 5.8 pagination wasn't forwarding correctly (which `B1` would have caused). With `B1` now fixed, this should be re-verified post-deploy.
- **Disposition:** Re-verify after Vercel preview rebuilds + smoke. If still 0, dig into Railway's tables endpoint.

---

## "Doc.data" question — RESOLVED

The audit plan flagged `doc.data` as the highest-priority unknown. Resolution:

1. **Upstream Cloud** `GET /datasets/{id}/documents` returns `[DocumentListItemResponse]` with NO `data` field.
2. **Cloud-app NEVER hits upstream directly** — only `/api/datasets/...` routes that proxy through Railway.
3. **Railway's `DocumentService.list_by_class`** internally calls `POST /documents/bulk-fetch` which DOES include `data`. So every cloud-app `doc.data?.<...>` consumer is correct.
4. The contract is implicit; **ADR-009** (not yet written) should document the invariant: "Railway list endpoints return the bulk-fetch shape." Filed as a backend follow-up.

---

## Carryability — net improvement

The pre-audit carryability grade (`docs/reviews/2026-05-17-carryability-and-architecture.md`) was B+ with five known followups. The audit's export-layer + cli-parity fixes raise it to roughly an A− for the chat → CLI handoff specifically. A scientist who copies a snippet from the workspace's "Show code" or the `cli-parity.md` doc now gets working code paths.

Two carryability gaps remain (backend-owned, deferred):
- No SDK wrapper for PSTH / signal decode / tabular query / treatment timeline (all Railway-only). User-side replication requires hand-rolling the same alignment / aggregation logic — documented in `cli-parity.md` §5 + the export-layer's `% TODO` comments.
- No SDK helper for depends_on traversal. Manual loop documented in `cli-parity.md` §3.

---

## Efficiency — recorded, not fixed

The audit surfaced several efficiency opportunities that the existing codebase already accommodates correctly via Railway-layer caching + bulk-fetch:

- `useDocumentsInfinite` page-by-page would benefit from a single bulk-fetch for large classes (Haley 78k docs). Backend-side change — deferred.
- `aggregate-documents` already routes through Railway (ADR-001 compliance); Railway-side could use bulkFetch internally. Backend.
- `useClassCounts` is redundant with `dataset.documentCount` for the "how many docs" question — but the per-class breakdown is genuinely useful. Keep both.

None are blocking; none are visible to users.

---

## File map of changes

```
NEW
  apps/web/docs/reviews/2026-05-18-comprehensive-audit-findings.md      (this file)
  apps/web/docs/specs/2026-05-18-backend-followups.md                   (companion)
  audit/2026-05-18-comprehensive-audit/                                 (raw agent reports + visual QA screenshots)

MODIFIED — runtime (Agent B)
  apps/web/lib/ndi/tools/get-dataset-class-counts.ts          (B3)
  apps/web/lib/ndi/tools/walk-provenance.ts                   (B4)
  apps/web/tests/unit/ai/tools/walk-provenance.test.ts        (B4 codified)
  apps/web/lib/ndi/tools/list-published-datasets.ts           (B5 + client-side filter)
  apps/web/tests/unit/ai/tools.test.ts                        (B5 test refresh)
  apps/web/app/api/datasets/[id]/tables/[className]/route.ts  (B1 paging passthrough)
  apps/web/lib/api/binary.ts                                  (B2 500→200)

MODIFIED — system prompt / chat-tools (Agent C)
  apps/web/lib/ai/system-prompt.ts                            (C1, C2)
  apps/web/lib/ai/chat-tools.ts                               (C1, C3, C4, B5 desc)
  apps/web/lib/ndi/tools/ndi-query.ts                         (C5)

MODIFIED — export layer (Agent A)
  apps/web/components/datasets/UseThisDataModal.tsx           (A1)
  apps/web/tests/unit/components/datasets/UseThisDataModal.test.tsx  (A1)
  apps/web/lib/ndi/code-export/matlab.ts                      (A2, A4, A5, A7, A8 default)
  apps/web/tests/unit/ai/code-export/matlab.test.ts           (A4/A5 assertions)
  apps/web/lib/ndi/code-export/python.ts                      (A6, A8, A13 + defaults)
  apps/web/tests/unit/ai/code-export/python.test.ts           (A6, A8)
  apps/web/lib/ai/ask-prefill-bus.ts                          (A9)
  apps/web/docs/operations/cli-parity.md                      (A3/A10/A11/A12/A14 whole-doc rewrite)

MODIFIED — visual UX (Agent D)
  apps/web/lib/workspace/use-workspace-selection.ts           (D-A scroll preservation)
  apps/web/components/workspace/SubjectsBrowser.tsx           (D-A + D-C grid-filtered count)
  apps/web/components/workspace/SessionsBrowser.tsx           (D-A)
  apps/web/components/workspace/StructureBrowser.tsx          (D-A)
  apps/web/components/workspace/canvas/DocumentsPicker.tsx    (D-A)
  apps/web/components/workspace/canvas/WorkspaceDataGrid.tsx  (D-C onFilteredRowsChange)
```

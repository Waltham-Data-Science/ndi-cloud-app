# Post-compaction audit plan — execute on next session

**Date drafted:** 2026-05-17
**To be executed:** the session immediately after the next `/compact`
**Author drafting:** Claude (current session, post-Phase-H)
**Purpose:** capture every audit dimension we've discussed in this session so a fresh-context post-compaction Claude can run it thoroughly, not piecemeal.

---

## Why this exists

This session ran Phases F → G → H of the workspace redesign, then surfaced two classes of issues that warranted deeper investigation:

1. **Steve flagged that the MATLAB "Use this data" snippet was unnecessarily complex** — we'd shipped a verbose `if isfolder(…) … else … end` block lifted from a stale Plan B amendment, when the modern NDI-matlab takes just `ndi.cloud.downloadDataset('<id>');`. Fixed in commit `777da84`, but it raised the question: **how many more places are we calling NDI functions wrong because we inherited stale specs?**

2. **The user explicitly asked for visual QA** — the kind of bug that only surfaces when a real human interacts (e.g. "selecting a row resets scroll position, throwing the user to the top of the page"). Phase H tests can't catch these.

Three audit agents attempted this in the current session and were stopped twice as new ground-truth sources kept landing (NDI-python ↔ MATLAB dep chains, then transitive deps, then the upstream Cloud API swagger spec with full model schemas). The third was running cleanly but the user wisely suggested redoing it with a fresh context window post-compaction. **This doc is the snapshot.**

---

## Ground truth — verified at HEAD on 2026-05-17

All 14 repos pulled and confirmed:

### Python stack (NDI-python's full dep closure)
- `/Users/audribhowmick/Documents/ndi-projects/NDI-python` — `main` @ `9c64acb` (5 days ago)
- `/Users/audribhowmick/Documents/ndi-projects/DID-python` — `main` @ `1b1491f` (5 weeks)
- `/Users/audribhowmick/Documents/ndi-projects/NDR-python` — `main` @ `896ed63` (5 weeks)
- `/Users/audribhowmick/Documents/ndi-projects/DID-schema` — `main` @ `eab2c63` (today)
- `/Users/audribhowmick/Documents/ndi-projects/_audit-deps/vhlab-toolbox-python` — `main` @ `b073185`
- `/Users/audribhowmick/Documents/ndi-projects/_audit-deps/NDI-compress-python` — `main` @ `0c05d9d`

### MATLAB stack
- `/Users/audribhowmick/Documents/ndi-projects/NDI-matlab` — `main` @ `0c94d92` (5 days)
- `/Users/audribhowmick/Documents/ndi-projects/DID-matlab` — `main` @ `03b0f7f`
- `/Users/audribhowmick/Documents/ndi-projects/NDR-matlab` — `main` @ `4e15508` (7 days)
- `/Users/audribhowmick/Documents/MATLAB/tools/vhlab-toolbox-matlab` — contains the `+vlt` MATLAB namespace
- `/Users/audribhowmick/Documents/MATLAB/tools/vhlab-thirdparty-matlab`
- `/Users/audribhowmick/Documents/MATLAB/tools/vhlab_vhtools`

### Backend / SDK
- `/Users/audribhowmick/Documents/ndi-projects/ndi-data-browser-v2` — Railway FastAPI, on `feat/ndi-python-phase-a` @ `bc68b13`. **Also check `main` branch** for production-route divergence.
- `/Users/audribhowmick/Documents/ndi-projects/ndi-cloud-node` — Steve's Node SDK, `chore/post-cutover-cleanup` @ `80a0f1f`

### Canonical upstream Cloud API spec
**`/Users/audribhowmick/Documents/ndi-projects/_audit-deps/NDI-cloud-api-swagger.md`** — every `/v1/*` endpoint + every model schema (`DatasetResponse`, `DocumentListItemResponse`, etc.). Read this first.

### Cloud-app under audit
- `/Users/audribhowmick/Documents/ndi-projects/ndi-cloud-app` — branch `feat/experimental-ask-chat`. Latest commits this session:
  - `777da84` — UseThisDataModal simplified (Steve's MATLAB feedback)
  - `ca19a61` — Carryability + architecture review + B3/F3 fixes
  - `4b2d22d` — StimuliPicker 500 → 200 (backend cap)
  - `61562ff` — Lockfile catch-up (fixed Vercel build)
  - `95cdeba` — Phase H (group-by, multi-sort, column filter, resize, kebab, search, pulse, illustrations)

### Layer map (every cloud-app reference targets one of these)
```
Cloud-app (Next.js, /apps/web/)
   ↓ calls /api/datasets/…
Railway backend (ndi-data-browser-v2, FastAPI)
   ↓ proxies or extends
NDI Cloud API (/v1/…)    ← swagger md
   ↓
NDI infrastructure
```

---

## What this session has already established as concerns

Carry these forward — don't re-derive.

### Confirmed bugs/concerns this session surfaced (not all fixed):

1. **`doc.data` problem** (HIGHEST PRIORITY to verify in audit). The canonical `GET /datasets/{id}/documents` returns `DocumentListItemResponse[]` = `{ id, ndiId, name, createdAt, updatedAt }`. **No `data` field.** Cloud-app's `ElectrodePositionPanel`, `StimuliPicker`, `DocumentsPicker` all read `doc.data?.<…>`. If the Railway backend augments the response with `data`, that's fine — but the audit must trace this end-to-end.

2. **MATLAB `ndi.query` constructor arg shape** — a killed audit agent surfaced this before being stopped: cloud-app's `lib/ndi/code-export/matlab.ts` emits the wrong shape for the MATLAB `ndi.query(…)` constructor. Python version is correct because the Python constructor takes `Any`. Confirm + fix in audit.

3. **Three documented backend gaps from the 2026-05-17 review** (`docs/reviews/2026-05-17-carryability-and-architecture.md`):
   - **F1** — no `/tables/stimulus` backend projection; StimuliPicker workarounds the 200 doc-cap
   - **F2** — no `/tables/element_epoch?subject=` filter; Sessions cascade is client-side
   - **F4** — panel mutations don't use stable query keys (no dedup on repeat picks)

4. **Visual UX bugs the user mentioned** (NOT yet audited):
   - Row click resets scroll position
   - Possibly more class-of-bugs only visible when sitting at a real scroll position
   - These need Playwright sessions that scroll first, then interact

5. **`StimuliPicker` + `DocumentsPicker` both hit `useDocuments(…, 1, 200)`**. Backend caps at 200. Datasets with >200 docs in a class get silent truncation. The right long-term fix is a backend projection per ADR-001.

6. **The carryability review (`docs/reviews/2026-05-17-carryability-and-architecture.md`)** noted the auto-prefill prompt has been fixed (B3) to use NDI SDK function names, but the audit should verify those names round-trip correctly.

7. **The cli-parity doc** (`docs/operations/cli-parity.md`) contains MATLAB + Python code snippets I authored. Every one should be verified against the actual SDK shape.

8. **The system prompt** (`lib/ai/system-prompt.ts`) makes factual claims about NDI behavior. These must all be true.

9. **`/document-class-counts` is HYPHENATED** in the upstream spec, and returns counts only (no IDs, no class-inheritance rollup). The spec explicitly says class-aware drilldowns must use `/ndiquery` with `isa`. Cloud-app's `query_documents` and `aggregate_documents` should be checked for whether they follow this.

10. **Efficiency** — anywhere cloud-app does N parallel `/documents/{id}` GETs, `POST /documents/bulk-fetch` (sync, ≤500) is the canonical replacement.

---

## Audit dimensions — what to check

### Dimension 1: Export-snippet correctness

**Files:**
- `apps/web/lib/ndi/code-export/python.ts`
- `apps/web/lib/ndi/code-export/matlab.ts`
- `apps/web/lib/viewer/pythonSnippet.ts`
- `apps/web/components/datasets/UseThisDataModal.tsx`
- `apps/web/docs/operations/cli-parity.md`
- `apps/web/lib/ai/ask-prefill-bus.ts` (`buildPrefillPrompt`)

**Method:** for every emitted `ndi.<…>` / `<package>.<fn>` call, `rg <symbol>` across the matching SDK repo. Confirm the symbol exists at the emitted path with a compatible signature.

**Specific suspects:**
- `ndi.cloud.downloadDataset` — both verbose + simple forms used. Steve says simple works. Verify.
- `ndi.fun.docTable.subject` (MATLAB) / `ndi.fun.doc_table.subject` (Python) — verify exact dotted paths exist.
- `ndi.query.find` / `ndi.query.dependencies` / `ndi.cloud.api.files.read_signal` — confirm each is real.
- `ndi.cloud.api.datasets.getDataset` — confirm REST-style camelCase or whether the SDK uses snake_case.
- `ndi.cloud.api.psth.compute` — does this exist in NDI-python, or is it Railway-only?

### Dimension 2: Runtime endpoint correctness

**Files:**
- Every file in `apps/web/lib/ndi/tools/`
- Every file in `apps/web/app/api/datasets/[id]/*/route.ts`
- `apps/web/lib/api/{documents,tables,datasets}.ts`

**Method:** for each URL cloud-app calls:
1. Extract URL + HTTP method + request body type + assumed response shape
2. Cross-reference against `ndi-data-browser-v2/backend/routers/<matching>.py`:
   - Does the route exist? (`@router.<method>("<path>")`)
   - Does the Pydantic request model match the body cloud-app sends?
   - Does the response model match what cloud-app reads?
3. For routes that proxy upstream, ALSO cross-reference against the swagger spec.

**Specific suspects:**
- `useClassCounts` — does it hit `/document-class-counts` (hyphen) or something different?
- `useDocuments` — what fields does the response actually include? Does Railway augment with `data`?
- `useSummaryTable` — Railway-specific; verify projection field names match what hooks read.
- PSTH + Signal + SpikeSummary + TreatmentTimeline + Image + AggregateDocuments — every tool wrapper's URL, method, payload.

### Dimension 3: Document class names + schema

**Method:** search cloud-app for every literal NDI class name. For each, verify against:
- NDI-matlab schemas: `NDI-matlab/+ndi/database/+metadata_app/schemas/`
- NDI-python schema registry (find via `rg "class_name" NDI-python/src/`)
- The actual `class_name` strings emitted in test fixtures

**Specific names to verify:**
`subject`, `openminds_subject`, `subject_group`, `probe`, `probe_location`, `element`, `element_epoch`, `epochid`, `stimulus_presentation`, `stimulus_response`, `vmspikesummary`, `treatment`, `treatment_drug`, `treatment_transfer`, `ontologyTableRow`, `ontologyLabel`, `dataset`, `session`, `session_in_a_dataset`

Note spelling, casing, and underscore use carefully — `vm_spikesummary` ≠ `vmspikesummary`.

### Dimension 4: System prompt + tool descriptions

**Files:**
- `apps/web/lib/ai/system-prompt.ts`
- `apps/web/lib/ai/chat-tools.ts`

**Method:** read every factual claim about NDI behavior, NDI document classes, NDI query semantics. Cross-reference against ground truth. Common error pattern: prompt says "the `depends_on` array carries N-way references" but the actual schema has a different structure.

### Dimension 5: Visual UX QA (the most user-facing)

**Method:** Playwright against the live preview (`https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app`). Test creds: `audri+test@walthamdatascience.com / remhuz-ruwfy4-jiGcen`. Use real datasets: Bhar, Haley, Francesconi.

For each picker (Subjects / Sessions / Probes / Stimuli / Documents):
1. Scroll the page partway down (to where the analysis cards are partially visible).
2. Click a row in the picker. **Does the page scroll position survive?** (The bug the user flagged: row click resets to top.)
3. Open the right-click context menu. Open the kebab menu. Verify identical action lists.
4. Multi-select 3 rows. Click "Ask Claude about these". Does AskPanel open + chat pre-fills with the IDs?
5. Group by Strain. Verify rows collapse into group headers with member counts. Sum equals total row count.
6. Sort by one column, then Shift+click another. Verify priority badges + sort order.
7. Open a column filter popover. Type substring; toggle distinct values. Verify rows narrow correctly.
8. Drag a column-resize handle. Verify the column widens; layout doesn't shift.
9. Type in the global search. Rows narrow to substring matches.

For each analysis card:
1. With selection cleared, verify cold-start illustration renders for SignalViewer/PSTH/SpikeActivity.
2. Pick a subject + session. Watch the SignalViewer card — does it pulse brand-blue briefly, then render the chart?
3. Pick a different session. Does the chart re-render?
4. Open AskPanel with selection set. Ask "what's the current selection?" — does the response name the dataset + subject id?

**Save screenshots to `audit/2026-05-18-comprehensive-audit/visual-qa/`.**

### Dimension 6: Carryability spot-checks

**Method:** for each language tab in UseThisDataModal + each panel's "Show Code" output, take the snippet and verify it's syntactically valid + uses real NDI functions. Don't just pattern-match; trace each function call.

### Dimension 7: Efficiency opportunities

**Method:** scan cloud-app for patterns that should use canonical primitives but don't:
- N parallel `/documents/{id}` GETs → should use `/documents/bulk-fetch`
- Class-by-class fetches + JS filtering → should use `/ndiquery` with `isa`
- Computing dataset.subjects from doc count when `dataset.numberOfSubjects` is on the record
- Pagination clients don't honor backend's actual cap (200)

---

## Methodology — how post-compaction-Claude should execute this

### Step 1: Confirm ground truth is still at HEAD
```bash
cd ~/Documents/ndi-projects && for repo in NDI-python NDI-matlab NDR-python NDR-matlab DID-python DID-matlab DID-schema ndi-data-browser-v2 ndi-cloud-node ndi-cloud-app; do
  echo "=== $repo ==="; cd ~/Documents/ndi-projects/$repo && git pull --ff-only 2>&1 | tail -1
done
```

If any has moved, note it; the audit findings might shift.

### Step 2: Read the ground-truth swagger spec
**`/Users/audribhowmick/Documents/ndi-projects/_audit-deps/NDI-cloud-api-swagger.md`**

This file has the full endpoint table + model schemas. It's authoritative for `/v1/*` Cloud API contract.

### Step 3: Dispatch 4 parallel agents

Each takes one dimension. They run concurrently; you synthesize at the end.

**Agent A — Export-layer audit (Dimensions 1 + 6)**
- Files: `code-export/*.ts`, `viewer/pythonSnippet.ts`, `UseThisDataModal.tsx`, `cli-parity.md`, `ask-prefill-bus.ts`
- Cross-reference every emitted function name against NDI-python + NDI-matlab actual exports.
- Carry the **MATLAB `ndi.query` constructor** finding forward — confirm + suggest fix.
- Carry the `ndi.fun.docTable.subject` / `ndi.fun.doc_table.subject` paths — verify exact dotted paths exist.

**Agent B — Runtime-layer audit (Dimension 2)**
- Files: every file in `lib/ndi/tools/`, `app/api/datasets/[id]/*/route.ts`, `lib/api/{documents,tables,datasets}.ts`
- For each URL: extract method + payload + assumed response. Cross-reference against `ndi-data-browser-v2/backend/routers/`.
- **Resolve the `doc.data` question** — trace `useDocuments` through the Railway backend; verify whether `data` is added or assumed.
- Carry the `/document-class-counts` (hyphen) verification.

**Agent C — Schema + system-prompt + chat-tool audit (Dimensions 3 + 4)**
- Files: `lib/ai/system-prompt.ts`, `lib/ai/chat-tools.ts`, every hardcoded class name across the cloud-app
- Verify every class name against NDI schemas.
- Verify every factual claim in the system prompt against ground truth.
- Verify every chat-tool description matches the actual underlying capability.

**Agent D — Visual + end-to-end QA (Dimension 5)**
- Playwright on the live preview against 3 real datasets.
- Document every break with screenshot + reproduction steps.
- Specifically check: scroll-position-preservation on row click; pulse fires; AskPanel context; bulk action wires the prompt; group-by counts add up to total; sort priority badges; column filter narrows; column resize works; cold-start illustrations render; panel pulse on selection change.

### Step 4: Synthesize + triage

Each agent returns a punch list. You merge into one report at `apps/web/docs/reviews/2026-05-18-comprehensive-audit-findings.md`. Categories:
- **Confirmed correct** (terse)
- **Real bugs** (severity + file:line + fix)
- **Runtime endpoint mismatches** (highest impact)
- **Response-shape assumptions** (the `doc.data` family)
- **Stale comments / descriptions**
- **Invented function names**
- **Stale wrappers**
- **Wrong layer**
- **Efficiency opportunities**

End with "Top 10 bugs to fix immediately, ordered by impact."

### Step 5: Fix what's findable

For each bug in the top 10:
1. Make the change
2. Update tests
3. Run lint + typecheck + full test suite
4. Commit with a clear message that names the audit finding it addresses

For bugs that are backend-owned (Railway changes), document them as followups in `docs/specs/2026-05-18-backend-followups.md`.

### Step 6: Push + verify Vercel build succeeds

Same flow as prior commits. Watch for the pnpm-lock gotcha (covered in `CLAUDE.md`).

### Step 7: Re-run visual QA against the fixed preview

For each fix that was UX-related, sit at a real scroll position and verify the fix actually changes what was reported.

---

## Reporting deliverables

When the audit is done, the user should have:

1. **`docs/reviews/2026-05-18-comprehensive-audit-findings.md`** — the synthesized report
2. **`audit/2026-05-18-comprehensive-audit/visual-qa/`** — screenshots
3. **`docs/specs/2026-05-18-backend-followups.md`** — backend-owned tickets if any
4. **A series of commits** fixing the actionable findings, each with a clear message
5. **A push to `feat/experimental-ask-chat`** with the fixes
6. **A summary message** for the user that lists what was found, what was fixed, what's deferred

---

## Time budget guidance

Rough estimate for post-compaction execution: 60-90 minutes wall-clock, dominated by parallel agent run-time. Don't try to compress this — the value is thoroughness.

If you find you're running out of context window, prioritize:
1. Real bugs that cause silent runtime failures (Dimension 2 / `doc.data`)
2. Visual UX bugs the user can see (Dimension 5)
3. Invented function names in user-facing snippets (Dimension 1)
4. Efficiency opportunities and stale comments — these can land in a followup round

---

## Notes for the next session

- The current todo list is pointing at this exact plan. Read it first.
- The user is ready for compaction NOW. After compaction, immediately load this plan and execute Step 1.
- Don't relitigate the architecture choices — Phase F/G/H are settled. This audit is about correctness, not redesign.
- If the audit surfaces a redesign question, capture it as a separate ADR draft, don't try to land it inline.

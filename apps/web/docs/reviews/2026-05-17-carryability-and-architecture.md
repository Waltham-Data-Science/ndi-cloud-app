# Phase H — carryability & architecture review

**Date:** 2026-05-17
**Author:** Claude (post-Phase-H, pre-compaction)
**Scope:** familiarity / carryability across web ↔ MATLAB ↔ Python; efficiency vs. NDI-python leverage

---

## 1. Familiarity & carryability — web ↔ MATLAB ↔ Python CLI

A power user who works in MATLAB or a local Python notebook should
recognize the same vocabulary, the same identifiers, and the same
operations when they sit down at the web workspace. The reverse must
also hold: anything they can do on the web should be reproducible in
their CLI session with one paste.

### What works today

| Surface | Web | MATLAB | Python | Same? |
|---|---|---|---|---|
| Document classes (`subject`, `element_epoch`, `probe`, `vmspikesummary`, `stimulus_presentation`) | shown verbatim in Documents picker + URL params | same class names | same | ✓ |
| Doc IDs (24-hex ObjectId, 32-hex compound, `NSUBJ-005-PR811` local id) | full id in chip / URL / clipboard | same | same | ✓ |
| `depends_on` chains | `walk_provenance` tool + chat citations | `dependency()` traversal in NDI-matlab | `ndi.query` Python | ✓ |
| Ontology terms (UBERON / NCBITaxon / CL / WBStrain) | clickable pills + ontology IRIs | `ndi.ontology` package | `ndi.ontology` module | ✓ |
| Filter syntax | TanStack column filter + global search | `q = ndi.query.create(...)` | identical Python call | ✗ different DSL |
| Sort + group | TanStack | `sortrows` / `groupcounts` | `pandas` | ✗ different idioms |

### What's broken or missing

**B1. ShowCodeButton MATLAB snippets emit `% TODO:` comments for
several tools.** Specifically `tabular_query` and `fetch_signal`
have no MATLAB equivalent surfaced yet — the user gets a starting
point with a placeholder call. From `lib/ndi/code-export/matlab.ts`:

```matlab
% TODO: tabular_query has no MATLAB-side wrapper; use ndi.query directly.
% Placeholder: q = ndi.query.create('class', 'exact', 'subject');
```

This is honest but doesn't help a MATLAB-first user reproduce the
exact query. **Action:** when NDI-matlab gains the wrappers
(NDI-matlab issue tracker), update the snippet generator to emit
the canonical calls. No cloud-app change blocks this.

**B2. Picker tab sub-menus and column-visibility menus are
web-only ergonomics.** A user who learns to multi-select + group-by
on the web won't see those affordances in a MATLAB / Python
session. **This is fine** — the web is an additive interface, not
a replacement. The carryability bar is "does the OUTPUT (the
filtered/grouped set of doc IDs) round-trip?" and YES, the user
can copy ids from the selection bar / right-click "Copy ID" /
multi-select → "Copy N IDs" and paste those into any NDI call.

**B3. The auto-prefilled AskClaude prompt format is web-specific.**
When the user multi-selects 3 subjects + clicks "Ask Claude
about these subjects", the prompt looks like:

```
Tell me about these 3 subjects in this dataset:

  - 4126945ae99b0be0_40c293809848f24d
  - 68d6e54703a03f5cfdac8eff
  - NSUBJ-005-PR811

Use whatever tools you need (query_documents, walk_provenance,
fetch_signal, etc.) to answer.
```

The tool names (`query_documents`, `walk_provenance`) are NDI-Ask
chat-tool names, NOT NDI Python / MATLAB function names. A user
who reads this and asks "where's `query_documents` in my Python
session?" will be confused. **Action:** rename the prompt's tool
hints to NDI SDK function names — e.g. `ndi.query.find(...)` /
`ndi.query.dependencies(...)`. Edit:
`apps/web/lib/ai/ask-prefill-bus.ts` `buildPrefillPrompt`.

**B4. Chat tool citations link to web URLs (`/datasets/[id]/...`).**
A MATLAB-first user reading a shared chat link gets web URLs, not
matlab commands. **Counter-action: tolerable** — the chat IS a web
surface; downstream MATLAB use comes through the "Show code"
export which DOES emit MATLAB function names. The citation chips
are correctly a web concept.

### Verdict — carryability

**Mostly there.** The identifier system (doc IDs, class names,
ontology terms) is fully consistent across the three surfaces.
The "Show code" export is the load-bearing carryability primitive
and works for ~80% of tool calls; the 20% gap is MATLAB-side
SDK wrappers that don't exist yet (upstream NDI-matlab issue).

**Concrete fix this round:** rename tool hints in
`buildPrefillPrompt` to NDI SDK function names.

**Documentation gap:** no single page tells a MATLAB user
"here's how to install ndi-matlab, here's the same query in
each environment, here's how to take a snippet from Show Code
and paste it into your editor." A short tutorial doc at
`apps/web/docs/operations/cli-parity.md` would close this.

---

## 2. Architecture & efficiency review — are we leveraging NDI-python?

The architectural decision is documented in **ADR-001 (Heart on
Railway)**: NDI-python orchestration lives in FastAPI, the Vercel
side is a thin shell that renders + dispatches. Phase H added a lot
of frontend features — let me audit whether we kept the heart in
the right place.

### What's correctly on Railway / NDI-python

| Concern | Where it lives | Verdict |
|---|---|---|
| NDI document fetch by class | `/api/datasets/:id/tables/:class` (NDI-python projection) | ✓ correct |
| NDI document fetch by id | `/api/datasets/:id/documents/:id` | ✓ correct |
| `depends_on` traversal | `/api/datasets/:id/documents/:id/dependencies` | ✓ correct |
| Class counts | `/api/datasets/:id/class-counts` | ✓ correct |
| Binary signal extraction (NBF, VHSB) | `/api/datasets/:id/elements/:id/signal` (`ndi-compress` + `vlt`) | ✓ correct |
| Spike-summary computation | `/api/datasets/:id/spike-summary` (NDI-python `vmspikesummary` reader) | ✓ correct |
| PSTH binning | `/api/datasets/:id/psth` (NDI-python stimulus+spike join) | ✓ correct |
| Treatment timeline orchestration | `/api/datasets/:id/treatment-timeline` (Python pandas + ordinal classifier) | ✓ correct |
| RAG embed + rerank | Voyage API via Railway-side helpers | ✓ correct |
| Tabular query | `/api/datasets/:id/tabular-query` | ✓ correct |
| `aggregate_documents` (Stream 4.9) | Backend port done 2026-05-15 (cloud-app is a thin wrapper) | ✓ correct |
| Ontology lookup | OLS4 + NDI-python `lookup_ontology` | ✓ correct |

### What's correctly on Vercel / cloud-app

| Concern | Where it lives | Verdict |
|---|---|---|
| Picker UI state (sort / filter / multi-select / group) | TanStack Table (client) | ✓ UI-only |
| Distinct-value computation per column | client (Phase H4) | ✓ trivial, no roundtrip win |
| Global search across visible cells | client (Phase H6) | ✓ instant feedback |
| AskPanel context + bus | client (Phase F + G) | ✓ UI plumbing |
| Selection state | URL params via `useWorkspaceSelection` | ✓ correct |
| Rate limiting | Vercel KV middleware | ✓ correct (ADR-007) |
| Cost tracking | Vercel Postgres `chat_usage_events` | ✓ correct |

### What's in the wrong place / where we're under-using Railway

**F1. StimuliPicker does its own merge of `stimulus_presentation`
+ `stimulus_response`.** Two `useDocuments` calls + client-side
type extraction in `projectStimulusRow`. Each call caps at 200
(backend limit) so datasets with >200 stimuli of either class get
silently truncated.

**The right shape:** a `/api/datasets/:id/tables/stimulus`
backend projection that:
- Combines both classes server-side
- Projects to `{ docId, type, presentationCount, shortId }`
- Returns the full set in one paginated response (mirrors
  `/tables/subject`, `/tables/probe`)

Cloud-app would then call `useSummaryTable('stimulus')` like every
other picker.

**Action:** ndi-data-browser-v2 backend ticket. Out of scope for
cloud-app this round; the 200-cap workaround landed in commit
4b2d22d so the picker doesn't error.

**F2. Subject cascade for Sessions is client-side post-fetch.**
`SessionsBrowser` fetches ALL element_epoch docs, then filters in
JS by `subjectDocumentIdentifier`. For datasets with >5k epochs
that's wasteful.

**The right shape:** `/api/datasets/:id/tables/element_epoch?subject=X`
backend-side filter. Phase F audit's B1 finding noted the backend
`element_epoch` projection is broken for many datasets — fixing the
projection should land WITH a `?subject=` filter param so the
cascade can move to the server.

**Action:** ndi-data-browser-v2 backend ticket. Cloud-app cascade
is a workaround.

**F3. The DocumentsPicker's class-list view computes counts by
calling `useClassCounts` — but the doc-list view fetches docs and
counts client-side from the array length.** Asymmetric. For datasets
with thousands of docs per class, the `useDocuments(1, 200)` call
truncates and the count is misleading.

**The right shape:** the existing backend `/api/datasets/:id/documents`
endpoint already returns a `total` count alongside the rows. We
should display `total` (server count) instead of `documents.length`
(client count after the 200-row truncation).

**Action:** ~5-line cloud-app fix. Not urgent — affects only datasets
with >200 docs per class, and the picker is a doc-finder not a
roster.

**F4. The PSTH panel + Signal viewer both auto-run on context
change without checking if the previous result is still valid.**
If a user picks session A → chart renders → picks session B →
chart re-fetches → picks session A again → re-fetches AGAIN.
TanStack Query handles dedup within the same key but our request
body is the panel state, not stable.

**The right shape:** the panel mutations should use stable query
keys (datasetId + relevant selection ids) so repeated picks within
a short window hit the cache.

**Action:** ~10-line cloud-app refactor per panel. Low-priority
caching win.

### What's overengineered (could be simplified)

**O1. Multiple snippet generators.** We have
`lib/ndi/code-export/{python,matlab}.ts` for chat-exported code AND
`lib/viewer/pythonSnippet.ts` for the data-browser pivot view.
Different surfaces, different shapes, same intent. Could be one
shared generator — but the audience and call-shape differs, and the
duplication is ~200 LOC of mappings, not architecture. **Leave as
is.**

**O2. The picker rail has 5 sub-tabs (Subjects / Sessions / Probes
/ Stimuli / Documents) when 4 of the 5 are special cases of
Documents.** A more abstract approach would be one Documents
picker filtered by class. We chose 5 because the picker-rail UX
benefits from specialized projections (a Subjects picker shows
`speciesName` columns; a generic doc picker can't). **Leave as is**
— the duplication is a feature, not a bug.

**O3. Three Radix primitive packages** (`react-context-menu`,
`react-dropdown-menu`, `react-popover`) for slightly different
menu shapes. Could consolidate to one popover + custom keyboard
handling. But each Radix package brings correct a11y semantics for
its specific affordance (ContextMenu has Shift+F10 / Menu-key
handling; DropdownMenu has tab-trap; Popover has anchored content
positioning). **Leave as is** — the ~12 kB total bundle adds the
right behavior for each.

### Architecture grade — overall

**A.** The heart-on-Railway rule has been respected through Phase
F-H. New cloud-app surfaces are UI plumbing — selection state,
filter/sort UI, kebab menus, illustrations — none of them
duplicate NDI-python work. The two backend gaps (F1 stimulus
projection, F2 session subject filter) are real and tracked in
ndi-data-browser-v2; cloud-app workarounds are clearly documented
as such.

**One immediate fix landed this round** — StimuliPicker 500 → 200
to match the backend cap (commit `4b2d22d`).

**Two architectural workarounds documented** — F1 stimulus
projection + F2 session subject filter — both need
ndi-data-browser-v2 backend changes, not cloud-app changes.

---

## 3. The lockfile bug — process change

Phase G's `pnpm add` step updated the root-level `pnpm-lock.yaml`,
but `git add -A apps/web` scoped to the subdir — so the lockfile
update silently dropped from commits b3b4305 (Phase G) and
95cdeba (Phase H). Vercel CI with `--frozen-lockfile` failed.

**Fixed in commit `61562ff`** — `git add pnpm-lock.yaml` explicitly
from repo root, lockfile catches up with all three Radix
additions.

**Process change:** every `pnpm add` MUST be followed by
`git add pnpm-lock.yaml` from the repo root. Or use `git add -A`
from the repo root (not from `apps/web/`). Adding a note to
CLAUDE.md so future sessions catch it.

---

## Summary — what landed in this review round

| Action | Commit |
|---|---|
| Lockfile catch-up (G + H + popover) | `61562ff` |
| StimuliPicker pageSize 500 → 200 | `4b2d22d` |
| This review doc | next commit |

## Open items captured (not fixed here)

1. **B3** — rename tool hints in `buildPrefillPrompt` to NDI SDK function names. ~10-line cloud-app fix.
2. **F1** — backend `/tables/stimulus` projection. ndi-data-browser-v2 ticket.
3. **F2** — backend `/tables/element_epoch?subject=` filter param. ndi-data-browser-v2 ticket.
4. **F3** — DocumentsPicker should show `total` from API response, not array length. ~5-line cloud-app fix.
5. **F4** — Panel mutations should use stable query keys for repeat-pick dedup. ~10 LOC per panel.
6. **Carryability doc** at `docs/operations/cli-parity.md` — short tutorial showing the same query in web + MATLAB + Python.

These are all small. I'll address B3 + F3 + the cli-parity doc inline next, before compaction.

# Upstream repo asks — ndi-python, ndi-matlab, ndi-cloud-node

Captures every dependency on the three upstream NDI repos that we've
identified while building the chat + workspace + data-browser surfaces.
This is a *to-do for the upstream maintainers* — we're not editing
those repos from this session. Filed so the team can prioritize the
upstream work independently of ndi-cloud-app + ndi-data-browser-v2
sprints.

Each item is tagged:
- **BLOCKING** — something we worked around but the workaround is a
  stopgap; the canonical fix lives upstream.
- **ENHANCEMENT** — would make our code cleaner / faster but our
  current workaround is acceptable indefinitely.
- **CANONICALIZATION** — data-shape consistency upstream would let
  us drop defensive "try multiple field paths" logic in N consumer
  repos.

---

## ndi-python

The Python SDK that ndi-data-browser-v2's services call into for
binary decoding, ontology lookup, dataset materialization, and
session construction.

### 1. WBStrain provider scraping — BLOCKING

**Current state:** `ndi.ontology.lookup("WBStrain:00000001")` returns
a result with `url` set to the WormBase strain page but `label`
empty. The frontend / backend rendered the bare strain ID
("00000001") as the user-facing label because the resolution chain
gave us no name.

**Workaround shipped (ndb-v2 commit `6b1b9ef`):** added a Cloudflare-
aware scrape in `_fetch_wormbase` that fetches the strain page and
parses the strain name from `<title>` / breadcrumb. With graceful
fallthrough to `label=None` on any failure (timeout, parse miss,
Cloudflare 403). In practice the scrape returns `None` from Railway
datacenter IPs because WormBase blocks non-browser UAs.

**Asked-of-upstream:** `ndi.ontology.lookup` should return the
resolved strain name in `label`. Either:
- Pull from WormBase's BioMart bulk download (non-Cloudflare path)
  at session-startup time and cache locally; OR
- Negotiate a Cloudflare bypass with WormBase ops; OR
- Bundle a static WBStrain name → label table sourced from the
  WBStrain release artifact.

**Verification:** after the upstream fix, our ndb-v2 scrape fallback
in `_fetch_wormbase` becomes dead code; the cache stub-bypass at
`ontology_service.py` line ~70 will route to the (working) NDI-python
call and the label will surface end-to-end. We can remove the scrape
+ keep the cache-bypass.

### 2. `ndi.cloud.orchestration` not installed in Railway image — BLOCKING

**Current state:** the `ndi_dataset_overview` chat tool (Sprint 1.5
"SDK-derived element/subject/epoch counts" endpoint) returns 503
`{error: "dataset binding unavailable", code: "binding_unavailable"}`
on the experimental Railway preview. The handler tries
`ndi.cloud.orchestration.downloadDataset(...)` and the import fails.

**Workaround shipped (ndb-v2 commit `aa11de6`):** typed `code` field
in the 503 envelope so the chat tool's fallback logic ("use
ndi_query instead") fires cleanly + diagnostics are routable in
dashboards.

**Asked-of-upstream:** either (a) ship `ndi.cloud.orchestration` as a
properly-installable PyPI package the Railway image can `pip install`,
or (b) document the missing dependency in the deploy runbook so
ndb-v2 maintainers can add it. Today the symptom is that the
Sprint-1.5 surface is dark in production.

**Verification:** `python3 -c "from ndi.cloud import orchestration"`
on Railway should succeed without error. The 503 binding-unavailable
envelope should disappear; the tool should return real element /
subject / epoch counts.

### 3. Code-export Python snippets reference unconfirmed API surfaces — ENHANCEMENT

**Current state:** our `lib/ndi/code-export/python.ts` generators
emit snippets that call:
- `ndi.session.Session(...)`
- `ndi.query.Query` with the operations DSL
- `ndi.cloud.api.documents.getDocument`
- `ndi.cloud.filehandler.get_timeseries`
- `ndi.cloud.filehandler.get_image`
- `ndi.database.openbinarydoc`

We assumed those names match what NDI-python actually ships. If any
name has drifted, the snippets we hand to users won't run.

**Asked-of-upstream:** publish a stable "NDI-python public API
reference" doc that names the canonical paths for:
- Cloud-side document fetch (single doc, by id)
- Cloud-side query (NDI Query DSL execution)
- Binary doc open (for spike times, signals, images)
- Session construction from a cloud dataset id (currently it's
  hard to build a session over a cloud dataset without local files
  — see ndi-matlab item 3 below)

**Verification:** run each emitted Python snippet against the
current NDI-python release in a fresh venv. Any `AttributeError`
becomes a documentation patch in this repo or an API patch upstream.

### 4. PSTH-related stimulus event extraction — CANONICALIZATION

**Current state:** the new ndb-v2 PSTH endpoint (`/api/datasets/{id}/psth`,
in flight at the time of writing) needs to extract event timestamps
from stimulus_presentation / stimulus_response docs. Defensively
tries multiple paths:
- `data.stimulus_presentation.presentations[i].time_started`
- `data.stimulus_response.responses[i].stim_time`
- Top-level `events: [...]` for preprocessed docs

**Asked-of-upstream:** either expose a canonical NDI-python helper
`ndi.events.get_event_times(doc)` that handles every doc-class
variant internally, OR publish a "canonical event-time field" spec
that dataset authors are expected to follow. Today every consumer
that needs stimulus event times has to re-implement the same
defensive try-multiple-paths walk.

**Verification:** the PSTH service's `_extract_stimulus_events`
shrinks to one call: `ndi.events.get_event_times(doc)`.

---

## ndi-matlab

The MATLAB SDK that ndi-cloud-app's `code-export/matlab.ts`
generators emit snippets against.

### 1. Cloud-only `ndi.session` construction — BLOCKING

**Current state:** our MATLAB snippets for `fetch_signal`,
`fetch_image`, and `fetch_spike_summary` all hit the same wall —
`database_openbinarydoc` requires an `ndi.session` object, but the
MATLAB SDK doesn't expose a path to build a session from just a
cloud dataset id without local files on disk. The snippets emit:

  ```matlab
  % TODO: openbinarydoc requires an ndi.session — construct one via
  %   S = ndi.session.dir('/path/to/local/copy');
  % OR (once available) via a cloud-direct constructor
  ```

**Workaround shipped:** the snippet emits an `imread(...)` /
placeholder line that runs once the user wires up a local session.
Not exactly a stopgap because we honestly can't fix this in our
repos — the workaround is "edit the snippet."

**Asked-of-upstream:** ship a cloud-direct session constructor:

  ```matlab
  S = ndi.cloud.session('dataset_id_24_char_hex');
  ```

  that uses ndi.cloud.api under the hood without requiring local
  files. Then our MATLAB snippets become single-shot runnable.

**Verification:** snippet copy → paste into MATLAB → runs against
the user's cloud auth session without modification.

### 2. Ontology lookup wrapper "in flux" — ENHANCEMENT

**Current state:** our MATLAB code-export emits a TODO comment for
`lookup_ontology` calls:

  ```matlab
  % TODO: NDI-matlab's ontology lookup wrapper is in flux — until a
  %   stable namespace lands, call the cloud HTTP API directly via
  %   webread / urlread.
  ```

**Asked-of-upstream:** stabilize an `ndi.ontology.lookup(term)`
wrapper in NDI-matlab that hits either OLS4 / NCBI / WormBase via
the same fallback chain ndi-python uses.

**Verification:** the TODO comment vanishes; the snippet calls
`ndi.ontology.lookup(...)` directly.

### 3. Treatment-timeline / spike-summary / image equivalents missing — ENHANCEMENT

**Current state:** MATLAB code-export emits commented-out helpers
for treatment_timeline, fetch_spike_summary, and fetch_image
because MATLAB-side wrappers for these aggregation flows don't yet
exist. Python has reasonable equivalents (via numpy + matplotlib);
MATLAB equivalents would be:
- Treatment timeline: a `patch()`-based Gantt helper
- Spike raster: a `plot` with `|` markers
- ISI histogram: `diff(sort(t)) * 1000` + `histogram`

We've emitted these inline. They're tedious enough that an
`ndi.plot.*` namespace would help.

**Asked-of-upstream:** an `ndi.plot.*` collection covering raster,
ISI histogram, Gantt, image heatmap. The plot helpers don't have to
be sophisticated — they just need to exist so the snippets can
call `ndi.plot.spike_raster(unit_doc, tWindow)` instead of
hand-rolling.

**Verification:** the snippets shrink from ~30 lines each to ~5.

---

## ndi-cloud-node

The upstream NDI cloud (Node.js + Mongo, holds the actual data
+ runs the underlying `ndiquery` endpoint). Our ndb-v2 is a typed
FastAPI proxy in front of it.

### 1. `isa probe` query doesn't walk class lineage — ENHANCEMENT

**Current state:** when a user / chat tool issues
`scope=<dataset> · isa probe`, the cloud's query engine performs a
LITERAL class match. Modern NDI datasets store probes as
`element` documents (the probe class lineage was unified upstream).
For these datasets, `isa probe` returns zero rows even though the
data is right there as `element` docs.

**Workaround shipped (ndb-v2 commit `aa11de6`):** added an alias
map `probe → element`, `epoch → element_epoch` in
`SummaryTableService._build_single_class`. When the literal class
returns 0 ids, we retry the alias and re-project columns under the
user-requested name.

**Asked-of-upstream:** the cloud's `isa` operator should walk the
class lineage BACKWARD (a query for `isa probe` matches any
document whose class inherits from `probe`, including `element`).
This would make ndb-v2's alias map dead code and align with NDI's
own data-model semantics.

**Verification:** `POST /ndiquery` with `searchstructure=[{operation:
"isa", param1:"probe"}]` on a modern dataset returns the same N
rows as `isa element`. The alias map in ndb-v2 can be deleted.

### 2. Caenorhabditis elegans duplicate facet — CANONICALIZATION

**Current state:** the cloud's `/api/facets` aggregation returns
two entries for `Caenorhabditis elegans` because two contributing
datasets disagree on the ontologyId — one carries
`NCBITaxon:6239`, the other carries `ontologyId: null`. Same label,
different keys → two facet bins.

**Workaround shipped (ndb-v2 commit `6b1b9ef`):** in
`_FacetAccumulator`, register all candidate keys (oid + abbrev +
norm) as aliases per bucket; merge on label match while preserving
the labeled-side's ontologyId.

**Asked-of-upstream:** at ingestion time, the cloud should
canonicalize species labels to a fixed ontologyId (looking up by
label in NCBITaxon if the dataset's openminds emission left it
null). This eliminates the merge ambiguity at the source instead
of every downstream surface re-implementing the dedup.

**Verification:** `/api/facets` returns a single bin for
`Caenorhabditis elegans` (and every other species) regardless of
which contributing dataset shipped which ontologyId form. The
backend dedup helpers can be simplified.

### 3. Probe location coordinate field naming — CANONICALIZATION

**Current state:** `probe_location` documents carry coordinates
under one of several paths depending on dataset / NDI version:
- `data.probe_location.coordinates: {x, y, z?}`
- `data.probe_location.x` + `.y` + `.z?` (flat fields)
- Some legacy datasets ship neither

The new electrode-position-view panel (in flight) defensively
tries both shapes; same defensive walk in ndi-python /
ndi-matlab clients.

**Asked-of-upstream:** at ingestion time, normalize probe_location
docs to a single canonical shape (preferably nested
`coordinates: {x, y, z?}` with units in micrometers in the doc
header). Document the shape in the NDI data-model spec.

**Verification:** the electrode panel's `extractCoordinates(doc)`
helper drops to a single field access; ndi-python / ndi-matlab
follow suit.

### 4. Stimulus event timestamp field naming — CANONICALIZATION

Companion to ndi-python item 4 above. The PSTH service walks
multiple paths to find stimulus event times:
- `data.stimulus_presentation.presentations[i].time_started`
- `data.stimulus_response.responses[i].stim_time`
- Top-level `events: [...]`

**Asked-of-upstream:** normalize at ingestion time. Either a fixed
canonical path (`data.events[i].time`) or a typed schema with
required fields that the cloud validates on submission.

**Verification:** the PSTH service's stimulus-extraction helper
becomes a one-liner.

### 5. Treatment doc explicit-vs-ordinal timing — CANONICALIZATION

**Current state:** the new treatment-timeline endpoint (ndb-v2
commit `93f2887`) tags each timeline item with
`temporal_source: "explicit" | "ordinal" | "mixed"` because some
datasets ship explicit per-treatment `numericValue: [start, end]`
arrays while others don't — when missing, we assign ordinal slots.

**Asked-of-upstream:** ingestion-time canonicalization — every
treatment doc carries either explicit timing or a documented "no
timing recorded" flag. Defensive callers can stop computing
ordinal fallbacks; the chart caption can say "no timing" honestly
without our heuristic.

**Verification:** the treatment-timeline service drops the
`_extract_explicit_timing` helper's branch tree.

---

## Summary table — by priority

| # | Repo | Item | Priority |
|---|---|---|---|
| 1 | ndi-python | WBStrain provider returns no label | BLOCKING |
| 2 | ndi-python | `ndi.cloud.orchestration` not Railway-installable | BLOCKING |
| 3 | ndi-matlab | No cloud-direct `ndi.session` constructor | BLOCKING |
| 4 | ndi-python | Code-export API surface confirmation | ENHANCEMENT |
| 5 | ndi-matlab | Ontology lookup wrapper stabilization | ENHANCEMENT |
| 6 | ndi-matlab | `ndi.plot.*` namespace for spike/Gantt/ISI/image | ENHANCEMENT |
| 7 | ndi-cloud-node | `isa` lineage-walking | ENHANCEMENT |
| 8 | ndi-python | Canonical stimulus-event helper | CANONICALIZATION |
| 9 | ndi-cloud-node | Species ontologyId canonicalization at ingestion | CANONICALIZATION |
| 10 | ndi-cloud-node | Probe coordinate field naming | CANONICALIZATION |
| 11 | ndi-cloud-node | Stimulus event timestamp canonicalization | CANONICALIZATION |
| 12 | ndi-cloud-node | Treatment timing canonicalization | CANONICALIZATION |

The 3 BLOCKING items are the urgency — each one makes a real
production surface fail or render wrong today. The ENHANCEMENT
items would save us code (some volumes are non-trivial — the
MATLAB `ndi.plot.*` ask in particular). The CANONICALIZATION items
shift complexity from every downstream consumer (us + chat + future
desktop GUI + Python CLI + analyses scripts) to one ingestion
point upstream — biggest leverage long-term.

None of these need to be done this sprint. The cloud-app +
ndb-v2 work proceeds with the workarounds in place. Re-raise when
the upstream sprints next plan.

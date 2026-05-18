# CLI parity — same query, three surfaces

**Audience:** scientists fluent in MATLAB or Python who want to
flow between the web workspace and their CLI without learning a
third vocabulary.

The NDI Web Workspace, NDI-matlab, and NDI-python all expose the
same dataset model — typed documents, `depends_on` chains,
ontology-grounded vocabulary, binary signal access. This page
shows the same query in each surface so the round-trip is
explicit.

**Audit history:** the original draft of this doc invented several
SDK function names (`ndi.query.find`, `ndi.query.dependencies`,
`ndi.cloud.api.files.read_signal`, `ndi.cloud.api.psth.compute`,
`ndi.query.table_from_documents`) that don't exist in either NDI
toolbox. The audit on 2026-05-18 replaced every snippet with names
verified against NDI-matlab @ `0c94d92` and NDI-python @ `9c64acb`.
If you find a snippet here that doesn't work in your install, it's
a bug — open an issue.

---

## Setup

| Surface | Install |
|---|---|
| Web | already running — `https://ndi-cloud.com/datasets/[id]` |
| MATLAB | `>> ndi_setup` (root-level script; see ndi-matlab README); requires MATLAB R2022a+ |
| Python | `pip install ndi-python` |

All three share the same dataset ids, document classes, and
identifier formats.

---

## Authentication

Web is cookie-authenticated. CLI surfaces both share the same
`NDI_CLOUD_USERNAME` + `NDI_CLOUD_PASSWORD` env vars, or pick up a
prior `ndi login` session.

**MATLAB:** every `ndi.cloud.api.*` wrapper returns
`[b, answer, apiResponse, apiURL]`. Always capture the second LHS:

```matlab
[success, answer] = ndi.cloud.api.<...>(...);
```

**Python:** each function returns the answer directly (no boolean
prefix). Pagination kwargs are `page=` + `page_size=`.

---

## Common queries — three ways

### 1. List all subjects in a dataset

**Web:** Workspace → Subjects picker (top-left of canvas).
Filters / sort / column visibility are local UI.

**MATLAB:**

```matlab
q = ndi.query('', 'isa', 'subject');
[success, summaries] = ndi.cloud.api.documents.ndiqueryAll( ...
    '67f723d574f5f79c6062389d', q, 'pageSize', 200);
% `summaries` is a struct array of {id, ndiId, name, className, datasetId}.
% Hydrate full bodies (with .data) via bulkFetch (max 500 per call):
[~, docs] = ndi.cloud.api.documents.bulkFetch( ...
    '67f723d574f5f79c6062389d', string({summaries.id}));
% Build a tidy table via the curated docTable helper (takes a session
% or dataset object, not a doc list):
% subjectTable = ndi.fun.docTable.subject(session);
```

**Python:**

```python
import ndi
import ndi.cloud.api.documents as doc_api
import ndi.cloud.api.datasets as ds_api
import ndi.query

ds_id = '67f723d574f5f79c6062389d'
ds = ds_api.getDataset(ds_id)
q = ndi.query.ndi_query.from_search("", "isa", "subject")
# ndiqueryAll auto-paginates; returned APIResponse is iterable.
docs = list(doc_api.ndiqueryAll(ds_id, q, page_size=200))
# For tidy tables, ndi.fun.doc_table.subject(dataset) is the curated
# helper — takes the ndi.dataset object you'd get from downloadDataset:
# import pandas as pd
# df = ndi.fun.doc_table.subject(dataset)
```

---

### 2. Filter to one strain

The canonical NDI subject schema has only `local_identifier` + `description`.
Strain / species metadata lives on `openminds_subject` or on the
backend's projection of the Subjects table. The MATLAB / Python
queries below use the openminds_subject path; the web UI uses the
backend's projection (so columns appear directly).

**Web:** Click the Strain column header → filter icon → type
"PR811" or pick from the whitelist. Or use the global search box.

**MATLAB:**

```matlab
q = ndi.query('', 'isa', 'openminds_subject') & ...
    ndi.query('openminds_subject.openminds_id', 'contains_string', 'PR811');
[~, summaries] = ndi.cloud.api.documents.ndiqueryAll(ds_id, q, 'pageSize', 200);
```

**Python:**

```python
q = (ndi.query.ndi_query.from_search("", "isa", "openminds_subject")
     & ndi.query.ndi_query.from_search(
        "openminds_subject.openminds_id", "contains_string", "PR811"))
matches = list(doc_api.ndiqueryAll(ds_id, q, page_size=200))
```

---

### 3. Walk dependencies for a subject's sessions

NDI has no out-of-the-box "walk dependencies" SDK helper today — the
web workspace's Sessions cascade is computed client-side from each
`element_epoch` doc's `depends_on` array. Same pattern in MATLAB /
Python: manual traversal.

**Web:** Pick the subject row (click). The Sessions picker
auto-narrows to that subject's `element_epoch` documents.

**MATLAB:**

```matlab
% Pull every element_epoch in the dataset, then filter to those
% whose depends_on chain ultimately reaches subjectDocId.
q = ndi.query('', 'isa', 'element_epoch');
[~, summaries] = ndi.cloud.api.documents.ndiqueryAll(ds_id, q, 'pageSize', 500);
[~, docs] = ndi.cloud.api.documents.bulkFetch(ds_id, string({summaries.id}));
% Build an id → docIndex map for fast lookups, then BFS from each
% element_epoch following `depends_on` until you hit the subject doc.
% Stop at depth 6 to bound the walk.
% (Pattern matches the Workspace's client-side cascade.)
```

**Python:**

```python
q = ndi.query.ndi_query.from_search("", "isa", "element_epoch")
summaries = list(doc_api.ndiqueryAll(ds_id, q, page_size=500))
ids = [s["id"] for s in summaries]
# bulkFetch hydrates the .data + .depends_on fields, max 500 per call.
docs = []
for offset in range(0, len(ids), 500):
    docs.extend(doc_api.bulkFetch(ds_id, ids[offset : offset + 500]))
# Now traverse: for each doc, follow doc["depends_on"][i]["value"]
# until you reach subject_doc_id or run out of edges (cap depth 6).
```

---

### 4. Read a signal trace

NDI's binary signal access goes through `database_openbinarydoc`,
which is a METHOD on a local `ndi.session` / `ndi.dataset` object,
NOT a package-level function. The user-side flow is: download the
dataset locally, then open the binary via the session.

The web workspace's Signal Viewer card calls a Railway-side endpoint
that decodes the binary server-side and ships a downsampled JSON.
That endpoint has no NDI SDK wrapper — Railway-only.

**Web:** Pick subject → pick session → Signal viewer card
auto-runs (Railway-side decode + LTTB downsample).

**MATLAB:**

```matlab
% Step 1: download the dataset (prompts for download dir the first time).
dataset = ndi.cloud.downloadDataset('67f723d574f5f79c6062389d');

% Step 2: open the element doc's binary via the local session.
S = ndi.session.dir([], '<local-dataset-path>');
fh = S.database_openbinarydoc(elementDocId, '<filename-from-doc.files>');

% Step 3: decode via the matching daq reader.
reader = ndi.daq.reader.<format>();
data = reader.readchannels_epochsamples( ... );
plot(data.time_seconds, data.values);
```

**Python:**

```python
# Step 1: download the dataset (target_folder is required positional).
dataset = ndi.cloud.downloadDataset(
    '67f723d574f5f79c6062389d', '~/ndi-datasets')

# Step 2: fetch the binary via the cloud filehandler.
# (Each element doc has files[i].uri = "ndic://...".)
import ndi.cloud.filehandler as fh
element_doc = doc_api.getDocument(ds_id, element_doc_id)
ndic_uri = element_doc['files'][0]['uri']
local_path = fh.fetch_cloud_file(ndic_uri)
# Step 3: decode with the matching format reader (NDI-python's
# binary decoders live under ndi.daq.reader.*).
```

---

### 5. PSTH around a stimulus

PSTH (peri-stimulus time histogram) computation lives at the Railway
backend — `POST /api/datasets/{id}/psth`. There is no user-side
SDK wrapper at HEAD on 2026-05-17. To replicate locally, hand-roll
the alignment: pull the vmspikesummary's `spike_times`, pull the
stimulus's `time_started` / `stim_time`, then for each event onset
collect spikes inside `[t0, t1]` and bin.

**Web:** Pick a unit (vmspikesummary document) + a stimulus
document. PSTH card auto-runs with default bin size (-0.5s → 1.5s,
20ms bins).

**MATLAB:**

```matlab
[~, unitDoc] = ndi.cloud.api.documents.getDocument(ds_id, unitDocId);
[~, stimDoc] = ndi.cloud.api.documents.getDocument(ds_id, stimulusDocId);
spikeTimes = double(unitDoc.data.vmspikesummary.spike_times);
events     = double(stimDoc.data.stimulus_presentation.time_started);
edges = -0.5:0.020:1.5; centers = edges(1:end-1) + 0.010;
aligned = [];
for k = 1:numel(events)
    rel = spikeTimes - events(k);
    aligned = [aligned; rel(rel >= -0.5 & rel <= 1.5)]; %#ok<AGROW>
end
counts = histcounts(aligned, edges);
bar(centers, counts / (numel(events) * 0.020));
xlabel('Time relative to stimulus (s)'); ylabel('Firing rate (Hz)');
```

**Python:**

```python
import numpy as np
import matplotlib.pyplot as plt

unit_doc = doc_api.getDocument(ds_id, unit_doc_id)
stim_doc = doc_api.getDocument(ds_id, stimulus_doc_id)
spike_times = np.asarray(
    unit_doc['data']['vmspikesummary']['spike_times'], dtype=float)
events = np.asarray(
    stim_doc['data']['stimulus_presentation']['time_started'], dtype=float)
edges = np.arange(-0.5, 1.5 + 0.020, 0.020); centers = (edges[:-1] + edges[1:]) / 2
aligned = np.concatenate([
    (spike_times - onset)[(spike_times - onset >= -0.5)
                          & (spike_times - onset <= 1.5)]
    for onset in events
]) if len(events) else np.array([])
counts, _ = np.histogram(aligned, bins=edges)
plt.bar(centers, counts / (max(1, len(events)) * 0.020), width=0.020)
plt.xlabel('Time relative to stimulus (s)'); plt.ylabel('Firing rate (Hz)')
plt.show()
```

---

## The "Show code" shortcut

When the chat in the web workspace runs a tool to answer a
question, the "Show code" button under the answer emits a
ready-to-paste snippet in MATLAB or Python with the exact tool
call sequence — same identifiers, same parameters. Click the
language tab at the top of the snippet.

If a snippet shows a `% TODO:` (MATLAB) or `# TODO:` (Python)
comment, that's a tool that doesn't have a MATLAB/Python SDK
wrapper yet (typically the Railway-only experimental analyses
like `psth`, `tabular_query`, `treatment_timeline`,
`fetch_signal`). The placeholder calls the closest existing
SDK function — refine as needed.

---

## Identifier formats — same across surfaces

NDI documents are identified by one of three id shapes; all are
accepted by every surface:

| Shape | Example | Use |
|---|---|---|
| 24-char hex (Mongo ObjectId) | `67f723d574f5f79c6062389d` | chart inputs, internal ids |
| 32-char compound `<hex>_<hex>` | `4126945ae99b0be0_40c293809848f24d` | NDI document_identifier |
| Local NDI identifier | `NSUBJ-005-PR811` | user-facing labels |

Copy from any web chip → paste into MATLAB / Python and it
works.

---

## Common gotchas

1. **Class names are case-sensitive.** `subject` not `Subject`,
   `element_epoch` not `Element_Epoch`. `vmspikesummary` is one
   word — NOT `vm_spikesummary`.
2. **`stimulus_presentation` vs `stimulus_response`** — different
   classes for stimulus metadata vs the per-trial response record.
   The web's Stimuli picker merges both; CLI users need to query
   each class.
3. **The web shortens compound ids on display** (`4126945a…f24d`)
   but the underlying chip / URL / Copy ID action carries the
   full 32-char value. Always paste the FULL id into MATLAB /
   Python.
4. **MATLAB `ndi.cloud.api.*` wrappers return `[b, answer, ...]`** —
   always capture two LHS values; the first is a success boolean.
   Forgetting this turns `dataset = getDataset(id)` into
   `dataset = true` and every downstream access errors.
5. **`ndi.cloud.api.documents.ndiquery / ndiqueryAll`** take the
   `ndi.query` OBJECT (not its `searchstructure` struct). The
   wrapper extracts the struct itself.
6. **`ndiqueryAll` returns summaries only** (id, ndiId, name,
   className, datasetId — no `data`). To get full bodies with
   `.data`, follow up with `bulkFetch(datasetId, ids)` in chunks
   of ≤500.
7. **`ndi.database` is a class, not a module.** There's no
   `ndi.database.openbinarydoc(...)` package function. Use
   `S.database_openbinarydoc(doc, filename)` (where `S` is a
   `ndi.session.dir` or `ndi.dataset.dir`) or
   `ndi.cloud.filehandler.fetch_cloud_file(<ndic-uri>)` for a
   direct binary download.
8. **Python `downloadDataset` requires a `target_folder` arg.**
   MATLAB's one-arg form prompts via `uigetdir`; Python has no
   GUI fallback yet.
9. **Python `getPublished` accepts only `(page, page_size, *, client=)`.**
   No server-side text-search arg — filter the returned dataset
   list client-side or use `ndiqueryAll` with
   `contains_string` on `dataset.description`.

---

## What's web-only (won't carry over)

- Multi-select + bulk actions — UI workflow, not a SDK call.
  After you multi-select 3 subjects on the web, copying the
  IDs and passing them to a `for` loop in your CLI is the
  CLI equivalent.
- Group-by aggregation in the picker — same as above. Use
  `groupcounts` (MATLAB) / `pandas.DataFrame.groupby` (Python).
- The right-click context menu's "Set as primary X" — that's
  workspace state, not a query.
- PSTH / spike summary / treatment timeline / signal decode —
  Railway-only computations. Hand-roll locally per §5 above.

---

## Update history

| Date | Change |
|---|---|
| 2026-05-17 | Initial. Tracks Phase H carryability review finding B3. |
| 2026-05-18 | Audit-driven rewrite. Replaced 7+ invented SDK names (`ndi.query.find`, `ndi.query.dependencies`, `ndi.cloud.api.files.read_signal`, `ndi.cloud.api.psth.compute`, `ndi.query.table_from_documents`, snake_case Python aliases, `ndi.database.openbinarydoc` as a package fn) with real names verified against NDI-matlab `0c94d92` + NDI-python `9c64acb`. Added MATLAB `[b, answer, ...]` capture rule and the ndiqueryAll → bulkFetch chain. |

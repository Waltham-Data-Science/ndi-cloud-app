# CLI parity — same query, three surfaces

**Audience:** scientists fluent in MATLAB or Python who want to
flow between the web workspace and their CLI without learning a
third vocabulary.

The NDI Web Workspace, NDI-matlab, and NDI-python all expose the
same dataset model — typed documents, `depends_on` chains,
ontology-grounded vocabulary, binary signal access. This page
shows the same query in each surface so the round-trip is
explicit.

---

## Setup

| Surface | Install |
|---|---|
| Web | already running — `https://ndi-cloud.com/datasets/[id]` |
| MATLAB | `>> ndi.setup` (see ndi-matlab README); requires MATLAB R2022a+ |
| Python | `pip install ndi-python` |

All three share the same dataset ids, document classes, and
identifier formats.

---

## Common queries — three ways

### 1. List all subjects in a dataset

**Web:** Workspace → Subjects picker (top-left of canvas).
Filters / sort / column visibility are local UI.

**MATLAB:**

```matlab
ds = ndi.cloud.api.datasets.get_dataset('67f723d574f5f79c6062389d');
subjects = ndi.cloud.api.documents.find(ds.id, ...
    'class', 'subject');
T = ndi.query.table_from_documents(subjects);
% T is a MATLAB table — sortable / filterable with `sortrows`,
% `groupcounts`, etc.
```

**Python:**

```python
import ndi
import ndi.cloud.api.datasets as ds_api
import ndi.cloud.api.documents as doc_api

ds = ds_api.get_dataset('67f723d574f5f79c6062389d')
subjects = doc_api.find(ds.id, cls='subject')
# subjects is a list of dataclass instances; convert to pandas:
import pandas as pd
df = pd.DataFrame([s.__dict__ for s in subjects])
```

---

### 2. Filter to one strain

**Web:** Click the Strain column header → filter icon → type
"PR811" or pick from the whitelist. Or use the global search box.

**MATLAB:**

```matlab
q = ndi.query.create('strainName', 'exact', 'PR811');
filtered = ndi.cloud.api.documents.find(ds.id, ...
    'class', 'subject', 'query', q);
```

**Python:**

```python
q = ndi.query.create(field='strainName', op='exact', value='PR811')
filtered = doc_api.find(ds.id, cls='subject', query=q)
```

---

### 3. Walk dependencies for a subject's sessions

**Web:** Pick the subject row (click). The Sessions picker
auto-narrows to that subject's `element_epoch` documents.

**MATLAB:**

```matlab
sessions = ndi.query.dependencies(ds.id, subjectDocId, ...
    'direction', 'downstream', ...
    'class', 'element_epoch');
```

**Python:**

```python
sessions = ndi.query.dependencies(
    ds.id, subject_doc_id,
    direction='downstream',
    cls='element_epoch',
)
```

---

### 4. Plot a signal trace

**Web:** Pick subject → pick session → Signal viewer card
auto-runs.

**MATLAB:**

```matlab
sig = ndi.cloud.api.files.read_signal(ds.id, elementDocId, ...
    'epoch', sessionDocId);
plot(sig.time_seconds, sig.channels(1).values);
xlabel(sig.x_label); ylabel(sig.units);
```

**Python:**

```python
import ndi.cloud.api.files as files
import matplotlib.pyplot as plt

sig = files.read_signal(ds.id, element_doc_id, epoch=session_doc_id)
plt.plot(sig.time_seconds, sig.channels[0].values)
plt.xlabel(sig.x_label); plt.ylabel(sig.units)
```

---

### 5. PSTH around a stimulus

**Web:** Pick a unit (vmspikesummary document) + a stimulus
document. PSTH card auto-runs with default bin size.

**MATLAB:**

```matlab
psth = ndi.cloud.api.psth.compute(ds.id, ...
    'unitDocId', unitId, ...
    'stimulusDocId', stimId, ...
    'binSizeMs', 20, ...
    't0', -0.5, 't1', 1.5);
bar(psth.binCenters, psth.counts);
```

**Python:**

```python
import ndi.cloud.api.psth as psth_api

p = psth_api.compute(
    ds.id, unit_doc_id=unit_id, stimulus_doc_id=stim_id,
    bin_size_ms=20, t0=-0.5, t1=1.5,
)
plt.bar(p.bin_centers, p.counts)
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
wrapper yet (typically the experimental analyses like
`tabular_query`). The placeholder calls the closest existing
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
   `element_epoch` not `Element_Epoch`.
2. **`stimulus_presentation` vs `stimulus_response`** — different
   classes for stimulus metadata vs the per-trial response record.
   The web's Stimuli picker merges both; CLI users need to query
   each class.
3. **The web shortens compound ids on display** (`4126945a…f24d`)
   but the underlying chip / URL / Copy ID action carries the
   full 32-char value. Always paste the FULL id into MATLAB /
   Python.

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

---

## Update history

| Date | Change |
|---|---|
| 2026-05-17 | Initial. Tracks Phase H carryability review finding B3. |

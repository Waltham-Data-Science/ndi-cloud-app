# Tutorial ground-truth — 2026-05-14

Source of truth for the deployment parity smoke. Numbers below come
straight from the `.mlx` tutorial's saved cell outputs in
`matlab/output.xml` — i.e. what the published tutorial **actually
prints** when run on each dataset on real NDI infrastructure. Any
deviation in the GUI / chatbot is a parity bug we must fix.

Tutorials live at `https://ndi-cloud-tutorials.s3.us-east-2.amazonaws.com/tutorial_<id>.mlx`.

---

## 1. Bhar — `69bc5ca11d547b1f6d083761`

Paper: <https://doi.org/10.63884/ndic.2026.0oxgzbjb>

### Document classes (`ndi.fun.doc.getDocTypes`)
11 classes:

| Class | Count |
|---|---|
| generic_file | 20 |
| imageStack | 564 |
| ontologyLabel | 584 |
| ontologyTableRow | 5297 |
| openminds_subject | 28374 |
| session | 2 |
| session_in_a_dataset | 1 |
| subject | 5314 |
| subject_group | 235 |
| treatment_drug | 24466 |
| treatment_transfer | 1675 |

### Subjects
`subjectTable`: **5314 rows × 28 cols**. All `Caenorhabditis elegans` (NCBITaxon:6239), strain `N2` (WBStrain:00000001), hermaphrodite. SubjectLocalIdentifier shaped `Fig<X>_<Condition>_<NN>@babu-lab.iisc.ac.in`.

### Figure × condition matrix
`figureTable`: **50 figure panels** (Fig 1B → 6 + supplementary). Conditions per figure are subsets of: `Naive, Trained, OnlyIAA, OnlyHeat, NaiveToTrained, TrainedToNaive, OnlyHeptanone, OnlyBenzaldehyde`.

### Treatment table (selected condition)
`treatmentTable`: **11 rows × 10 cols**. Mix of heat (`OM:Heat`, 37°C, 2-min pulses) and isoamylol (`CHEBI:15837`, 10% v/v in ambient air) treatments + Eschericia coli OP50 substrate.

### Auxiliary files
- imageStacks (selected): 3 (all "C. elegans chemotaxis assay: video recording", mp4, YXT format)
- generic_files (selected): 2 (plasmid DNA + LC-MS)
- featureTable (selected): 10 rows × 9 cols

---

## 2. Haley — `682e7772cdf3f24938176fac`

Paper: <https://doi.org/10.7554/eLife.103191>

### Document classes
15 classes (count printed in tutorial — not fully enumerated here yet; we'll capture during the live smoke).

### Subjects (C. elegans session)
`subjectTable`: **1656 rows × 15 cols**.

### Strain filter (`StrainName contains PR811`)
`filteredSubjects`: **76 rows × 15 cols**.

### Bacterial plates
- `behaviorPlateTable`: **6206 rows × 30 cols**
- `cultivationPlateTable`: **100 rows × 23 cols**
- `subjectPlateTable`: **3312 rows × 2 cols** (subject ↔ plate map)

### Per-subject drilldown (selected: row index 360)
- currentSubject: 1 × 15
- currentPlates: 2 × 30 (cultivation + behavior)
- positionMetadata: 4 × 5
- imageStackParameters (behavior): 4 × 14
- distanceMetadata: 3 × 5
- distanceMap (A/B): 1×16 + 19×31
- patch encounters for this subject: **21 rows × 42 cols**

### E. coli session
- strainTable (openminds Strain): **1 row × 8 cols**
- bacteriaTable (joined 4 tables): **7204 rows × 34 cols**
- imageStackParameters: 3 × 14

---

## 3. Francesconi — `67f723d574f5f79c6062389d`

Paper: <https://doi.org/10.1016/j.celrep.2025.115768>
(Dr. Joanna Dabrowska's lab — same group as the in-flight Chudoba et al CRF dataset.)

### Subjects
`subjectSummary`: **215 rows × 14 cols**.

### Strain filter (`StrainName contains AVP-Cre`)
`filteredSubjects`: **49 rows × 14 cols**.

### Probes + epochs
- `probeSummary`: **606 rows × 9 cols**
  - 3 probe types: stimulator, patch-Vm, patch-I
- `epochSummary`: **4887 rows × 12 cols**
- `combinedSummary` (subject+probe+epoch join): **1604 rows × 32 cols**

### Epoch filter (`global_t0 contains Jun-2023`)
`filteredEpochs`: **99 rows × 32 cols**.

### Per-subject epoch drilldown (selected: row index 74 → 1 subject)
`epochConditions`: **6 rows × 32 cols** (the chosen subject has 6 epochs total).

### Elevated Plus Maze (EPM) — the canonical parity probe
`tableEPM`: **45 rows × 51 cols**

The columns we'll drive Behavioral Compare with:
- groupBy: `Treatment_CNOOrSalineAdministration`
- variableNameContains: `ElevatedPlusMaze` → primary measure `ElevatedPlusMaze_OpenArmNorthEntries`

**Expected Saline vs CNO** (matches the bot's earlier answer):
| Group | N | Mean | Median | Std | Min | Max |
|---|---|---|---|---|---|---|
| Saline | 22 | 5.86 | 5.0 | 3.21 | 2 | 15 |
| CNO | 23 | 5.09 | 5.0 | 3.06 | 0 | 12 |

(Total N = 45 ✓ matches `tableEPM` row count.)

### Fear-Potentiated Startle (FPS)
`tableFPS`: **6160 rows × 13 cols**.

After reanalysis (`groupsummary` by Phase × Subject × TrialType):
`tableCueTest`: **84 rows × 7 cols**.

---

## How the smoke will work

For each tutorial, I'll drive the workspace at `/my/workspace/<id>` and verify:

1. **Dataset Structure panel** — counts match the doc-class counts above
2. **Treatment Timeline panel** (Bhar: 11 treatment rows; Haley: no treatments; Francesconi: epochs span Jun-2023+)
3. **Signal Viewer panel** — patch-Vm trace for one Francesconi epoch matches the tutorial's "current-step protocol" shape; Haley position(t) for one subject matches the trajectory shape
4. **Behavioral Compare panel** — Francesconi EPM `Saline` n=22 / `CNO` n=23 with the means/stds above
5. **PSTH panel** — Francesconi spike rasters around stimulus onset (need to identify a vmspikesummary + stimulus doc pair first)

Any discrepancy → file as a bug, fix, re-run.

The same prompts also go through `/ask`:
- "What document classes are in dataset X?"
- "How many subjects in X?"
- "Filter subjects in X by StrainName=Y"
- "Plot the patch-Vm trace for subject Z epoch N in X"
- "Compare EPM open-arm north entries by treatment in X"

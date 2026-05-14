# Tutorial parity matrix — `feat/experimental-ask-chat` smoke

Source of truth: the three `.mlx` tutorials shipped to `ndi-cloud-tutorials.s3.us-east-2.amazonaws.com`. Parsed from `matlab/document.xml` inside each container (see `/tmp/tutorials/parsed.txt`).

Goal: for every operation a tutorial performs, run the equivalent on the live preview through (a) the **workspace GUI** and (b) the **`/ask` chatbot**, and confirm parity.

Convention used below:
- **Panel** = the `/my/workspace/[id]` panel that maps to the tutorial step.
- **Chat probe** = a natural-language prompt that should drive the matching tool path in `/ask`.
- **Expected** = what the tutorial produces (paraphrased — exact numbers verify on first GUI run).
- **Status columns** filled during the smoke run.

---

## 1. Bhar (C. elegans EV memory transfer)

- Dataset id: `69bc5ca11d547b1f6d083761`
- Paper: <https://www.biorxiv.org/content/10.1101/2025.02.26.640282v3>
- DOI: <https://doi.org/10.63884/ndic.2026.0oxgzbjb>
- Tutorial cells: 12

| # | Tutorial step | Panel | Chat probe | Expected | GUI | Chat |
|---|---|---|---|---|---|---|
| 1 | Get document class types + counts (`getDocTypes`) | Dataset Structure | "What document classes are in the Bhar dataset?" | Class-counts table with counts > 0 for subject / ontologyTableRow / treatment_drug / imageStack / generic_file | – | – |
| 2 | Subject summary table + parse FigureName/ColumnName from SubjectLocalIdentifier (regex `Fig{name}_{column}_…`) | Dataset Structure → "All classes" → subject row, OR `query_documents(subject)` | "How many subjects in Bhar? Group by figure panel." | One row per subject; SubjectLocalIdentifier shaped `Fig<X>_<Y>_<Z>` | – | – |
| 3 | Figure × Conditions matrix (unique figure names + their columns) | (no direct panel — requires aggregation) | "List all figure panels in Bhar with their conditions/columns" | Distinct figure list with comma-separated column list per figure | – | – |
| 4 | Retrieve ontologyTableRow docs (analyzed data per subject) | Behavioral Compare (tabular_query) | "Show ontologyTableRow data in Bhar" | Returns rows for the chosen figure | – | – |
| 5 | "Recapitulate a figure": pick figure → join ontologyTableRow rows with subject metadata, plot the resulting numeric column grouped by ColumnName | Behavioral Compare w/ `variableNameContains=<figure>` + `groupBy=ColumnName` | "Plot results for figure panel `<X>` in Bhar grouped by condition" | ViolinChart with one violin per condition | – | – |
| 6 | Treatment timeline (Gantt) — `treatment_drug` docs per subject | Treatment Timeline | "Show the treatment / training timeline for Bhar" | GanttChart with treatment bars per subject | – | – |
| 7 | imageStack (microscopy / behavior video) listing + display | (NO panel yet — gap?) | "Show me an imageStack from Bhar" or fetch_image tool | First-frame thumbnail of a fluorescence or behavior image | – | – |
| 8 | generic_file listing (plasmid maps `.dna`, LC-MS `.xlsx`) | (NO panel) | "What auxiliary files are attached to Bhar?" | List of files with kind / filename | – | – |

---

## 2. Haley (C. elegans foraging)

- Dataset id: `682e7772cdf3f24938176fac`
- Paper: <https://doi.org/10.7554/eLife.103191>
- DOI: <https://doi.org/10.63884/ndic.2025.pb77mj2s>
- Tutorial cells: 25 (two sessions: C. elegans + E. coli)

| # | Tutorial step | Panel | Chat probe | Expected | GUI | Chat |
|---|---|---|---|---|---|---|
| 1 | List doc class types | Dataset Structure | "What document classes are in Haley?" | Has position / distance elements + ontologyTableRow / imageStack / openminds_subject / openminds | – | – |
| 2 | Ontology term lookup for one variable | (chat tool: `lookup_ontology`) | "What does the variable `BacterialOD600TargetAtSeeding` mean in Haley?" | Ontology id + definition + short name | – | – |
| 3 | Subject summary table (Celegans session) | Dataset Structure | "How many C. elegans subjects in Haley?" | ~hundreds of subjects with PR811 / other strains | – | – |
| 4 | Filter subjects by strain (`PR811` substring) | (chat — query_documents w/ filter) | "Find subjects in Haley with strain PR811" | Filtered subject list | – | – |
| 5 | Bacterial plate summary (joined `behaviorPlate + patch` tables) | Behavioral Compare (tabular_query on bacteria/plate vars) | "Show bacterial plate data for Haley" | Tabular rows w/ patch OD / size / density | – | – |
| 6 | **Plot position(t) for one subject** | **Signal Viewer** (element kind = position) | "Plot the position timeseries for one C. elegans subject in Haley" | x/y coordinate timeseries (2 channels) over the trial duration | – | – |
| 7 | **Plot distance-to-patch-edge(t) for one subject** | **Signal Viewer** (element kind = distance) | "Plot distance-to-patch-edge for one C. elegans subject in Haley" | 1-channel timeseries | – | – |
| 8 | imageStack image + subject-position overlay | (no panel — gap; chat fetch_image) | "Show me a behavioral assay image for subject X in Haley" | Image + dot/line overlay (overlay is tutorial-side only) | – | – |
| 9 | Play subject video | (no panel — VideoPlayer exists in components/ndi/media but unwired) | "Is there a behavior video for subject X?" | Video doc id + filename | – | – |
| 10 | Patch encounters analysis (filter ontologyTableRow rows by subject) | Behavioral Compare (filter by SubjectDocumentIdentifier) | "Show patch encounters for subject X in Haley" | Rows of encounter events with patch / decision columns | – | – |
| 11 | E. coli strain table (openminds Strain) | Dataset Structure (openminds_subject row) or `query_documents(openminds)` | "List E. coli strains in Haley" | Strain rows | – | – |
| 12 | E. coli bacterial / image / patch table join | Behavioral Compare | "Show bacterial patch density data in Haley E. coli session" | Tabular rows | – | – |
| 13 | Microscopy image display | (no panel — chat fetch_image) | "Show me a microscopy image from Haley E. coli session" | Image preview | – | – |

---

## 3. Francesconi (vasopressin/oxytocin BNST)

- Dataset id: `67f723d574f5f79c6062389d`
- Paper: <https://doi.org/10.1016/j.celrep.2025.115768>
- DOI: <https://doi.org/10.63884/ndic.2025.jyxfer8m>
- Tutorial cells: 15

| # | Tutorial step | Panel | Chat probe | Expected | GUI | Chat |
|---|---|---|---|---|---|---|
| 1 | Subject summary | Dataset Structure | "How many subjects in the Francesconi BNST dataset?" | Distinct subject count w/ strain / sex pills | – | – |
| 2 | Filter by `StrainName contains AVP-Cre` (or `SD`) | (chat) | "Find AVP-Cre subjects in Francesconi" | Filtered subject list | – | – |
| 3 | Probe summary (stimulator / patch-Vm / patch-I) + epoch summary | Dataset Structure (element row), Electrode Position | "What probes are in Francesconi?" | Three probe types, hundreds of epochs | – | – |
| 4 | Combined subject × probe × epoch metadata table | (chat) | "Show me a joined subject+probe+epoch table for Francesconi" | One row per epoch | – | – |
| 5 | Filter epochs by `ApproachName contains optogenetic` / `MixtureName contains FE201874` / `CellTypeName == "Type I BNST neuron"` / `global_t0 contains Jun-2023` | (chat) | "List Francesconi epochs that used optogenetic tetanus" | Filtered epoch list | – | – |
| 6 | Select one subject → view its epoch conditions | (chat) | "Show all epochs and their stimulus conditions for subject `<id>` in Francesconi" | Per-epoch condition list | – | – |
| 7 | **Plot patch-Vm + patch-I traces for one epoch** (current-step protocol → time × steps matrix) | **Signal Viewer** (with downsample) | "Plot the patch-Vm trace for subject `<id>` epoch 4 in Francesconi" | Multi-trace voltage timeseries (multiple current steps) | – | – |
| 8 | **EPM tabular: filter `ontologyTableRow.names contains "Elevated Plus Maze"` + group by `Treatment_CNOOrSalineAdministration`** | **Behavioral Compare** w/ `variableNameContains=ElevatedPlusMaze` + `groupBy=Treatment_CNOOrSalineAdministration` | "Compare elevated plus maze open-arm north entries between Saline and CNO in the Francesconi BNST dataset" | ViolinChart — Saline N vs CNO N (paper-figure numbers; need to extract from `output.xml`) | – | – |
| 9 | **FPS tabular: filter `ontologyTableRow.names contains "Fear-Potentiated Startle"` + reanalyze % cued/non-cued fear** | Behavioral Compare w/ `variableNameContains=FearPotentiated` + `groupBy=Treatment` | "Compare fear-potentiated startle by Saline vs CNO in Francesconi" | ViolinChart of acoustic startle amplitudes | – | – |

---

## Cross-cutting probes (not tied to a single tutorial)

| # | Probe | Tool path | Expected |
|---|---|---|---|
| C1 | "How many published datasets are there?" | list_published_datasets | 8 |
| C2 | "Which datasets relate to anxiety in BNST?" | semantic_search_datasets | Francesconi + Dabrowska |
| C3 | "How was the orientation tuning of cell X computed?" | walk_provenance(upstream) | Chain from `tuningcurve_calc` → `stimulus_response` → … |
| C4 | "Show me 100ms of voltage for sweep 5 SD42" (Griswold tree shrew) | fetch_signal | TimeseriesChart of voltage trace | 

(C2–C4 already work — already verified pre-Phase-3.)

---

## Auth-gate playbook (Playwright)

Sign-in is the only thing that gates the GUI smoke. To run the matrix end-to-end signed-in:

```bash
export PLAYWRIGHT_PREVIEW_URL="https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app"
export PLAYWRIGHT_TEST_EMAIL="audri@walthamdatascience.com"
export PLAYWRIGHT_TEST_PASSWORD="<your preview password>"
export VERCEL_SHARE="SuMAAzx33EA71RdkyGmJMUS3dkKT9dOP"   # bypasses preview SSO
cd apps/web && pnpm exec playwright test tests/e2e/workspace-tutorial-parity.spec.ts --headed
```

(The spec file is added next; it uses the same login pattern as `cookie-roundtrip.spec.ts`.)

---

## Known gaps (panels that don't exist yet — would need new code)

These tutorial steps have no workspace-panel home:

1. **ImageStack viewer panel** — single-image / video preview with optional overlay. Exists as `<ImageChart>` for static charts and `<ImageViewer>`/`<VideoPlayer>` in `components/ndi/media/` but unwired to a panel.
2. **Generic-file listing** — auxiliary files attached to a dataset (Bhar plasmid maps + LC-MS spreadsheets). Could be a thin "Attachments" panel.
3. **Figure × condition matrix** for Bhar — requires custom aggregation of SubjectLocalIdentifier regex parsing. Either build a "Bhar-figure-panel" (dataset-specific) or rely on chat-side aggregation only.

For the demo we can chat-only those three; if they prove valuable we add panels in a follow-up sprint.

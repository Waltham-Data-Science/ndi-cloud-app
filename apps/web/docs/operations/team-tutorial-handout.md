# NDI Cloud — 10-minute team tutorial

A scientist-friendly walkthrough of the NDI Cloud data viewer + analytics
workspace + Ask chat. Print it, share it, screen-share it.

**URL (preview, internal):** `https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app`
**URL (production):** `https://ndi-cloud.com`

---

## 0. Sign in (30 sec)

1. Open the URL above.
2. Click **Log in** in the top-right.
3. Use your team email + the password you were given. (Forgot it? Use
   **Forgot password?** on the login form.)
4. You'll land on **My Workspace** — a list of your org's datasets
   plus the full public NDI Commons catalog.

> Don't have an account yet? Use **Create Free Account** in the
> top-right. Anyone can browse the public Commons.

---

## 1. Open a dataset (1 min)

Two ways in:

**A. Pick from the catalog**
- Click **Data Commons** in the nav, or go to `/datasets`.
- Scroll the grid. Each card shows the dataset's title, contributors,
  DOI, and a quick-stats row (subjects · sessions · probes · documents).
- Click any card → opens the dataset overview page.

**B. Jump straight to a dataset workspace**
- From the overview, click the **Open in workspace** button.
- The URL becomes `/my/workspace/<id>` — bookmark this for any
  dataset you come back to often.

> Example: Bhar's C. elegans long-term memory dataset is at
> `/my/workspace/69bc5ca11d547b1f6d083761`.

---

## 2. The workspace canvas (2 min)

The workspace is one page with three regions:

```
┌──────────────────────────────────────────────────────────────┐
│ Header: dataset title · contributors · DOI · "Use this data" │
├───────────────┬──────────────────────────────────────────────┤
│               │  Snapshot tiles: Subjects · Sessions ·       │
│   Picker      │    Probes · Epochs · Documents · Species     │
│   rail (L)    ├──────────────────────────────────────────────┤
│   tabs:       │                                              │
│   Subjects    │   Analyses grid: 7 panels (Signal Viewer,    │
│   Sessions    │     PSTH, Spike Activity, Behavioral         │
│   Probes      │     Compare, Treatment Timeline, Patch-Clamp │
│   Stimuli     │     Step Family, BehavioralTrack, Electrode  │
│   Documents   │     Positions, Video Playback)               │
└───────────────┴──────────────────────────────────────────────┘
                                       + floating Ask (Cmd+K)
```

**Key behaviour:**

- **Pick a row in the rail** → that row's id is set as the "primary"
  selection. Every analysis panel that needs that dimension auto-runs.
- **Multi-select with checkboxes** → bulk actions: "Ask Claude about
  these N subjects", "Copy IDs", etc.
- **Right-click any row** → quick-jumps ("Plot signal trace for this
  session" scrolls to the Signal Viewer panel).
- **Cmd+K or the floating button** → opens the **Ask** chat with the
  current dataset already in context.

---

## 3. Try one real analysis (2 min)

We'll run **Bhar's treatment timeline** — a Gantt chart of every
treatment applied to every subject.

1. Open `/my/workspace/69bc5ca11d547b1f6d083761` (Bhar).
2. In the picker rail (left), click the **Subjects** tab.
3. Click any subject row (e.g. the first one). The selection bar at
   the top of the canvas now shows `Subject: <id>`.
4. Scroll the canvas down to the **Treatment Timeline** panel.
5. The panel auto-runs and renders a Gantt chart. Hover any bar →
   tooltip with the treatment name (e.g. `Eschericia coli OP50`),
   ontology ID, and the start/stop times in seconds.
6. Switch subjects in the rail → the Gantt re-renders for that
   subject. No reload needed.

> **What you're looking at:** per-subject treatment events derived
> from NDI's `treatment_drug` and `treatment_transfer` documents.
> The same projection drives the Subjects tab's columns
> (Eschericia coli OP50 Name, imazapyr Name, etc. — see "the data
> broadcast" below).

---

## 4. Try the Subjects table (1 min)

1. From the workspace, click the **Subjects** tile in the snapshot row
   (top), OR open `/datasets/69bc5ca11d547b1f6d083761/tables/subject`
   directly.
2. The table renders all 5,314 subjects with their core columns
   (Strain, Species, Sex, Background Strain, …).
3. Scroll horizontally → the right side carries dynamic
   **per-subject treatment columns**: "Eschericia coli OP50 Name",
   "imazapyr Name", "heat Name", etc. Each cell is populated only
   for the subjects who actually received that treatment.
4. Click the column-toggle button (top-right of the table) to hide
   columns you don't need.

> This is **F-1b**: instead of the cloud-app discovering treatments
> client-side, the FastAPI backend ships them inline keyed to each
> subject. Same data, fewer round-trips.

---

## 5. Ask the chatbot (2 min)

1. Press **Cmd+K** (Mac) or click the floating ⌘ button bottom-right.
2. The **Ask** drawer opens on the right side of the screen.
3. Pick one of the suggested prompts, or type your own:
   - "How many published datasets are in the Commons?"
   - "What strains were used in the Bhar C. elegans memory dataset?"
   - "What probe types were used in the Dabrowska BNST dataset?"
   - "What datasets relate to memory or learning?"
4. Watch the response stream in. The chat will:
   - **Search** the catalog (`semantic_search_datasets`)
   - **Pull documents** from the dataset
     (`query_documents`, `walk_provenance`)
   - **Cite** every claim with a clickable footnote linking to the
     source document.
5. Follow up: "Show me the treatment timeline for subject S1." or
   "How was the orientation tuning of cell X computed?" — the chat
   walks the depends_on graph upstream/downstream to answer
   provenance questions.

> **The Ask drawer carries the current workspace context** — you
> don't have to repeat "in the Bhar dataset"; the chat already
> knows what dataset you're looking at.

---

## 6. Where to go next

- **Document Explorer** — every dataset has a raw doc browser at
  `/datasets/<id>/documents`. Click any doc to see its
  `depends_on` graph (what it was derived from) and its
  `AppearsElsewhere` references (what other docs cite it).
- **My account** (top-right) — see who's in your org, what datasets
  you can publish, and your usage history.
- **NDI MATLAB / Python SDK** — the same dataset IDs you see here
  work with `ndi.cloud.api.documents.read(...)` in MATLAB and
  `ndi.cloud.api.documents.read(...)` in Python. The cloud is the
  authoritative source; the SDK is the analysis surface.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Log in to continue" loop | Cookie may have expired; re-login. If it keeps happening, send the URL + screenshot to the engineering team. |
| Panels show "No data" | Pick a subject/session in the rail first. Most panels need a selection to run. |
| Tables show fewer columns than expected | Click the column-toggle button (top-right of any table) — extra columns are toggleable. |
| Ask drawer says "feature not enabled for your org" | Send the engineering team your email + org name; the chat is per-org allowlisted. |
| Forgot password | Use **Forgot password?** on the login form. |

---

## Glossary

- **NDI Cloud** — the platform (this site).
- **NDI Commons** — the public catalog of published datasets.
- **NDI MATLAB / Python** — the analysis SDKs that read from cloud.
- **Workspace** — your org's private datasets + the public Commons.
- **Subject / Session / Probe / Element / Epoch** — the standard NDI
  document classes. Each is a tab in the picker rail.
- **`depends_on`** — every NDI document carries provenance edges
  pointing to the documents it was derived from. The Document
  Explorer renders these as a graph.
- **Ontology** — controlled vocabularies (UBERON, NCBITaxon, CL,
  WBStrain) linked to every relevant field. Clickable in tables.

---

Questions? Reach out via the **Get in touch** link in the footer or
post in the team Slack.

# Plan — Scientific-Depth Ask Chat (Days 1-4)

**Date:** 2026-05-13
**Branch:** `feat/experimental-ask-chat` (ndi-cloud-app) + new `feat/signal-endpoint` (ndi-data-browser-v2)
**Status:** Draft pending audri's approval

## Goal

Transform the experimental Ask chat from a metadata-only search into a **scientifically navigable interface** over NDI-curated data. Every claim cites a source document; the bot can drill into individual NDI primitives (probes, epochs, stimuli, signals); the demo proves that **NDI's existing curation is the moat — not the chatbot itself**.

## Pitch (for Shrek)

> "NDI's curation already made this data machine-queryable. The chatbot is the proof. Ask it any scientific question — it answers with data pulled from the documents, every claim is one click from its source, and you can plot the actual signal from a sentence."

## Architecture — hybrid by design

```
┌─────────────────────────────────────────────────────────────────┐
│  USER QUESTION                                                    │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLAUDE (Sonnet 4.5) — tool-selecting LLM                        │
│  Picks ONE of 10 tools per step (capped at 5 steps)             │
└─────────────────────────────────────────────────────────────────┘
            │
   ┌────────┼────────┬─────────────┬───────────────┐
   ▼        ▼        ▼             ▼               ▼
 RAG     CATALOG  DOCUMENT     PROVENANCE       SIGNAL
LAYER    LAYER    LAYER         LAYER           LAYER
 │        │        │             │               │
 │ pgvect │ FastAPI│ FastAPI     │ FastAPI       │ FastAPI (NEW)
 │ rerank │ exists │ exists      │ exists        │ wraps NDI binary
 │        │        │             │               │ readers
 ▼        ▼        ▼             ▼               ▼
semantic  list,    query_docs   walk_prov       fetch_signal
_search   get,     {datasetId,  {datasetId,     {datasetId,
          summary, className,   docId, dir,     elementId,
          counts,  filters}     maxDepth}       epochId, t0, t1,
          facets                                 downsample}

      EVERY tool returns:
      {
        ...result data...,
        references: [{
          doc_id: string,
          url: "/datasets/X/documents/Y",
          class: string,
          title: string,
          snippet: string
        }]
      }
```

**No NDI changes.** Only one new FastAPI endpoint that wraps NDI's existing `database_openbinarydoc` primitive. Everything else uses endpoints that already exist on the Railway backend.

## Day 1 — Citation foundation (ndi-cloud-app only)

Make every existing tool cite its sources, teach the LLM to render footnotes, render those footnotes as clickable chips.

**Files to create:**
- `apps/web/lib/ai/references.ts` — Reference type + `makeReference()` helper + URL builders
- `apps/web/components/ai/CitationChip.tsx` — clickable [^N] chip with hover preview
- `apps/web/components/ai/SourcesPanel.tsx` — bottom-of-message sources list
- `apps/web/tests/unit/ai/references.test.ts` — type guard + URL pattern tests

**Files to modify:**
- `apps/web/lib/ai/tools.ts` — every existing tool's return type gains `references: Reference[]`:
  - `list_published_datasets` → cite each dataset's `/datasets/[id]` page
  - `get_dataset` → cite the dataset record itself
  - `get_dataset_summary` → cite the summary document
  - `get_dataset_class_counts` → cite the dataset (or the per-class-count document if exists)
  - `get_facets` → cite the facets endpoint
  - `semantic_search_datasets` → each chunk already has `doc_id` from pgvector; map to URL
- `apps/web/lib/ai/system-prompt.ts` — add citation rules (every fact gets [^N], every answer ends with ### Sources)
- `apps/web/components/ai/ChatMessage.tsx` — wire `react-markdown` + `remark-gfm` for footnote rendering; mount `CitationChip` on `[^N]` patterns
- `apps/web/package.json` — `react-markdown` and `remark-gfm` (likely already present; verify)

**Tests:**
- Each existing tool: returns at least one reference when results non-empty
- CitationChip renders link to correct URL
- SourcesPanel renders one entry per unique doc_id
- ChatMessage markdown renders [^N] as CitationChip (not plain text)

**Deploy + verify:**
- Push commit → preview redeploys
- Smoke test: ask "how many datasets?" → expect "8 datasets [^1]" + Sources section with link

## Day 2 — Document-level + provenance tools (ndi-cloud-app only)

**Files to create:**
- `apps/web/lib/ai/tools/query-documents.ts` — `query_documents` handler
- `apps/web/lib/ai/tools/walk-provenance.ts` — `walk_provenance` handler
- `apps/web/tests/unit/ai/tools/query-documents.test.ts`
- `apps/web/tests/unit/ai/tools/walk-provenance.test.ts`

**Files to modify:**
- `apps/web/lib/ai/tools.ts` — register both new tools in the `tools` object
- `apps/web/lib/ai/system-prompt.ts` — add usage hints:
  - "For 'what X were used in dataset Y' questions, use `query_documents` with the right className"
  - "When the user asks how a derived value was computed, use `walk_provenance` upstream"
  - "Class names include: probe, element, element_epoch, stimulus_presentation, stimulus_response, vmspikesummary, tuningcurve_calc, subject, openminds_subject, treatment, epochid"

**Tool signatures:**

```typescript
query_documents({
  datasetId: string,
  className: string,                  // "probe" | "stimulus_presentation" | ...
  filters?: Record<string, string>,   // e.g. { probe_type: "patch-Vm" }
  limit?: number                       // default 20, max 100
}): Promise<{
  rows: Array<Record<string, unknown> & {
    _doc_id: string,
    _reference: Reference,
  }>,
  totalAvailable: number,
  references: Reference[],
}>

walk_provenance({
  datasetId: string,
  docId: string,
  direction: "upstream" | "downstream",
  maxDepth?: number                    // default 3, max 6
}): Promise<{
  nodes: Array<{
    doc_id: string,
    class: string,
    name: string,
    summary: Record<string, unknown>,
    reference: Reference,
  }>,
  edges: Array<{ from: string, to: string, depends_on_name: string }>,
  truncated: boolean,
  references: Reference[],
}>
```

**Endpoints called (all existing on FastAPI):**
- `GET /api/datasets/:id/tables/:className?filter=…&limit=…` (existing)
- `GET /api/datasets/:id/documents/:docId/dependencies?direction=…&depth=…` (existing)

**Tests:**
- query_documents: mock FastAPI, verify URL construction + reference mapping
- walk_provenance: mock dependency response, verify graph shape + reference per node
- Both: empty-result graceful handling
- Both: error pathways (404, 500, timeout) return `{error}` not throw

**Deploy + verify:**
- Push commit → preview redeploys
- Manual smoke (you and me):
  - "What probe types were used in the Dabrowska dataset?" → calls query_documents(probe) → cites each probe doc
  - "How was the orientation tuning of cell X computed?" → calls walk_provenance → returns graph + cites each upstream node

## Day 3 — FastAPI signal endpoint (ndi-data-browser-v2 new branch)

**New branch:** `feat/signal-endpoint` off `main` of ndi-data-browser-v2

**Files to create:**
- `backend/routers/signal.py` — new FastAPI router
- `backend/services/signal_service.py` — codec dispatch + LTTB downsample
- `backend/tests/test_signal_router.py` — unit tests with synthetic binary fixtures

**Files to modify:**
- `backend/app.py` — register the new router on `/api/datasets/{id}/elements/{elemId}/signal`

**Endpoint:**
```
GET /api/datasets/{datasetId}/elements/{elementId}/signal
  ?epoch={epochId}        # required
  &t0={float seconds}     # optional, default = epoch start
  &t1={float seconds}     # optional, default = min(t0 + 60s, epoch end)
  &downsample={int}       # max points returned, default 2000, max 5000

Response:
{
  element_id: string,
  element_name: string,
  epoch_id: string,
  t0_seconds: float,
  t1_seconds: float,
  sample_rate_hz: float,
  units: string,           // "V", "A", "px", etc.
  channels: [
    { name: string, values: float[] }
  ],
  time_seconds: float[],   // length matches values
  downsampled: bool,
  original_sample_count: int,
  source: {
    doc_id: string,
    doc_class: string,     // "element_epoch" or similar
    binary_filename: string
  }
}
```

**Implementation:**
- Open `element` doc → find its `element_epoch` matching `epochId` → find the binary doc it depends on
- Codec dispatch by file extension or NDI document class:
  - `.nbf` → NumPy binary float (Dabrowska electrophys)
  - `.vhsb` → vhlab binary (Haley position)
  - other → return `{error}` with clear message
- Read float array, slice to [t0, t1], LTTB downsample to `downsample` points
- Build response with units + source provenance

**Cost guardrails:**
- Max 60s of signal at native rate per request (prevent abuse)
- Max 5000 returned points per channel (caps response size at ~80 KB)
- Per-IP rate limit: 30 signal fetches / 10 min (looser than chat rate limit because chat triggers these)
- 30s response timeout

**Tests:**
- Synthetic NBF file → endpoint returns correct values + correct downsampling
- Synthetic VHSB file → same
- Unknown codec → `{error: "unsupported_signal_format"}`
- t1 > epoch_end → clamped to epoch_end
- Bad epoch ID → 404

**Deploy + verify:**
- Railway deploys feature branch to a separate test URL (or stay merged-only and rely on Railway preview if configured)
- Curl test from local: `curl …/elements/abc/signal?epoch=xyz` returns plausible waveform
- Branch stays unmerged until Day 4 ships in lockstep

## Day 4 — fetch_signal tool + chart rendering (ndi-cloud-app only)

**Files to create:**
- `apps/web/lib/ai/tools/fetch-signal.ts` — `fetch_signal` handler
- `apps/web/components/ai/SignalChart.tsx` — uPlot-based timeseries chart
- `apps/web/tests/unit/ai/tools/fetch-signal.test.ts`
- `apps/web/tests/unit/components/ai/SignalChart.test.tsx`

**Files to modify:**
- `apps/web/lib/ai/tools.ts` — register `fetch_signal`
- `apps/web/lib/ai/system-prompt.ts` — usage hint: "For 'show me / plot / trace / visualize' questions about specific signals, use `fetch_signal`. The chat UI renders a chart from the response."
- `apps/web/components/ai/ChatMessage.tsx` — detect `signal_chart` tool-output type in message parts and mount `SignalChart`

**Tool signature:**
```typescript
fetch_signal({
  datasetId: string,
  elementId: string,
  epochId: string,
  t0?: number,
  t1?: number,
  downsample?: number
}): Promise<{
  chart_data: {
    element_name: string,
    units: string,
    sample_rate_hz: number,
    channels: Array<{ name: string, values: number[] }>,
    time_seconds: number[],
    downsampled: boolean,
    original_sample_count: number,
  },
  references: Reference[],   // cites the binary doc + element + epoch
}>
```

**Chart component:**
- Uses `uplot` (already a dep at v1.6.31)
- Multi-channel support (Vm + I overlay for electrophys; X/Y stacked for position)
- Y-axis units from tool result
- Title from element_name + epoch
- Footer: "Source: [doc_title](url)" + "Downsampled from N samples to M points" when applicable

**Tests:**
- fetch_signal: mock FastAPI, verify URL params + reference mapping
- SignalChart: renders one trace per channel, axis labels correct, units displayed
- E2E: ask "plot the voltage trace during sweep 5 of subject SD42" → chart appears in chat thread

**Deploy + verify:**
- Push commits to BOTH repos
- ndi-data-browser-v2 merges to main → Railway production picks it up (low-risk: new endpoint, no schema changes)
  - OR: ndi-data-browser-v2 deploys to a preview Railway service first, then merged after demo
- ndi-cloud-app feature branch's Vercel preview gets the chart-rendering update
- Smoke: "plot the voltage trace during sweep 5 of subject SD42" → real waveform appears inline

## Cross-cutting concerns

### Citation rendering — concrete shape

System prompt teaches:
```
For every factual claim about a dataset, append a footnote marker [^N]
where N references a source from your tool results.

At the end of every answer, write:

### Sources
[^1]: [Title](url) — class
[^2]: [Title](url) — class

NEVER cite a source you didn't retrieve. NEVER fabricate a doc_id.
```

Chat UI:
- `react-markdown` + `remark-gfm` handle the footnote syntax natively
- `CitationChip` replaces the default footnote link with our chip (with hover preview from `snippet` and class badge)
- Click → opens `/datasets/[id]/documents/[docId]` in new tab
- Bottom `SourcesPanel` lists deduplicated references with copy-to-clipboard buttons

### Sidecar metadata curation (continuous)

`apps/web/lib/ai/dataset-metadata.json` stays the lever for tuning RAG quality. After demo, add entries for the 3 tutorial-having datasets (Bhar, Haley, Dabrowska) with:
- displayName (alternate names: "Dabrowska BNST" instead of full title)
- keywords (synonyms: "vasopressin" → "AVP", "BNST" → "bed nucleus of the stria terminalis")
- highlights (one-line pitch per dataset)
- notableMethods (techniques: "whole-cell patch-clamp", "optogenetic stimulation", "behavioral video tracking")
- piContext (PI background)

These get baked into the chunk content at ingest time, improving semantic_search hits.

### Branch and PR strategy

| Repo | Branch | PR | State |
|---|---|---|---|
| ndi-cloud-app | `feat/experimental-ask-chat` | #160 | DRAFT — already protected with `[DO NOT MERGE — experimental]` title prefix |
| ndi-data-browser-v2 | `feat/signal-endpoint` (new) | new draft PR | DRAFT — same protection pattern |

Both PRs remain drafts until you explicitly green-light a merge. Production code on `main` of both repos is untouched throughout this plan.

### Tests — coverage targets

| Layer | New tests added |
|---|---|
| Unit (vitest) — ndi-cloud-app | ~20-30 new tests across 4 new tool modules + 2 new components + references helper |
| Unit (pytest) — ndi-data-browser-v2 | ~8-10 new tests for signal_router + signal_service |
| E2E (playwright) | 4 new scenarios: catalog Q with citation, document-level Q with citation, provenance walk, signal plot |

### Verification checklist (post-Day-4 demo readiness)

- [ ] Every Day 1-4 commit passes CI green on both repos
- [ ] Local 1000+ unit test suite still passing
- [ ] Vercel preview boots cleanly
- [ ] Manual demo run (you + me) of 6 questions covering each tool tier:
  1. "How many datasets?" → catalog (citation only)
  2. "What datasets relate to memory?" → RAG (citations)
  3. "What probe types in the Dabrowska dataset?" → query_documents (per-probe citations)
  4. "How was this tuning curve computed?" → walk_provenance (graph citations)
  5. "Show me the voltage trace during sweep 5 for SD42" → fetch_signal (chart + source citation)
  6. "What stimuli were presented during epoch 7?" → query_documents + citations to each stimulus doc

## Out of scope (parked, not building)

- **Cross-dataset aggregate** (`cross_dataset_aggregate_by_property`) — genuinely a week+ of FastAPI Mongo aggregation work. The killer feature, but separate spec.
- **`lookup_ontology` tool** — useful but not blocker; can add Day 5 if demo runs feel like they need it.
- **Conversation persistence** — refresh wipes; matches MVP design.
- **Auth-scoped queries** (private datasets, user's own) — public catalog only.
- **Multi-modal** (image upload, PDF parse) — not in this scope.
- **Production launch** — branches stay drafts until your explicit green-light.

## Rollback plan

At any point before merge:
- Close PRs in both repos → zero production impact
- Vercel preview env vars can be stripped (the 4 we set are scoped to Preview + Production but only USED by feature-branch code; once branches go away, vars are inert)
- Railway Postgres + signal endpoint deploy can be deleted if we want a clean teardown

After merge (whenever that happens):
- Standard `git revert` of each PR's merge commit
- Re-strip env vars if downstream

## Estimated timeline + risk

| Day | Work | Repo | Risk |
|---|---|---|---|
| 1 | Citation foundation | ndi-cloud-app | Low — pure additive, easy rollback |
| 2 | query_documents + walk_provenance | ndi-cloud-app | Low — new tools, no existing-tool changes |
| 3 | FastAPI signal endpoint | ndi-data-browser-v2 | Medium — touches a more sensitive surface; mitigated by branch isolation + comprehensive tests |
| 4 | fetch_signal tool + chart UI | ndi-cloud-app | Low — new component, isolated route |

**Total wall-clock:** 4 working days of focused execution + ~1 day buffer for the inevitable "this binary format has a quirk" moment on Day 3.

## What I need from you

This plan, approved. Then I execute Days 1-4 in sequence, pushing commits with intermediate smoke tests, then ping you for the final demo run.

You retain veto at every step:
- After Day 1: "actually citations are enough — stop here." Fine.
- After Day 2: "actually documents are enough — skip signal plot." Fine.
- After Day 3: "the FastAPI route looks wrong." We fix it before Day 4.
- After Day 4: "let's iterate on demo prompts before showing Shrek." Fine.

/**
 * Tool handlers for the experimental /ask chat.
 *
 * Every handler:
 *   - Validates input via zod
 *   - Constructs the FastAPI URL from the shared `baseUrl()`
 *   - Times out after the shared TOOL_TIMEOUT_MS (8s)
 *   - Returns the parsed JSON body OR `{ error: string }` on failure
 *
 * Returning `{ error }` rather than throwing keeps the AI SDK happy —
 * tool execution errors get fed back to Claude as content, and the
 * system prompt instructs the model to handle these gracefully in
 * natural language. The user sees a polite "I couldn't fetch X" rather
 * than a 500.
 *
 * # Architecture (2026-05-15)
 *
 * Per ADR-002, every tool handler lives in `apps/web/lib/ndi/tools/` and
 * accepts an optional `ToolContext` (ADR-003). This file is the
 * THIN REGISTRATION layer for the AI SDK — each tool entry is a 3-5
 * line `tool({...})` block whose `execute` calls the imported handler.
 * Chat callers pass no context (anonymous); workspace wrapper routes
 * call the same handlers with `ctx.authHeaders` forwarded from the
 * incoming request.
 *
 * The Stream 4.3 migration moved the last 5 catalog handlers
 * (`list_published_datasets`, `get_dataset`, `get_dataset_summary`,
 * `get_dataset_class_counts`, `get_facets`) from inline definitions
 * here into per-file `lib/ndi/tools/` modules. Result: zero handlers
 * remain inline; this file is now purely registration. The only
 * exception is `semantic_search_datasets`, which is chat-specific
 * (talks to pgvector + voyage directly, no FastAPI proxy) and stays
 * here for now.
 *
 * # Citation contract
 *
 * Every tool returns `references: Reference[]` alongside its data
 * payload. The LLM is instructed (via system-prompt) to render these
 * as `[^N]` footnotes inline with its answer, and the chat UI renders
 * each `[^N]` as a clickable chip that opens the underlying NDI
 * document in a new tab. The contract:
 *
 *   - Catalog tools cite the dataset record (`/datasets/[id]/overview`)
 *   - Document-level tools cite each individual document
 *     (`/datasets/[id]/documents/[docId]`)
 *   - Signal tools cite the binary doc + element + epoch
 *
 * Never invent a reference. If upstream data is missing the field
 * needed to build a reference, omit the reference for that item.
 */
import { tool } from 'ai';
import { z } from 'zod';

import { env } from '@/lib/env';

import { hybridSearch, type RetrievedChunk } from './hybrid-retrieval';
import {
  makeDatasetReference,
  makeReference,
  type Reference,
} from '@/lib/ndi/references';
import {
  aggregateDocumentsHandler,
  aggregateDocumentsInput,
} from '@/lib/ndi/tools/aggregate-documents';
import {
  fetchImageHandler,
  fetchImageInput,
} from '@/lib/ndi/tools/fetch-image';
import {
  getDatasetHandler,
  getDatasetInput,
} from '@/lib/ndi/tools/get-dataset';
import {
  getDatasetClassCountsHandler,
  getDatasetClassCountsInput,
} from '@/lib/ndi/tools/get-dataset-class-counts';
import {
  getDatasetSummaryHandler,
  getDatasetSummaryInput,
} from '@/lib/ndi/tools/get-dataset-summary';
import {
  getDocumentHandler,
  getDocumentInput,
} from '@/lib/ndi/tools/get-document';
import {
  getFacetsHandler,
  getFacetsInput,
} from '@/lib/ndi/tools/get-facets';
import {
  fetchSignalHandler,
  fetchSignalInput,
} from '@/lib/ndi/tools/fetch-signal';
import {
  fetchSpikeSummaryHandler,
  fetchSpikeSummaryInput,
} from '@/lib/ndi/tools/fetch-spike-summary';
import {
  listPublishedDatasetsHandler,
  listPublishedDatasetsInput,
} from '@/lib/ndi/tools/list-published-datasets';
import {
  lookupOntologyHandler,
  lookupOntologyInput,
} from '@/lib/ndi/tools/lookup-ontology';
import { psthHandler, psthInput } from '@/lib/ndi/tools/psth';
import {
  ndiDatasetOverviewHandler,
  ndiDatasetOverviewInput,
} from '@/lib/ndi/tools/ndi-dataset-overview';
import {
  ndiQueryHandler,
  ndiQueryInput,
} from '@/lib/ndi/tools/ndi-query';
import {
  queryDocumentsHandler,
  queryDocumentsInput,
} from '@/lib/ndi/tools/query-documents';
import {
  tabularQueryHandler,
  tabularQueryInput,
} from '@/lib/ndi/tools/tabular-query';
import {
  treatmentTimelineHandler,
  treatmentTimelineInput,
} from '@/lib/ndi/tools/treatment-timeline';
import {
  logToolInvocation,
  type ToolContext,
} from '@/lib/ndi/tools/shared';
import {
  walkProvenanceHandler,
  walkProvenanceInput,
} from '@/lib/ndi/tools/walk-provenance';
import { embedQuery, rerank } from './voyage-client';

// Re-export so per-tool files importing from `@/lib/ai/chat-tools` keep
// working without reaching directly into `@/lib/ndi/references`.
export {
  listPublishedDatasetsInput,
  getDatasetInput,
  getDatasetSummaryInput,
  getDatasetClassCountsInput,
  getFacetsInput,
  listPublishedDatasetsHandler,
  getDatasetHandler,
  getDatasetSummaryHandler,
  getDatasetClassCountsHandler,
  getFacetsHandler,
  makeReference,
};

// ─── semantic_search_datasets ───────────────────────────────────────
//
// Full RAG pipeline matching vh-lab + shrek-lab:
//
//   1. Embed the query via Voyage voyage-4-large (1024d, input_type=query)
//   2. Hybrid retrieval — top-20 vector (`<=>`) + top-20 BM25
//      (tsvector / plainto_tsquery) — in parallel
//   3. Reciprocal Rank Fusion (k=60) to merge the two lanes
//   4. Cross-encoder rerank via Voyage rerank-2.5 — feeds ~20-30
//      candidates, returns top-K with relevance scores
//
// Returns top-K (default 5, max 10) reranked chunks with their full
// content + curated metadata, plus one reference per chunk pointing
// to the dataset's overview page.
//
// This handler intentionally stays in chat-tools.ts (not lib/ndi/tools/)
// because (a) it doesn't talk to the FastAPI proxy — it queries
// pgvector + voyage directly, and (b) it's chat-specific; the
// workspace doesn't currently surface semantic search.

export const semanticSearchDatasetsInput = z.object({
  query: z.string().min(1, 'query is required'),
  limit: z.number().int().positive().max(10).optional(),
});

export interface SemanticSearchResultEntry {
  id: string;
  name: string | null;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}

const CANDIDATES_PER_LANE = 20;

type ToolError = { error: string };
type ToolResult<T> = T | ToolError;

export async function semanticSearchDatasetsHandler(
  input: z.infer<typeof semanticSearchDatasetsInput>,
  ctx?: ToolContext,
): Promise<
  ToolResult<{
    results: SemanticSearchResultEntry[];
    pipeline: PipelineInfo;
    references: Reference[];
  }>
> {
  logToolInvocation('semantic_search_datasets', {
    queryLength: typeof input?.query === 'string' ? input.query.length : 0,
    limit: input?.limit,
  });
  const parsed = semanticSearchDatasetsInput.safeParse(input);
  if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };

  if (!env.DATABASE_URL) {
    return {
      error:
        'Semantic search not available — DATABASE_URL not configured. The /ask RAG index lives in Postgres + pgvector.',
    };
  }
  if (!env.VOYAGE_API_KEY) {
    return {
      error:
        'Semantic search not available — VOYAGE_API_KEY not configured on this environment.',
    };
  }

  const limit = parsed.data.limit ?? 5;
  const pipeline: PipelineInfo = { stage: 'init' };

  // 1. Embed the query.
  let queryVec: Float32Array;
  try {
    pipeline.stage = 'embed';
    // Stream 3.2 extension (2026-05-16): forward the per-request Voyage
    // usage accumulator so the route's onFinish can populate
    // chat_usage_events.voyage_embed_tokens accurately. When ctx is
    // omitted (build-ask-index scripts, unit tests), the helper just
    // skips the increment.
    queryVec = await embedQuery(parsed.data.query, ctx?.voyageUsage);
  } catch (e) {
    return { error: `Embedding failed: ${errMsg(e)}` };
  }

  // 2 + 3. Hybrid retrieval + RRF.
  let candidates: RetrievedChunk[];
  try {
    pipeline.stage = 'hybridSearch';
    candidates = await hybridSearch(
      parsed.data.query,
      Array.from(queryVec),
      CANDIDATES_PER_LANE,
    );
  } catch (e) {
    return { error: `Retrieval failed: ${errMsg(e)}` };
  }
  pipeline.candidatesAfterRrf = candidates.length;

  if (candidates.length === 0) {
    return { results: [], pipeline, references: [] };
  }

  // 4. Rerank.
  try {
    pipeline.stage = 'rerank';
    const rerankInputs = candidates.map((c) => c.content);
    const reranked = await rerank(
      parsed.data.query,
      rerankInputs,
      limit,
      ctx?.voyageUsage,
    );
    const finalResults: SemanticSearchResultEntry[] = reranked.map((r) => {
      const chunk = candidates[r.index]!;
      return {
        id: chunk.doc_id,
        name: chunk.doc_title,
        text: chunk.content,
        score: r.relevanceScore,
        metadata: chunk.metadata,
      };
    });
    const references: Reference[] = finalResults.map((r) =>
      makeDatasetReference({
        datasetId: r.id,
        title: r.name ?? '(unnamed dataset)',
        snippet: `Semantic-search hit, score ${r.score.toFixed(2)}`,
      }),
    );
    return { results: finalResults, pipeline, references };
  } catch (e) {
    // Soft-degrade: if reranking fails, return the top-K from RRF
    // alone. The user gets an answer based on hybrid retrieval, just
    // not as well-tuned. This matches vh-lab's behavior — they catch
    // rerank failures and fall through to RRF scores.
    const fallback: SemanticSearchResultEntry[] = candidates
      .slice(0, limit)
      .map((c) => ({
        id: c.doc_id,
        name: c.doc_title,
        text: c.content,
        score: c.score,
        metadata: { ...c.metadata, rerankFailed: errMsg(e) },
      }));
    pipeline.rerankFallback = true;
    const references: Reference[] = fallback.map((r) =>
      makeDatasetReference({
        datasetId: r.id,
        title: r.name ?? '(unnamed dataset)',
        snippet: `RRF-only hit (rerank failed), score ${r.score.toFixed(4)}`,
      }),
    );
    return { results: fallback, pipeline, references };
  }
}

interface PipelineInfo {
  stage: 'init' | 'embed' | 'hybridSearch' | 'rerank';
  candidatesAfterRrf?: number;
  rerankFallback?: boolean;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── Tool definitions for the AI SDK ────────────────────────────────
//
// Every entry follows the same shape:
//
//   tool({
//     description: '...',
//     inputSchema: xInput,
//     execute: (input) => xHandler(input, ctx),
//   })
//
// The `(input) => handler(input, ctx)` wrap is REQUIRED for handlers
// that accept the optional `ToolContext` (ADR-003) because the AI SDK's
// `execute` callback type is the stricter `(input) => Promise<R>`.
// Without the wrap, TypeScript rejects the registration.
//
// The registry is exported in TWO shapes:
//
//   - `tools`         — anonymous default (ctx === undefined). Backwards
//                       compatible with the chat path that doesn't have
//                       a session cookie. Behavior unchanged.
//
//   - `makeTools(ctx)` — ctx-aware factory. Stream 3.5 followup
//                       (2026-05-16): when the inbound request carries
//                       a session cookie, /api/ask passes a built
//                       ToolContext here so EVERY tool call forwards
//                       Cookie + X-XSRF-TOKEN + X-Request-Id to FastAPI.
//                       This is what unlocks private-dataset reads from
//                       the chat once /my/ask becomes the primary
//                       entry point.

export function makeTools(ctx?: ToolContext) {
  return {
  list_published_datasets: tool({
    description:
      'List published datasets in the NDI Commons catalog. Use this to ' +
      'answer "how many datasets" (set pageSize=1, read totalNumber) or ' +
      '"what datasets cover X" (set query). Returns a `references` array — ' +
      'cite each dataset you mention via a [^N] footnote.',
    inputSchema: listPublishedDatasetsInput,
    execute: (input) => listPublishedDatasetsHandler(input, ctx),
  }),
  get_dataset: tool({
    description:
      'Fetch the full record for a single dataset by ID. Includes ' +
      'contributors, DOI, license, and other metadata. Returns a ' +
      '`references` array citing the dataset record.',
    inputSchema: getDatasetInput,
    execute: (input) => getDatasetHandler(input, ctx),
  }),
  get_dataset_summary: tool({
    description:
      'Fetch a compact summary of a dataset (counts + key metadata). ' +
      'Prefer this over get_dataset when full record is overkill. ' +
      'Returns a `references` array citing the summary.',
    inputSchema: getDatasetSummaryInput,
    execute: (input) => getDatasetSummaryHandler(input, ctx),
  }),
  get_dataset_class_counts: tool({
    description:
      'Fetch per-class document counts for a dataset (e.g., how many ' +
      'epochs, probes, subjects). Returns a `references` array citing ' +
      'the dataset.',
    inputSchema: getDatasetClassCountsInput,
    execute: (input) => getDatasetClassCountsHandler(input, ctx),
  }),
  get_facets: tool({
    description:
      'Fetch top-level facet aggregations across the catalog: species, ' +
      'brain regions, strains, etc. Use for "what species/regions are ' +
      'represented?". Returns a `references` array.',
    inputSchema: getFacetsInput,
    execute: (input) => getFacetsHandler(input, ctx),
  }),
  semantic_search_datasets: tool({
    description:
      'Semantic / topical search over the dataset catalog. Use when ' +
      'the user asks about a CONCEPT or TOPIC that may not appear as ' +
      'a literal substring in the catalog (e.g. "memory", "primate-like ' +
      'vision", "extracellular methods", "datasets like Bhar"). Each ' +
      'result includes the dataset name, full ID, and a chunk of text ' +
      'that combines the catalog metadata with curated highlights and ' +
      'methods notes. Returns top-K (default 5, max 10) ranked by ' +
      'cosine similarity. Prefer this over list_published_datasets ' +
      'whenever the query is fuzzy or synonym-heavy. Returns a ' +
      '`references` array citing each hit.',
    inputSchema: semanticSearchDatasetsInput,
    // Stream 3.2 extension (2026-05-16): forward ctx so the handler
    // can increment ctx.voyageUsage on each Voyage embed/rerank call.
    execute: (input) => semanticSearchDatasetsHandler(input, ctx),
  }),
  query_documents: tool({
    description:
      'Pull a table of NDI documents of a given class inside one dataset. ' +
      'Use this for document-level scientific questions like "what probe ' +
      'types in dataset X", "what subjects were studied", "what stimuli ' +
      'were presented", "what brain regions were targeted". Common ' +
      'className values: probe, subject, element, element_epoch, ' +
      'stimulus_presentation, stimulus_response, vmspikesummary, ' +
      'tuningcurve_calc, treatment, openminds_subject, epochid. Returns ' +
      'columns + rows in a tabular shape, a `totalRows` count of all ' +
      'rows available (not just the page slice), a `distinctSummary` ' +
      'mapping each column to `{distinct_count, top_values: [{value, ' +
      'count}, …]}` computed over ALL rows so you can answer "how many ' +
      'distinct values" without paging the whole table, and a ' +
      '`references` array — one citation per row when the row has a ' +
      'self document ID, otherwise a citation to the dataset overview. ' +
      'CLASS-NAME ALIAS: passing className="probe" will transparently ' +
      'fall back to className="element" when the dataset has 0 probe ' +
      'docs (modern datasets — Dabrowska BNST, etc. — emit element, ' +
      'not probe). Same for className="epoch" → "element_epoch". You ' +
      'do NOT need to pre-check which name the dataset uses; ask for ' +
      'the user-friendly name and the backend resolves the alias. ' +
      'When distinctSummary shows a column has distinct_count=1 across ' +
      'many rows, treat that as a SIGNAL: the conceptual question may ' +
      'need a different className (e.g. all `treatment` rows sharing ' +
      'one name often means treatment variation lives in ' +
      '`ontologyTableRow`, not `treatment`).',
    inputSchema: queryDocumentsInput,
    // Chat runs anonymous; wrap to satisfy the AI SDK's stricter
    // (input) => Promise<R> callback shape now that the handler accepts
    // an optional ToolContext. Stream 3.5 followup retrofit (2026-05-16).
    execute: (input) => queryDocumentsHandler(input, ctx),
  }),
  walk_provenance: tool({
    description:
      'Walk the NDI depends_on graph from a starting document to ' +
      'surface its derivation chain. Use this when the user asks how a ' +
      'derived value was computed, where a result came from, or what ' +
      'inputs fed into a particular analysis. Returns a graph of nodes ' +
      '(each with class, name, and document ID) and edges (each with ' +
      'a depends_on field name), plus a `references` array citing each ' +
      'node. Set maxDepth between 1 and 6 (default 3).',
    inputSchema: walkProvenanceInput,
    // Stream 3.5 followup retrofit — wrap so AI SDK v6 accepts the now-
    // ctx-accepting handler.
    execute: (input) => walkProvenanceHandler(input, ctx),
  }),
  fetch_signal: tool({
    description:
      'Fetch a downsampled timeseries from an NDI binary document so ' +
      'the chat can plot the actual signal (voltage trace, position ' +
      'track, spike rate, etc.) inline. Use this when the user asks to ' +
      "'show', 'plot', 'visualize', or 'trace' the data inside a " +
      'specific document. Inputs: datasetId + docId of a document with ' +
      'a binary file (typically element_epoch or daqreader_*_epochdata' +
      '_ingested). Optional: downsample (max points per channel, ' +
      'default 2000, max 5000), t0/t1 (time window in seconds). ' +
      'Returns metadata + a `chart_payload` object — IMPORTANT: when ' +
      'you call this tool, you MUST also echo the returned ' +
      "`chart_payload` JSON back into your answer inside a fenced code " +
      'block tagged "signal-chart":\n' +
      '\n' +
      '    ```signal-chart\n' +
      '    {"datasetId":"...","docId":"...","downsample":2000,"title":"..."}\n' +
      '    ```\n' +
      '\n' +
      'The chat UI intercepts that fence and renders the actual chart ' +
      'inline. Also include a footnote citation to the source document ' +
      'using the returned `references` array, exactly like every other ' +
      'tool call. Always describe what the chart shows in plain English ' +
      'before the fence — never just dump the chart without context.',
    inputSchema: fetchSignalInput,
    // Stream 3.5 followup retrofit — wrap so AI SDK v6 accepts the now-
    // ctx-accepting handler.
    execute: (input) => fetchSignalHandler(input, ctx),
  }),
  lookup_ontology: tool({
    description:
      'Resolve an ontology CURIE (e.g. "UBERON:0001870", "CL:0000540", ' +
      '"NCBITaxon:10116", "WBStrain:00000001", "NDIC:0000123") to its ' +
      'human-readable name + definition + synonyms.\n' +
      '\n' +
      'Use this WHENEVER you encounter a bare CURIE in tabular_query / ' +
      'query_documents / ndi_query output and the user might want to ' +
      'know what it means. Common cases:\n' +
      '  - subject.species = "NCBITaxon:10116" → "Rattus norvegicus"\n' +
      '  - subject.strain = "WBStrain:00000001" → "N2 wild-type"\n' +
      '  - probe.brainRegion = "UBERON:0001870" → "frontal cortex"\n' +
      '  - element.cellType = "CL:0000540" → "neuron"\n' +
      '\n' +
      'Backed by public providers (UBERON / CL / NCBITaxon via OLS at ' +
      'EBI) with NDI-python fallback for lab-specific prefixes ' +
      '(WBStrain, NDIC, Cre lines). Returns name, definition, synonyms, ' +
      'and the source that resolved the term. `found: false` means no ' +
      'provider had the term — surface that plainly rather than ' +
      'inventing a definition.',
    inputSchema: lookupOntologyInput,
    execute: lookupOntologyHandler,
  }),
  aggregate_documents: tool({
    description:
      'Compute summary statistics (mean, median, std, min, max, count) ' +
      'across a Query-matched set of NDI documents. Use this WHENEVER a ' +
      "user asks for an average / mean / median / range / spread across " +
      'many docs — even small numbers (10+) where you might be tempted to ' +
      'do arithmetic yourself. Doing the math server-side is deterministic; ' +
      'LLMs drift on long sums.\n' +
      '\n' +
      'INPUTS:\n' +
      '  - scope + searchstructure: same DSL as ndi_query (see that ' +
      "tool's description for operations + examples).\n" +
      '  - valueField: DOTTED PATH to the numeric field in each doc, ' +
      'e.g. "data.subject.weight_grams", ' +
      '"data.vmspikesummary.mean_firing_rate", "data.probe.impedance_ohms". ' +
      'Use ndi_query first if you need to discover the field name; ' +
      'then call this with the path.\n' +
      '  - groupBy: optional dotted path to a categorical field. ' +
      'Returns one stats block per distinct value (e.g. ' +
      'groupBy="data.subject.strain" splits by strain).\n' +
      '  - maxDocs: optional cap on docs scanned (default 5000, max 50000).\n' +
      '\n' +
      'EXAMPLES:\n' +
      '  "Average firing rate of all units in dataset X" →\n' +
      '    scope="<dsId>"\n' +
      '    searchstructure=[{operation:"isa", param1:"vmspikesummary"}]\n' +
      '    valueField="data.vmspikesummary.mean_firing_rate"\n' +
      '\n' +
      '  "Subject weight by strain across the catalog" →\n' +
      '    scope="public"\n' +
      '    searchstructure=[{operation:"isa", param1:"subject"}]\n' +
      '    valueField="data.subject.weight_grams"\n' +
      '    groupBy="data.subject.strain"\n' +
      '\n' +
      'OUTPUT: per-group {count, mean, median, std, min, max}. ' +
      '`numeric_matches` says how many docs actually had a finite ' +
      'numeric value at valueField (others were skipped). ' +
      '`total_items` is the total query matches before numeric filtering. ' +
      '`truncated` is true when more docs matched than maxDocs scanned.',
    inputSchema: aggregateDocumentsInput,
    // Stream 3.5 followup retrofit — wrap so AI SDK v6 accepts the now-
    // ctx-accepting handler.
    execute: (input) => aggregateDocumentsHandler(input, ctx),
  }),
  ndi_query: tool({
    description:
      'Run a structured NDI Query across ONE OR MANY datasets. This is ' +
      'THE tool for cross-dataset questions, and the most flexible ' +
      'within-dataset tool when query_documents is too coarse.\n' +
      '\n' +
      'INPUTS:\n' +
      '  - scope: "public" (every published dataset) OR a comma-' +
      'separated list of 24-char hex dataset IDs (e.g. "ID1,ID2,ID3"). ' +
      'Use a CSV when the user is comparing 2-5 named datasets; use ' +
      '"public" for "across all published data" questions.\n' +
      '  - searchstructure: array of NDI Query clauses (each is ' +
      '{ operation, field?, param1?, param2? }). Clauses AND-combine ' +
      'at the top level.\n' +
      '  - limit: optional, max docs shown to you (default 50, max 200). ' +
      '`total_items` carries the true match count.\n' +
      '\n' +
      'OPERATIONS (echo from MATLAB ndi.query and Python ndi.query.Query):\n' +
      '  isa                          — class lineage match (param1=class name)\n' +
      '  exact_string                 — case-sensitive field=value\n' +
      '  exact_string_anycase         — case-insensitive field=value\n' +
      '  contains_string              — case-insensitive substring\n' +
      '  regexp                       — regex match (case-insensitive)\n' +
      '  exact_number / lessthan / lessthaneq / greaterthan / greaterthaneq\n' +
      '  hasfield                     — field exists and is non-null\n' +
      '  hasmember                    — array contains value\n' +
      '  hasanysubfield_contains_string / hasanysubfield_exact_string ' +
      '— sub-field match inside an array of objects\n' +
      '  depends_on                   — { param1: edge name or "*", param2: target docId }\n' +
      '  or                           — { param1: clause[], param2: clause[] }\n' +
      '  ~isa, ~contains_string, …    — prefix ~ to negate any of the ' +
      'above. ~or is NOT allowed.\n' +
      '\n' +
      'EXAMPLES:\n' +
      '  "How many CRF+ subjects exist in the public catalog?"\n' +
      '    scope="public", searchstructure=[\n' +
      '      { operation: "isa", param1: "subject" },\n' +
      '      { operation: "contains_string", field: "subject.strain", param1: "CRF" }\n' +
      '    ]\n' +
      '\n' +
      '  "What probes are in dataset 69bc5ca1...?"\n' +
      '    scope="69bc5ca11d547b1f6d083761", ' +
      'searchstructure=[{ operation: "isa", param1: "probe" }]\n' +
      '\n' +
      '  "Find vmspikesummary docs that depend on doc X"\n' +
      '    scope="public", searchstructure=[\n' +
      '      { operation: "isa", param1: "vmspikesummary" },\n' +
      '      { operation: "depends_on", param1: "*", param2: "<docId>" }\n' +
      '    ]\n' +
      '\n' +
      'OUTPUT: `documents` is a compact projection (id, class, ' +
      'datasetId, label, data_preview). For the full body of a ' +
      'specific doc, chain into `get_document`. The response also ' +
      'returns a `references` array — cite each result you mention.',
    inputSchema: ndiQueryInput,
    // Stream 3.5 followup retrofit — wrap so AI SDK v6 accepts the now-
    // ctx-accepting handler.
    execute: (input) => ndiQueryHandler(input, ctx),
  }),
  get_document: tool({
    description:
      'Fetch the FULL body of a single NDI document by its docId. Use ' +
      'this after `ndi_query` / `query_documents` identifies a ' +
      'specific document of interest — those tools surface compact ' +
      'projections (id + class + label + truncated preview); ' +
      '`get_document` returns the full data payload, depends_on chain, ' +
      'file attachments, and all metadata. Inputs: datasetId + docId. ' +
      'Returns the unmodified document object from the backend plus a ' +
      'citation. Use sparingly — full bodies are large and only useful ' +
      'when the projection didn\'t carry the field you need.',
    inputSchema: getDocumentInput,
    // Stream 3.5 followup retrofit — wrap so AI SDK v6 accepts the now-
    // ctx-accepting handler.
    execute: (input) => getDocumentHandler(input, ctx),
  }),
  ndi_dataset_overview: tool({
    description:
      'High-level SDK-derived summary for ONE dataset: element count, ' +
      'subject count, TOTAL epoch count across all elements, and the ' +
      "first 50 element {name, type} pairs. Use this for orientation " +
      "questions ('what's in this dataset?', 'how many subjects?', " +
      "'how many recording epochs?'). The numbers come from a " +
      'NDI-python traversal that ndi_query cannot perform directly.\n' +
      '\n' +
      'First call on a cold dataset can take 10-30s while the backend ' +
      "downloads the dataset's documents; subsequent calls are " +
      'instant. The chat pre-warms the 3 demo datasets at boot so most ' +
      'calls hit a warm cache.\n' +
      '\n' +
      'If the response is an error mentioning "binding unavailable" ' +
      'or "use ndi_query instead", fall back to ndi_query for the ' +
      'underlying documents (e.g. count subjects via ' +
      'ndi_query(scope=<id>, [{operation:"isa", param1:"subject"}])). ' +
      'Do NOT retry ndi_dataset_overview after a binding-unavailable ' +
      'error — the binding may be down in this environment.',
    inputSchema: ndiDatasetOverviewInput,
    // Stream 3.5 followup retrofit — wrap so AI SDK v6 accepts the now-
    // ctx-accepting handler.
    execute: (input) => ndiDatasetOverviewHandler(input, ctx),
  }),
  treatment_timeline: tool({
    description:
      'Build a horizontal Gantt-style timeline of treatments per subject ' +
      'in a single dataset. Use this when the user asks to "show the ' +
      'treatment timeline", "when did each subject get Saline vs CNO", ' +
      '"plot the training/testing schedule", or any other question about ' +
      'WHICH treatments WHICH subjects received and (optionally) WHEN.\n' +
      '\n' +
      'INPUTS:\n' +
      '  - datasetId (required)\n' +
      '  - title (optional): chart title.\n' +
      '  - maxSubjects (optional, default 30, max 100): cap on distinct ' +
      'subjects shown. Bars beyond the cap are dropped from the chart.\n' +
      '\n' +
      'OUTPUT: chart_payload with `items: [{subject, treatment, start, ' +
      'end}]` for the gantt-chart fence, plus total_subjects, ' +
      'total_treatments, and temporal_source ("explicit" | "ordinal" | ' +
      '"mixed"). When temporal_source is "ordinal", the dataset did not ' +
      'record per-treatment start/end times — start/end are ordinal ' +
      'slots (treatment #1, #2, …) per subject. ALWAYS mention this in ' +
      'prose ("treatments are shown in administration order; the ' +
      'dataset does not record per-treatment timestamps").\n' +
      '\n' +
      'IMPORTANT: when items is non-empty, echo the returned ' +
      'chart_payload JSON into a fenced code block tagged ' +
      '"gantt-chart":\n' +
      '\n' +
      '    ```gantt-chart\n' +
      '    {"datasetId":"...","title":"...","items":[{"subject":"...","treatment":"...","start":0,"end":1}, ...]}\n' +
      '    ```\n' +
      '\n' +
      'The chat UI intercepts that fence and mounts GanttChart inline. ' +
      'Cite source subjects via the returned `references` array. If ' +
      '`empty_hint` is present, surface it plainly — do NOT emit the ' +
      'fence with an empty items array.',
    inputSchema: treatmentTimelineInput,
    // Chat runs anonymous-only; wrap to satisfy the AI SDK's stricter
    // `(input) => Promise<R>` callback shape. The workspace wrapper
    // at /api/datasets/[id]/treatment-timeline forwards auth headers
    // when present.
    execute: (input) => treatmentTimelineHandler(input, ctx),
  }),
  fetch_image: tool({
    description:
      'Fetch a 2D image array from an NDI binary document (microscopy ' +
      'frame, fluorescence image, patch-encounter map, cell image) and ' +
      "render it inline as a Plotly heatmap. Use this when the user " +
      "asks to 'show', 'plot', 'visualize', or 'display' an IMAGE — " +
      "specifically: patch-encounter maps (Haley accept-reject-foraging), " +
      'cell images / fluorescence frames (Bhar memory, Dabrowska), ' +
      'microscopy stacks, or any 2D pixel data inside a document.\n' +
      '\n' +
      'NOT for timeseries traces — that is fetch_signal. NOT for ' +
      'tabular comparisons — that is tabular_query.\n' +
      '\n' +
      'INPUTS:\n' +
      '  - datasetId + docId of a document with an image file ' +
      '(typically class "image", "imageStack", or "thumbnail").\n' +
      '  - frame (optional, default 0): index for multi-frame TIFF / ' +
      'animated GIF stacks. Out-of-range clamps to the last frame.\n' +
      '  - title (optional): chart caption.\n' +
      '\n' +
      'IMPORTANT: when the response is non-error, echo the returned ' +
      "`chart_payload` JSON back into your answer inside a fenced code " +
      'block tagged "image-chart":\n' +
      '\n' +
      '    ```image-chart\n' +
      '    {"datasetId":"...","docId":"...","frame":0,"title":"Patch encounter map S1"}\n' +
      '    ```\n' +
      '\n' +
      'The chat UI intercepts that fence and renders the heatmap ' +
      'inline. Cite the source document via the `references` array. ' +
      'Always describe what the image shows in plain English before ' +
      'the fence.\n' +
      '\n' +
      'If errorKind is `notfound` / `decode` / `unsupported`, do NOT ' +
      "emit the chart fence — tell the user plainly what failed. " +
      "'unsupported' fires for raw NDI-native image formats (.nim) " +
      "that Pillow can't decode.",
    inputSchema: fetchImageInput,
    // Stream 3.5 followup retrofit — wrap so AI SDK v6 accepts the now-
    // ctx-accepting handler.
    execute: (input) => fetchImageHandler(input, ctx),
  }),
  fetch_spike_summary: tool({
    description:
      'Pull spike-time arrays from `vmspikesummary` documents and ' +
      'render either a spike raster (one row per unit, vertical tick ' +
      'per spike) or an ISI (inter-spike interval) histogram — or BOTH.\n' +
      '\n' +
      'Use when the user asks:\n' +
      '  - "show me the spike raster for unit X"\n' +
      '  - "ISI histogram for the patch-Vm recording"\n' +
      '  - "compare firing rates between Saline and CNO units"\n' +
      '  - "visualize the spike train"\n' +
      '\n' +
      'INPUTS:\n' +
      '  - datasetId (required)\n' +
      '  - kind: "raster" | "isi_histogram" | "both" (required)\n' +
      '  - unitDocId (optional): specific vmspikesummary docId. When ' +
      'omitted, the tool queries vmspikesummary docs in the dataset.\n' +
      '  - unitNameMatch (optional): substring match against unit names ' +
      'when discovering units (broad substring like "Saline" or "BNST").\n' +
      '  - tWindow (optional): [start_s, end_s] time window for raster ' +
      '(seconds).\n' +
      '  - maxUnits (optional, default 10, max 50): cap on units shown.\n' +
      '  - title (optional): chart title.\n' +
      '\n' +
      'OUTPUT: chart_payload (kind=raster | isi_histogram) OR ' +
      'chart_payloads (kind=both — two payloads). For each, you MUST ' +
      'echo the JSON back into your answer in a fenced code block:\n' +
      '\n' +
      '    ```spike-raster\n' +
      '    {"datasetId":"...","units":[{"name":"Unit 12","spikeTimes":[...]}, ...],"tWindow":[0,2]}\n' +
      '    ```\n' +
      '\n' +
      '    ```isi-histogram\n' +
      '    {"datasetId":"...","intervals":[...],"unitName":"Unit 12","logBins":true}\n' +
      '    ```\n' +
      '\n' +
      'The chat UI intercepts both fences and mounts SpikeRaster / ' +
      'IsiHistogram inline. Cite each unit via the `references` ' +
      'array. ISI defaults to log-spaced bins (electrophysiology ' +
      'convention).',
    inputSchema: fetchSpikeSummaryInput,
    // Chat runs anonymous-only; we wrap the handler to drop the
    // (optional) auth context so the AI SDK's stricter
    // `(input) => Promise<R>` callback shape is satisfied. The
    // workspace's wrapper route at /api/datasets/[id]/spike-summary
    // is what forwards auth headers when present.
    execute: (input) => fetchSpikeSummaryHandler(input, ctx),
  }),
  psth: tool({
    description:
      'Compute a peri-stimulus time histogram (PSTH) for a single ' +
      'unit aligned to a stimulus train. Use when the user asks ' +
      "'plot the PSTH', 'spike rate around stimulus', 'firing in " +
      "response to events', or any other question that needs spike " +
      'counts binned around event onsets.\n' +
      '\n' +
      'INPUTS:\n' +
      '  - datasetId (required).\n' +
      '  - unitDocId (required): 24-char hex id of a vmspikesummary ' +
      'doc carrying the spike train. Find via ndi_query / ' +
      'query_documents on class vmspikesummary first.\n' +
      '  - stimulusDocId (required): 24-char hex id of a ' +
      'stimulus_presentation or stimulus_response doc holding event ' +
      "timestamps. The backend joins the two by walking depends_on " +
      'edges.\n' +
      '  - t0/t1 (optional): window in SECONDS relative to each ' +
      'stimulus onset. Default backend window is [-0.5, 1.5]. ' +
      'Negative t0 captures baseline.\n' +
      '  - binSizeMs (optional, default 20 ms): bin width. 10 ms ' +
      'for fast sensory responses; 50 ms when smoothing single units.\n' +
      '  - includeRaster (optional): when true, response includes ' +
      'per-trial spike times so a raster underlay can render.\n' +
      '  - title (optional): chart title surfaced in the chart fence.\n' +
      '\n' +
      'OUTPUT: chart_payload (kind=psth) with bin centers, counts, ' +
      'mean firing rate (Hz). When non-empty, you MUST echo the ' +
      'payload back as a fenced code block tagged "psth-chart":\n' +
      '\n' +
      '    ```psth-chart\n' +
      '    {"datasetId":"...","unitDocId":"...","stimulusDocId":"...","binSizeMs":20,"title":"..."}\n' +
      '    ```\n' +
      '\n' +
      'The chat UI intercepts that fence and renders the PSTH inline. ' +
      'If empty_hint is present (no_events / decode_failed / etc.), ' +
      'surface the reason plainly and DO NOT emit the fence with an ' +
      'empty histogram. Cite both the unit doc and the stimulus doc ' +
      'via the returned `references` array — every PSTH is a JOIN of ' +
      'two sources.',
    inputSchema: psthInput,
    // Chat runs anonymous-only; drop the optional ToolContext so the
    // AI SDK's stricter `(input) => Promise<R>` callback shape is
    // satisfied. The workspace wrapper route at
    // /api/datasets/[id]/psth forwards auth headers when present.
    execute: (input) => psthHandler(input, ctx),
  }),
  tabular_query: tool({
    description:
      'Aggregate a behavioral / measurement table (ontologyTableRow) ' +
      'into per-group statistics + raw values for a violin / jitter ' +
      'plot. Use this for "compare X across treatment groups", "show ' +
      'EPM open-arm entries Saline vs CNO", "plot fear-startle by ' +
      'condition", or anything else that asks for a categorical ' +
      'comparison of a numeric measurement.\n' +
      '\n' +
      'INPUTS:\n' +
      '  - datasetId\n' +
      '  - variableNameContains: substring match against the table\'s ' +
      'variable names. Use the natural-language hint from the user ' +
      '(e.g. "ElevatedPlusMaze", "FearPotentiatedStartle", "Chemotaxis") ' +
      'as a starting point. The backend SCORES candidate columns by ' +
      'numeric-row count and picks the best match — so a broad ' +
      'substring is usually right.\n' +
      '  - groupBy (optional): substring match against the table\'s ' +
      'GROUPING column key. CRITICAL: column keys are dataset-specific ' +
      '(e.g. "Treatment_CNOOrSalineAdministration", ' +
      '"StimulationGroup", "GenotypeCondition"). Use a SHORT broad ' +
      'hint like "Treatment", "Stimulation", or "Genotype" — the ' +
      'backend substring-matches case-insensitively. NEVER assume a ' +
      'specific column name like "treatment_group" exists — that is ' +
      'NOT a real NDI column convention.\n' +
      '  - groupOrder (optional): explicit left-to-right ordering of ' +
      'group labels (e.g. ["Saline", "CNO"]).\n' +
      '  - title (optional): chart title.\n' +
      '\n' +
      'RETRY LOOP — CRITICAL:\n' +
      'If the response has `groups_summary: []` and `empty_hint`, READ ' +
      'THE empty_hint AND RETRY before falling back to other tools. ' +
      '`empty_hint.available_columns` lists every column key in the ' +
      'matched table — pick one that semantically matches what the ' +
      'user wants and call tabular_query AGAIN with that as groupBy. ' +
      '`empty_hint.retry_with` is a pre-built best-guess retry — you ' +
      'can use it directly. DO NOT pivot to query_documents to ' +
      'explore — the right column name is in your hand.\n' +
      '\n' +
      'OUTPUT: per-group summary stats (mean, median, std, q1/q3, ' +
      'min/max, count) + a `chart_payload` object — IMPORTANT: when ' +
      'you call this tool with non-empty groups_summary, you MUST ' +
      "echo the returned `chart_payload` JSON back into your answer " +
      'inside a fenced code block tagged "violin-chart":\n' +
      '\n' +
      '    ```violin-chart\n' +
      '    {"datasetId":"...","variableNameContains":"...","groupBy":"...","title":"..."}\n' +
      '    ```\n' +
      '\n' +
      'The chat UI intercepts that fence and renders the actual ' +
      'violin plot inline. Also include a footnote citation to the ' +
      'source via the returned `references` array. Always describe ' +
      'in plain English what the comparison shows before the fence.',
    inputSchema: tabularQueryInput,
    // ctx is forwarded when present; for anonymous chat ctx === undefined
    // and the handler goes out anonymous (same behavior as before).
    execute: (input) => tabularQueryHandler(input, ctx),
  }),
  } as const;
}

/**
 * Anonymous default — used by the chat path that doesn't have a
 * session cookie. Equivalent to `makeTools(undefined)`.
 *
 * Authenticated callers should construct a fresh registry per-request
 * via `makeTools(toolContextFromRequest(req))` so the per-call ctx is
 * captured in each tool's execute closure.
 */
export const tools = makeTools();

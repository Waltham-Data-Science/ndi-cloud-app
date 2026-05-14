/**
 * Reference type — every tool result includes one or more of these so
 * the LLM can cite the underlying NDI document for each claim.
 *
 * The shape matches the Document Explorer's deep-link contract:
 *   /datasets/[datasetId]/documents/[docId]
 *
 * `class` is the NDI document class (probe, element_epoch,
 * stimulus_presentation, vmspikesummary, etc.). `snippet` is a short
 * human-readable hint shown in the citation chip's hover preview.
 *
 * The runtime contract is:
 *   - Every tool returns `references: Reference[]`
 *   - The LLM is instructed (via system-prompt) to emit footnote
 *     definitions matching these references inline with its answer
 *   - The chat UI renders inline `[^N]` markers as clickable chips
 *     and the trailing `### Sources` section as a deduplicated panel
 */

export interface Reference {
  /** NDI document ID. Same value used in `depends_on` chains. */
  doc_id: string;
  /** Deep-link path into the Document Explorer. Relative, no host. */
  url: string;
  /** NDI document class name (e.g. "probe", "element_epoch"). */
  class: string;
  /** Short title for display in the chip + sources panel. */
  title: string;
  /** One-line hint shown in the chip's hover preview. */
  snippet: string;
}

/**
 * Build the canonical Document Explorer URL for a dataset doc.
 *
 * Stays a thin function (rather than living in `lib/urls.ts` alongside
 * the marketing URL helpers) because it's only used by the chat tool
 * layer and the citation renderer — keeping it next to the Reference
 * type makes the cross-references obvious. If the explorer URL scheme
 * ever changes, this is the single edit.
 */
export function documentExplorerUrl(datasetId: string, docId: string): string {
  return `/datasets/${datasetId}/documents/${docId}`;
}

/**
 * Build the dataset-overview URL (used for catalog-level citations
 * where the "source document" is the dataset record itself).
 */
export function datasetOverviewUrl(datasetId: string): string {
  return `/datasets/${datasetId}/overview`;
}

/**
 * Build the ontology-tables view URL for a dataset.
 *
 * Used by tools that AGGREGATE across many ontologyTableRow documents
 * (tabular_query / violin chart). Citing one arbitrary row's docId
 * would mislead — the user would click and see a single row's JSON
 * when the chart actually summarizes dozens or hundreds. This URL
 * takes them to the table view where the COLUMN they're seeing
 * compared is visible alongside its sibling columns.
 */
export function ontologyTableUrl(datasetId: string): string {
  return `/datasets/${datasetId}/tables/ontology`;
}

/**
 * Convenience builder — fills in `url` from `datasetId` + `doc_id`
 * automatically. Use when constructing a reference inline in a tool
 * handler.
 */
export function makeReference(
  params: Omit<Reference, 'url'> & { datasetId: string },
): Reference {
  return {
    doc_id: params.doc_id,
    url: documentExplorerUrl(params.datasetId, params.doc_id),
    class: params.class,
    title: params.title,
    snippet: params.snippet,
  };
}

/**
 * Builder for dataset-level references (where the source is the
 * dataset record, not a specific document inside it).
 */
export function makeDatasetReference(params: {
  datasetId: string;
  title: string;
  snippet: string;
}): Reference {
  return {
    doc_id: params.datasetId,
    url: datasetOverviewUrl(params.datasetId),
    class: 'dataset',
    title: params.title,
    snippet: params.snippet,
  };
}

/**
 * Builder for ontology-table aggregate references. Use when a tool
 * summarizes across many ontologyTableRow documents (e.g.
 * tabular_query producing a violin chart). The chip links to the
 * full table view in the data browser so the user can verify the
 * comparison against the underlying rows.
 *
 * `rowCount` is encoded in the snippet so the hover preview is
 * honest about scale ("Aggregated from 45 rows").
 */
export function makeOntologyTableReference(params: {
  datasetId: string;
  variableName?: string;
  rowCount: number;
  groupCount: number;
  groupBy?: string;
}): Reference {
  const title = params.variableName
    ? `Ontology table: ${params.variableName}`
    : 'Ontology table';
  const groupingClause = params.groupBy
    ? `, grouped by ${params.groupBy}`
    : '';
  const snippet =
    `Aggregated from ${params.rowCount} ` +
    `row${params.rowCount === 1 ? '' : 's'} across ` +
    `${params.groupCount} group${params.groupCount === 1 ? '' : 's'}` +
    groupingClause +
    '. Click to open the full table view.';
  return {
    // `doc_id` is opaque to the renderer; we use a stable synthetic
    // id (datasetId-tables-ontology) so duplicate references on the
    // same surface deduplicate cleanly in SourcesPanel.
    doc_id: `${params.datasetId}-tables-ontology`,
    url: ontologyTableUrl(params.datasetId),
    class: 'ontologyTable',
    title,
    snippet,
  };
}

/**
 * Parse footnote definitions out of a markdown string and resolve to
 * Reference shape.
 *
 * The LLM is instructed to write footnote definitions as:
 *
 *   [^1]: [Title text](url) — class
 *
 * This helper extracts each `^N` → { url, title, class } so the chat
 * UI can render `[^N]` chips that open the correct URL on click
 * (rather than jumping to the in-page footnote anchor that
 * remark-gfm produces by default).
 *
 * Tolerant: malformed footnote definitions are skipped silently — the
 * default remark-gfm renderer still surfaces them as a Sources list,
 * just without the chip wiring.
 */
const FOOTNOTE_DEF_RE =
  /^\[\^(\d+)\]:\s*\[([^\]]+)\]\(([^)]+)\)(?:\s*—\s*(.+))?$/;

export function parseFootnotes(content: string): Map<number, Reference> {
  const map = new Map<number, Reference>();
  for (const line of content.split('\n')) {
    const match = line.trim().match(FOOTNOTE_DEF_RE);
    if (!match) continue;
    const [, nStr, title, url, classRaw] = match;
    const n = Number.parseInt(nStr!, 10);
    if (Number.isNaN(n)) continue;
    // Extract doc_id from URL — last path segment for the
    // `/datasets/X/documents/Y` shape. Falls back to the full URL
    // if the shape doesn't match, so non-NDI URLs still surface.
    const docIdMatch = url!.match(/\/documents\/([^/?#]+)/);
    const doc_id = docIdMatch ? docIdMatch[1]! : url!;
    map.set(n, {
      doc_id,
      url: url!,
      class: classRaw?.trim() ?? 'reference',
      title: title!.trim(),
      snippet: '',
    });
  }
  return map;
}

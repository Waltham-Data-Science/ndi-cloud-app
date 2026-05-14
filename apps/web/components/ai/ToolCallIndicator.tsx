'use client';

type Props = {
  toolName: string;
  /**
   * Whether this tool call is still in flight. When `true` (default),
   * the indicator pulses + italicizes — a "working on it" cue. When
   * `false`, the indicator renders as a static, subdued line — useful
   * post-stream and on hydration from persisted state so a completed
   * (or interrupted) tool call doesn't visually masquerade as
   * still-running. ChatThread is the source of truth and passes
   * `isStreaming && idx === entries.length - 1` for the trailing
   * entry, `false` for everything else. Default true preserves the
   * original behavior for callers that haven't updated.
   *
   * Wired 2026-05-14 to fix P0-C ("Stale 'in progress' indicators
   * persist across refresh"): after a refresh `isStreaming` is always
   * false, so every restored tool indicator renders static. Combined
   * with the trailing-tool dedup in `use-conversation`, this
   * permanently eliminates the perpetual-spinner symptom.
   */
  inProgress?: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  // Catalog tier — single dataset lookups.
  list_published_datasets: 'browsing the catalog',
  get_dataset: 'looking up the dataset',
  get_dataset_summary: 'reading the dataset summary',
  get_dataset_class_counts: 'counting document classes',
  get_facets: 'checking facet aggregations',
  get_document: 'reading a specific document',
  // RAG tier.
  semantic_search_datasets: 'searching for relevant datasets',
  // Document tier.
  query_documents: 'querying documents in the dataset',
  walk_provenance: 'walking the provenance graph',
  // Tabular / aggregation tier.
  tabular_query: 'aggregating values across documents',
  ndi_query: 'running an NDI query',
  aggregate_documents: 'computing aggregate statistics',
  // Ontology + overview.
  lookup_ontology: 'resolving an ontology term',
  ndi_dataset_overview: 'building a dataset overview',
  // Signal / image / timeline / spike tier.
  fetch_signal: 'loading signal data',
  fetch_image: 'loading the image',
  fetch_spike_summary: 'loading spike data',
  treatment_timeline: 'assembling the treatment timeline',
};

/**
 * Small inline "working on it" indicator while a tool call is in
 * flight. Reads better than a generic spinner — tells the user
 * *what* the model is doing.
 *
 * Two visual modes:
 *   - in-flight (default): subtle pulse + italic. The "looks alive"
 *     state shown while the tool is actively running.
 *   - completed/restored: no pulse, no italic, subdued gray with a
 *     check-style dot. Tells the user the tool ran but isn't
 *     currently active. Used on persisted threads and for non-trailing
 *     tool entries during streaming.
 */
export function ToolCallIndicator({ toolName, inProgress = true }: Props) {
  // Strip the dynamic-tool prefix that the AI SDK adds for tools
  // registered via `dynamicTools`. e.g. `dynamic-tool-fetch_signal`
  // would otherwise show as raw snake_case "using dynamic-tool-…".
  const cleaned = toolName.replace(/^dynamic-tool-/, '');
  const label = TOOL_LABELS[cleaned] ?? `using ${cleaned}`;

  if (!inProgress) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1 text-[12px] text-gray-400"
        aria-label={`Completed: ${label}`}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300"
        />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 text-[13px] text-gray-500 italic"
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse"
      />
      <span>{label}…</span>
    </div>
  );
}

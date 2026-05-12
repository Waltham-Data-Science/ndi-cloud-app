'use client';

type Props = {
  toolName: string;
};

const TOOL_LABELS: Record<string, string> = {
  list_published_datasets: 'browsing the catalog',
  get_dataset: 'looking up the dataset',
  get_dataset_summary: 'reading the dataset summary',
  get_dataset_class_counts: 'counting document classes',
  get_facets: 'checking facet aggregations',
};

/**
 * Small inline "working on it" indicator while a tool call is in
 * flight. Reads better than a generic spinner — tells the user
 * *what* the model is doing.
 */
export function ToolCallIndicator({ toolName }: Props) {
  const label = TOOL_LABELS[toolName] ?? `using ${toolName}`;
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[13px] text-gray-500 italic">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
      <span>{label}…</span>
    </div>
  );
}

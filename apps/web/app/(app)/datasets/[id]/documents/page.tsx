/**
 * `/datasets/[id]/documents` — Document explorer tab content.
 *
 * Phase 3b structural shell. The DocumentExplorerPage port (raw doc
 * list filterable by NDI class + virtualization + ontology popovers)
 * lands in a follow-up. The tab bar in the layout marks this tab
 * `aria-selected` when the path matches `/datasets/[id]/documents`
 * exactly (NOT `/documents/[docId]` — that's the drill-down, which
 * opts out of this layout via its own nested layout).
 */
import { DocumentsShell } from './documents-shell';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentsPage({ params }: PageProps) {
  const { id } = await params;
  return <DocumentsShell datasetId={id} />;
}

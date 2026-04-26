/**
 * `/datasets/[id]/documents` — Document explorer tab content.
 *
 * Renders the ported `DocumentExplorer` (raw doc list filterable by
 * NDI class + virtualization + ontology popovers) via `<DocumentsShell>`.
 * The tab bar in the layout marks this tab `aria-current` when the path
 * matches `/datasets/[id]/documents` exactly — NOT `/documents/[docId]`,
 * which is the drill-down route that opts out of this layout's chrome
 * via the REBUILD-8 chrome-gate (`DatasetDetailChromeGate`).
 */
import type { Metadata } from 'next';

import { DocumentsShell } from './documents-shell';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Per-tab title; root layout's template wraps to "Documents · NDI Cloud".
export const metadata: Metadata = {
  title: 'Documents',
};

export default async function DocumentsPage({ params }: PageProps) {
  const { id } = await params;
  return <DocumentsShell datasetId={id} />;
}

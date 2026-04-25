/**
 * `/datasets/[id]/documents/[docId]` — single-document detail.
 *
 * Phase 3b structural shell. The DocumentDetailPage port (per-class
 * field rendering + binary blob viewer + dependency graph + appears-
 * elsewhere panel) lands in a follow-up. The dataset hero + tab bar
 * render above (per the parent layout) — a future refactor with
 * Next.js intercepting routes could drop them on this path.
 */
import { DocumentDetailShell } from './document-detail-shell';

interface PageProps {
  params: Promise<{ id: string; docId: string }>;
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id, docId } = await params;
  return <DocumentDetailShell datasetId={id} docId={docId} />;
}

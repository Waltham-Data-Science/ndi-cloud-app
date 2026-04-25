'use client';

/**
 * Documents tab content — `/datasets/[id]/documents`.
 *
 * Phase 6.5c (cross-repo unification): the structural shell that landed
 * with Phase 3b is now backed by the real `DocumentExplorer` component
 * (class-filter sidebar + paginated raw-document list with pagination
 * + `?class=`/`?page=` URL state).
 */
import { DocumentExplorer } from '@/components/app/DocumentExplorer';

export function DocumentsShell({ datasetId }: { datasetId: string }) {
  return <DocumentExplorer datasetId={datasetId} />;
}

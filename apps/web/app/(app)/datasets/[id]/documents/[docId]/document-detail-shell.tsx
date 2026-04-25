'use client';

/**
 * Document detail content — `/datasets/[id]/documents/[docId]`.
 *
 * Phase 6.5c (cross-repo unification): the structural shell that landed
 * with Phase 3b is now backed by the real `DocumentDetailView` component
 * (rich JSON tree + dependencies list + files panel + per-class header).
 *
 * The wrapping back-link to the document explorer stays here so the
 * route owns the navigation chrome and the inner view stays focused on
 * rendering one document.
 */
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { Card, CardBody } from '@/components/ui/Card';
import { useDocument } from '@/lib/api/documents';
import { DocumentDetailView } from '@/components/app/DocumentDetailView';

export function DocumentDetailShell({
  datasetId,
  docId,
}: {
  datasetId: string;
  docId: string;
}) {
  const { data, isLoading, isError } = useDocument(datasetId, docId);

  return (
    <div className="space-y-4">
      <Link
        href={`/datasets/${datasetId}/documents`}
        className="inline-flex items-center gap-1 text-[12.5px] text-fg-secondary hover:text-brand-navy transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Back to document explorer
      </Link>

      {isLoading && (
        <Card>
          <CardBody>
            <p className="text-sm text-fg-muted">Loading document…</p>
          </CardBody>
        </Card>
      )}
      {isError && (
        <Card>
          <CardBody>
            <p className="text-sm text-fg-secondary">
              Couldn&rsquo;t load document {docId}.
            </p>
          </CardBody>
        </Card>
      )}
      {data && <DocumentDetailView document={data} datasetId={datasetId} />}
    </div>
  );
}

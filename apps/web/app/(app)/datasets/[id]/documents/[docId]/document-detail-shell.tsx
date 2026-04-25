'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { Card, CardBody } from '@/components/ui/Card';
import { useDocument } from '@/lib/api/documents';

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

      <Card>
        <CardBody>
          {isLoading && (
            <p className="text-sm text-fg-muted">Loading document…</p>
          )}
          {isError && (
            <p className="text-sm text-fg-secondary">
              Couldn&rsquo;t load document {docId}.
            </p>
          )}
          {data && (
            <>
              <h2 className="font-display text-base font-semibold text-fg-primary mb-1">
                {data.name ?? data.ndiId ?? docId}
              </h2>
              <p className="text-xs font-mono text-fg-muted mb-3">
                {data.className} · {data.ndiId}
              </p>
              <p className="text-xs text-fg-muted italic">
                Phase 3b structural shell. The full DocumentDetailPage
                port (per-class field rendering + binary viewer +
                dependency graph + appears-elsewhere panel) lands in a
                follow-up.
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

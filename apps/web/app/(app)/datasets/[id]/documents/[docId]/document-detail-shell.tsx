'use client';

/**
 * Document detail content — `/datasets/[id]/documents/[docId]`.
 *
 * Phase 6.6 REBUILD-8 — full standalone routing:
 *   - The parent dataset layout now hides hero + tab bar at this URL
 *     (via `<DatasetDetailChromeGate>`), so this shell is responsible
 *     for the page's own visual hero band + back-nav.
 *   - The hero band matches the source data-browser
 *     (`ndi-data-browser-v2/frontend/src/pages/DocumentDetailPage.tsx:31-92`):
 *     full-bleed depth gradient, NDI brandmark pattern at 5% opacity,
 *     "DOCUMENT | <docClass>" eyebrow, document name as h1, class
 *     subline, and a "← Back to dataset" link in the hero.
 *
 * Phase 6.5c shipped the body content (`<DocumentDetailView>`).
 * REBUILDs 9 + 10 will add `<DependencyGraphView>` and `<DataPanel>`
 * below the body. Wiring those in here as they ship; for now the
 * order matches source's stack (DocumentDetailView →
 * AppearsElsewhere) with placeholders for the deferred viz.
 */
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { AppearsElsewhere } from '@/components/app/AppearsElsewhere';
import { DocumentDetailView } from '@/components/app/DocumentDetailView';
import { ErrorState } from '@/components/errors/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocument } from '@/lib/api/documents';

interface DocumentDetailShellProps {
  datasetId: string;
  docId: string;
}

export function DocumentDetailShell({
  datasetId,
  docId,
}: DocumentDetailShellProps) {
  const doc = useDocument(datasetId, docId);

  const docName = doc.data?.name;
  const docClass = doc.data?.className;
  const eyebrowTail =
    docClass ?? (docId.length > 24 ? `${docId.slice(0, 24)}…` : docId);

  return (
    <>
      {/* ── Hero band ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'var(--grad-depth)' }}
        aria-labelledby="doc-detail-hero"
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "url('/brand/ndicloud-emblem.svg')",
            backgroundSize: '120px',
            backgroundRepeat: 'repeat',
            opacity: 0.05,
          }}
        />
        <div className="relative mx-auto max-w-[1200px] px-7 py-10 md:py-12">
          <div className="mb-3">
            <Link
              href={`/datasets/${datasetId}`}
              className="inline-flex items-center gap-1.5 text-[12px] text-white/60 hover:text-white/90 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Back to dataset
            </Link>
          </div>

          <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-4 flex items-center gap-2 flex-wrap">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue-3"
            />
            DOCUMENT
            <span className="opacity-30 px-1" aria-hidden>
              |
            </span>
            <span className="font-mono normal-case tracking-normal text-[10.5px] text-white/85">
              {eyebrowTail}
            </span>
          </div>

          {doc.isLoading ? (
            <Skeleton className="h-9 w-3/4 max-w-[720px] bg-white/15" />
          ) : (
            <h1
              id="doc-detail-hero"
              className="text-white font-display font-extrabold tracking-tight leading-tight text-[2rem] md:text-[2.25rem] mb-2 max-w-4xl"
            >
              {docName ?? 'Document'}
            </h1>
          )}

          {docClass && (
            <p className="text-white/70 text-[13.5px]">
              <span className="font-mono">{docClass}</span>
            </p>
          )}
        </div>
      </section>

      {/* ── Body ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-7 py-7">
        <div className="space-y-4 max-w-4xl">
          <Link
            href={`/datasets/${datasetId}/documents`}
            className="inline-flex items-center gap-1 text-[12.5px] text-fg-secondary hover:text-brand-navy transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Back to document explorer
          </Link>

          {doc.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          )}

          {doc.isError && (
            <ErrorState error={doc.error} onRetry={() => void doc.refetch()} />
          )}

          {doc.data && (
            <>
              <DocumentDetailView document={doc.data} datasetId={datasetId} />
              {/* REBUILD-9 (DependencyGraphView) + REBUILD-10
                  (DataPanel + 4 binary viewers) land here in subsequent
                  rebuilds. Both will be `next/dynamic({ ssr: false })`
                  to keep D3 + uPlot off the document-detail initial-paint
                  bundle — same model as source's `lazy(() => import())`. */}
              <AppearsElsewhere
                datasetId={datasetId}
                documentId={docId}
              />
            </>
          )}
        </div>
      </section>
    </>
  );
}

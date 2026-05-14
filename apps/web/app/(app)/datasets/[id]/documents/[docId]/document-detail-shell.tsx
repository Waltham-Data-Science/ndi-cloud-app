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
import dynamic from 'next/dynamic';
import Link from 'next/link';

import { AppearsElsewhere } from '@/components/app/AppearsElsewhere';
import { DependencyGraphView } from '@/components/app/DependencyGraphView';
import { DocumentDetailView } from '@/components/app/DocumentDetailView';
import { ErrorState } from '@/components/errors/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocument } from '@/lib/api/documents';

/**
 * `<DataPanel>` is dynamically imported with `ssr: false` so its
 * dependency closure (uPlot ~12 KB gz, plus the four binary-viewer
 * subtrees) ships in a separate chunk that doesn't hit the
 * document-detail initial-paint bundle. The viewer dispatcher branches
 * on `useBinaryKind`'s response — for `kind: 'unknown'` it renders
 * nothing, so the chunk only loads when there's binary data to show.
 *
 * Source data-browser used `React.lazy` for the same reason; Next.js's
 * `dynamic` is the App Router-native equivalent and additionally lets
 * us specify a typed loading skeleton.
 */
const DataPanel = dynamic(
  () =>
    import('@/components/app/DataPanel').then((m) => ({ default: m.DataPanel })),
  {
    ssr: false,
    loading: () => <Skeleton className="h-40 w-full" />,
  },
);

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
  // Smarter H1 fallback chain — many NDI doc classes (epoch, vmspikesummary,
  // element_epoch, ontologyTableRow, treatment timeline) have no useful
  // `name` field. Some return the literal "Document" placeholder, others
  // return undefined. Before the fix both paths rendered as just
  // "Document" in the H1 (visual-UX audit, a395 P0 #5, 2026-05-14).
  //
  // Treat the literal "Document" (any casing) as equivalent to no name —
  // it carries no information beyond what the eyebrow already shows.
  // The H1 then falls back to "<className> <truncatedId>" so each
  // document has a distinguishable headline.
  const shortDocId =
    docId.length > 16 ? `${docId.slice(0, 8)}…${docId.slice(-4)}` : docId;
  const isGenericPlaceholderName =
    !docName || docName.trim().toLowerCase() === 'document';
  const h1Fallback = docClass
    ? `${docClass} ${shortDocId}`
    : `Document ${shortDocId}`;
  const h1Text = isGenericPlaceholderName ? h1Fallback : docName;

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
              className="text-white font-display font-extrabold tracking-tight leading-tight text-[2rem] md:text-[2.25rem] mb-2 max-w-4xl break-words"
            >
              {h1Text}
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
      {/*
        2026-04-28 — body widened from `max-w-4xl` (~896px) to the
        section's full `max-w-[1200px]` so the document's structured
        view and its dependency graph can sit side-by-side at md+
        widths. Pre-fix the body was a single column that stacked
        Properties → DataPanel → Graph → AppearsElsewhere; on a
        widescreen this left ~30% of the viewport empty and forced a
        long scroll to see the graph (the unique-to-NDI structural
        visual). Side-by-side keeps both above the fold on most
        desktops + makes the page feel materially richer.
      */}
      <section className="mx-auto max-w-[1200px] px-7 py-7">
        <div className="space-y-4">
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
              {/*
                Properties + Graph two-column band at md+. `items-start`
                so the columns align top regardless of unequal heights
                (the graph fans wide for upstream-heavy docs but is a
                single empty-state card for leaf docs like subjects).
                `min-w-0` on each column lets long ID strings inside
                the graph nodes truncate cleanly with `truncate` instead
                of pushing the column wider. Mobile widths (<md) stack
                vertically — Properties first, Graph second — so the
                concrete metadata reads before the relational viz.
              */}
              <div className="grid gap-4 md:grid-cols-2 items-start">
                <div className="min-w-0">
                  <DocumentDetailView document={doc.data} datasetId={datasetId} />
                </div>
                <div className="min-w-0">
                  <DependencyGraphView
                    datasetId={datasetId}
                    documentId={docId}
                  />
                </div>
              </div>
              {/* DataPanel + AppearsElsewhere stay full-width below.
                  DataPanel renders a chart / image / video player that
                  benefits from horizontal room; AppearsElsewhere is a
                  cross-dataset prompt that's always single-column. */}
              <DataPanel datasetId={datasetId} documentId={docId} />
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

'use client';

/**
 * DatasetDetailChromeGate — Phase 6.6 REBUILD-8.
 *
 * Wraps `/datasets/[id]/layout.tsx`'s output to conditionally hide the
 * dataset hero + tab bar + constrained-width section on the document
 * detail drilldown URL (`/datasets/[id]/documents/[docId]`).
 *
 * Why this exists:
 *
 * Source data-browser (React Router) had `/datasets/:id/documents/:docId`
 * as a SIBLING route of the `<DatasetDetailPage>` outlet shell — the
 * document detail page rendered "outside the Outlet" and shipped its
 * own hero. Next.js App Router's layouts NEST by default, so the
 * dataset hero + tab bar would otherwise render above every document
 * detail page (visually misleading: there's no "Overview" tab on a
 * single document).
 *
 * Phase 3b shipped `documents/[docId]/layout.tsx` as a passthrough
 * intending to opt out, but a child layout cannot escape its parent's
 * layout in App Router. The fix is a client-side gate that reads
 * `usePathname()` and skips the chrome at the document-detail URL.
 *
 * Alternative considered: route group restructure (move document
 * detail under a sibling group `(detail)`). Rejected because it'd
 * change the URL structure or require parallel routes — both
 * heavier-weight than a pathname check, and the chrome-hide is the
 * only behavior we need.
 *
 * The regex is anchored on the actual `datasetId` so unrelated
 * dataset URLs aren't accidentally matched (defensive: the parent
 * layout's `params.id` always resolves before this client component
 * mounts, so we get the correct datasetId).
 */
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { DatasetTabs } from './DatasetTabs';

interface DatasetDetailChromeGateProps {
  datasetId: string;
  /**
   * Server-rendered hero passed in as a slot from `layout.tsx` so the
   * hero can be an async RSC (with its own Suspense boundary) without
   * this client component needing to await anything itself. Pre-fix:
   * the hero was rendered inline as a client component using
   * `useDataset`, which produced `<h1>{datasetId}</h1>` in the SSR'd
   * HTML until client hydration. Post-fix: the hero RSC awaits
   * `safeFetchDataset` server-side and emits the correct H1 in the
   * initial HTML — visible to crawlers and link-preview generators.
   */
  heroSlot: ReactNode;
  children: ReactNode;
}

export function DatasetDetailChromeGate({
  datasetId,
  heroSlot,
  children,
}: DatasetDetailChromeGateProps) {
  const pathname = usePathname();
  const isDocumentDetail = isDocumentDetailPath(pathname, datasetId);

  if (isDocumentDetail) {
    // Pass children through raw — the document-detail page ships its
    // own depth-gradient hero and constrains its own width. The
    // server-rendered hero slot is intentionally NOT rendered here
    // (the doc-detail page replaces the chrome entirely).
    return <>{children}</>;
  }

  return (
    <>
      {/* `data-dataset-chrome` (R2): the document-detail page injects
          an inline <style> that hides this wrapper on initial paint
          to prevent the chrome-gate hydration flash. The data attribute
          is the stable selector — class names can change as Tailwind
          tokens evolve, attribute names stay put. */}
      <div data-dataset-chrome>
        {heroSlot}
        <DatasetTabs datasetId={datasetId} />
      </div>
      {/*
        `min-w-0` keeps wide inner tables honest — CSS Grid items
        default to `min-width: auto`, so without this a table wider
        than the viewport would push the whole page wider instead of
        triggering its own overflow-x-auto scroll. (Carried over from
        the original [id]/layout.tsx pre-REBUILD-8.)

        `data-dataset-chrome-section` (R2): the document-detail page's
        inline <style> also strips the constrained max-width + padding
        so the document-detail body renders full-bleed even before
        hydration removes this section entirely.
      */}
      <section
        data-dataset-chrome-section
        className="mx-auto max-w-[1200px] px-7 py-7 min-w-0"
      >
        {children}
      </section>
    </>
  );
}

/**
 * Match `/datasets/{datasetId}/documents/{docId}` exactly (with optional
 * trailing slash). Anchoring on `datasetId` keeps the gate dataset-
 * scoped — if the URL is for a different dataset (which shouldn't
 * happen given the parent layout's params, but defensively) the chrome
 * still renders. Special-regex chars in `datasetId` are escaped before
 * the pattern is built so dataset slugs containing `.` / `+` / etc.
 * don't widen the match.
 */
function isDocumentDetailPath(pathname: string, datasetId: string): boolean {
  const escaped = datasetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^/datasets/${escaped}/documents/[^/]+/?$`);
  return re.test(pathname);
}

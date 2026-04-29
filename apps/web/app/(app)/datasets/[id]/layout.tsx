/**
 * Dataset detail layout — chrome-only since Bug-1 architectural fix.
 *
 * Wraps every `/datasets/[id]/{overview,tables,documents}` route
 * with a shared hero band + the from-scratch a11y tab bar (audit #65).
 * The tab bar is URL-routed (`<Link>` + `usePathname`-derived
 * aria-selected), NOT state-controlled — that's the structural fix
 * for the audit.
 *
 * Phase 6.6 REBUILD-8: chrome rendering goes through
 * `<DatasetDetailChromeGate>`, which conditionally hides the hero +
 * tab bar + constrained-width section on the document-detail URL
 * (`/datasets/[id]/documents/[docId]`). Source had document detail
 * "outside the Outlet" with its own hero; in App Router that's a
 * client-side pathname check rather than a layout sibling, but the
 * UX is identical — document detail drops the dataset chrome entirely.
 *
 * # Why this layout has NO awaits
 *
 * Previous versions awaited `fetchDatasetWithStatus` here to gate the
 * route on dataset existence (calling `notFound()` on 4xx). That had
 * two production bugs:
 *
 *   1. `loading.tsx` never paints. Next.js's `loading.tsx` is the
 *      Suspense fallback for the PAGE, not the LAYOUT — a layout-level
 *      `await` blocks the page from even starting to render. Catalog
 *      clicks on slow datasets (Sophie, Jess Haley) appeared to freeze
 *      for 5-9s with no visual feedback. PR #103 (`useLinkStatus`
 *      pending pill) papered over the symptom; this layout refactor
 *      fixes the root cause by moving the awaits to the page (where
 *      Suspense actually fires).
 *
 *   2. `notFound()` from a layout doesn't pick up the sibling
 *      `not-found.tsx`. It bubbles up to the parent's not-found,
 *      which means dataset-scoped 404s rendered the GLOBAL
 *      `app/not-found.tsx` instead of the dataset-scoped one (visible
 *      in `verify-06-bad-id-fixed-but-shows-global-not-found.png`).
 *
 * Both fixes live in `lib/api/datasets-prefetch.ts`'s
 * `prefetchDatasetForPage(id)`, called from each page's top:
 *
 *   - `[id]/overview/page.tsx`
 *   - `[id]/tables/[className]/page.tsx`
 *   - `[id]/documents/page.tsx`
 *   - `[id]/documents/[docId]/page.tsx`
 *
 * The redirect-only pages (`[id]/page.tsx`, `[id]/tables/page.tsx`)
 * skip the helper since they immediately `redirect()` to a leaf that
 * does the check.
 *
 * # No `generateMetadata` here either
 *
 * Phase 6.7 A2 (PR #75) tried to recover per-route titles via a
 * layout-level `generateMetadata` that fetched the dataset name. Two
 * production failures resulted (cookies-opt-into-dynamic conflict
 * with child `generateStaticParams`, and Next 16.2 InvariantError on
 * the manifests singleton). Per-dataset titles now live on the LEAF
 * `overview/page.tsx`'s `generateMetadata` — safer composition.
 *
 * Tabs as nested routes:
 *   `tables/page.tsx`         → server redirect to ./subject
 *   `tables/[className]/page.tsx`
 *   `documents/page.tsx`              → DocumentExplorer (under chrome)
 *   `documents/[docId]/page.tsx`      → standalone (chrome hidden)
 */
import { Suspense } from 'react';

import { DatasetDetailChromeGate } from '@/components/app/DatasetDetailChromeGate';
import {
  DatasetDetailHero,
  DatasetDetailHeroSkeleton,
} from '@/components/app/DatasetDetailHero';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function DatasetDetailLayout({
  children,
  params,
}: LayoutProps) {
  // `params` is awaited because Next.js requires it; the await
  // resolves synchronously (params is known the moment the route
  // matches), so this layout does NOT block on data — `loading.tsx`
  // fires the moment the page below starts to suspend.
  const { id } = await params;

  // The hero is now an async Server Component that awaits
  // `safeFetchDataset(id)` so the H1 + byline render server-side
  // (drops the bare-ID flash that was visible to crawlers per the
  // Apr 2026 SEO audit). Wrapped in `<Suspense>` so the hero's await
  // doesn't block the page below — `loading.tsx` continues to fire
  // for the page content while the hero streams in.
  //
  // The chrome gate is a client component (uses `usePathname` for the
  // doc-detail conditional skip); the Suspense + hero compose cleanly
  // because server components can be passed as props/children to
  // client components in App Router.
  return (
    <DatasetDetailChromeGate
      datasetId={id}
      heroSlot={
        <Suspense fallback={<DatasetDetailHeroSkeleton />}>
          <DatasetDetailHero datasetId={id} />
        </Suspense>
      }
    >
      {children}
    </DatasetDetailChromeGate>
  );
}

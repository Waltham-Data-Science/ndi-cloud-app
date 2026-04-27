/**
 * Dataset detail layout — Phase 3b + REBUILD-8 chrome gate.
 *
 * Wraps every `/datasets/[id]/{overview,tables,pivot,documents}` route
 * with a shared hero band + the from-scratch a11y tab bar (audit #65).
 * The tab bar is URL-routed (`<Link>` + `usePathname`-derived
 * aria-selected), NOT state-controlled — that's the structural fix
 * for the audit.
 *
 * Phase 6.6 REBUILD-8: chrome rendering now goes through
 * `<DatasetDetailChromeGate>`, which conditionally hides the hero +
 * tab bar + constrained-width section on the document-detail URL
 * (`/datasets/[id]/documents/[docId]`). Source had document detail
 * "outside the Outlet" with its own hero; in App Router that's a
 * client-side pathname check rather than a layout sibling, but the
 * UX is identical — document detail drops the dataset chrome entirely.
 *
 * **RSC prefetch** (Batch B): server-side prefetches the dataset
 * record so the hero (which calls `useDataset(id)` on the client)
 * hydrates instantly instead of firing its own client-side fetch on
 * mount. Every tab benefits — overview, tables, documents, pivot —
 * because they all share this layout's chrome.
 *
 * Per-leaf prefetch (summary/provenance/table/etc.) lives in each
 * leaf page; the cache is shared by query key so the layout's
 * dataset prefetch + the leaf's specialized prefetches compose into
 * a fully-warmed TanStack Query cache by the time the client island
 * mounts. No on-mount fetch waterfall.
 *
 * **No `generateMetadata` here.** Phase 6.7 A2 (PR #75) tried to
 * recover the source SPA's `useDocumentTitle` per-route title by
 * adding a layout-level `generateMetadata` that fetched the dataset
 * name. Two production failures resulted:
 *
 *   1. v1 used `cookies()` to forward auth — that opted the route
 *      into dynamic rendering and conflicted with the Overview
 *      page's `generateStaticParams` (top-20 prerender). 500.
 *   2. v2 dropped `cookies()` — but Next.js 16.2 still threw
 *      `InvariantError: The manifests singleton was not initialized`
 *      whenever the layout's async `generateMetadata` tried to fetch
 *      while the child page had `generateStaticParams`. Same 500.
 *
 * NB: data prefetch (below) is NOT generateMetadata — it's a regular
 * server-side render pathway. Doesn't trigger the InvariantError.
 *
 * Per-dataset titles are now set at the LEAF overview page
 * (`overview/page.tsx`) — the safer composition. The fetch is inlined
 * (no shared helper) to dodge the turbopack runtime error that
 * crashed the previous attempt to extract a
 * `lib/api/datasets-server.ts` module. Sibling tabs (tables/
 * documents/pivot) keep generic "Tables · NDI Cloud" titles; the
 * dataset name appears only on the canonical Overview URL since
 * that's the link people share.
 *
 * A2 audit follow-up #67 — CLOSED.
 *
 * Tabs as nested routes:
 *   `tables/page.tsx`         → server redirect to ./subject
 *   `tables/[className]/page.tsx`
 *   `pivot/[grain]/page.tsx`
 *   `documents/page.tsx`              → DocumentExplorer (under chrome)
 *   `documents/[docId]/page.tsx`      → standalone (chrome hidden)
 */
import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query';

import { DatasetDetailChromeGate } from '@/components/app/DatasetDetailChromeGate';
import { fetchDatasetServer } from '@/lib/api/datasets';
import { env } from '@/lib/env';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function DatasetDetailLayout({
  children,
  params,
}: LayoutProps) {
  const { id } = await params;
  const queryClient = new QueryClient();

  if (env.INTERNAL_API_URL) {
    try {
      // Pre-warm the dataset record cache. Same query key as the
      // client-side `useDataset(id)` hook in `DatasetDetailHero` and
      // `DatasetOverviewCard`, so when the client mounts it reads from
      // the dehydrated cache instead of firing its own fetch on mount.
      // Cookies NOT forwarded — anonymous-public projection only;
      // authed details fall through to the existing client-side fetch
      // path (cookie hydration via `apiFetch`'s credentials: include).
      await queryClient.prefetchQuery({
        queryKey: ['dataset', id],
        queryFn: () => fetchDatasetServer(env.INTERNAL_API_URL!, id),
      });
    } catch {
      // Prefetch failures fall through to client-side fetch on mount.
      // Marketing chrome stays UP, hero shows skeleton, then resolves.
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DatasetDetailChromeGate datasetId={id}>
        {children}
      </DatasetDetailChromeGate>
    </HydrationBoundary>
  );
}

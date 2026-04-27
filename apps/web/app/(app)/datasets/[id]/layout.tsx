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

/**
 * Server-side timeout for per-leaf prefetches. Generous (45s) because
 * RSC runs server-to-server with no Vercel edge in the loop — the
 * only ceiling is the Vercel function's 90s budget. Dataset detail
 * endpoints that 504 on Railway will still 504 here, but in that
 * case the client-side hook re-attempts (with its own 60s budget) and
 * surfaces a typed error if it times out too.
 *
 * Each prefetch is fire-and-forget: a single endpoint going slow
 * doesn't block the others. The HydrationBoundary delivers whatever
 * succeeded, and the client-side hook fills in the rest.
 */
const PREFETCH_TIMEOUT_MS = 45_000;

/**
 * Anonymous-public detail endpoints we prefetch on the server. Each
 * goes through `INTERNAL_API_URL` (bypassing the Vercel edge → Railway
 * double-hop) and writes into the shared QueryClient under the same
 * key the client-side hook uses, so the client island reads from the
 * hydrated cache instead of firing its own fetch on mount.
 *
 * Cookies are NOT forwarded — anonymous-public projection only. Per-
 * user authed details fall through to the client-side fetch path
 * which carries cookies via `apiFetch`'s `credentials: include`.
 */
const DETAIL_PREFETCHES = [
  { suffix: '/summary', queryKey: 'summary' as const },
  { suffix: '/provenance', queryKey: 'provenance' as const },
  { suffix: '/class-counts', queryKey: 'class-counts' as const },
] as const;

async function prefetchDetailEndpoint(
  baseUrl: string,
  id: string,
  suffix: string,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/datasets/${id}${suffix}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      // Co-locate with the leaf page's `revalidate: 60` so the same
      // dataset visited within the revalidate window dedupes to one
      // upstream call per Vercel function invocation.
      cache: 'force-cache',
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function DatasetDetailLayout({
  children,
  params,
}: LayoutProps) {
  const { id } = await params;
  const queryClient = new QueryClient();

  if (env.INTERNAL_API_URL) {
    const baseUrl = env.INTERNAL_API_URL;
    // Fire all prefetches in parallel. Each is independently caught
    // via prefetchQuery's internal try/catch — a failure on one (a
    // 504 from /summary on a large dataset, say) doesn't block the
    // others. The HydrationBoundary delivers whatever resolved.
    //
    // The client-side hooks then read from the hydrated cache for
    // queries that succeeded, and fire their own (60s-timeout, zero-
    // retry) fetch for ones that didn't — surfacing a typed error
    // state instead of a stuck skeleton.
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['dataset', id],
        queryFn: () => fetchDatasetServer(baseUrl, id),
      }),
      ...DETAIL_PREFETCHES.map(({ suffix, queryKey }) =>
        queryClient.prefetchQuery({
          queryKey: ['dataset', id, queryKey],
          queryFn: () => prefetchDetailEndpoint(baseUrl, id, suffix),
        }),
      ),
    ]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DatasetDetailChromeGate datasetId={id}>
        {children}
      </DatasetDetailChromeGate>
    </HydrationBoundary>
  );
}

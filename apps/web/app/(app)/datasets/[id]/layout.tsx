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
import { notFound } from 'next/navigation';

import { DatasetDetailChromeGate } from '@/components/app/DatasetDetailChromeGate';
import { fetchDatasetServerWithStatus } from '@/lib/api/datasets';
import { env } from '@/lib/env';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Per-prefetch hard ceiling. 8s is generous enough that warm Railway
 * responses (which take ~0.1-0.5s when the upstream cache is hot, see
 * smoke-test timings against the real backend) always make it into
 * the dehydrated state, but tight enough that a cold endpoint can't
 * stall the layout render past a single TCP round-trip + a couple
 * seconds of ndiquery work. Cold endpoints fall through to the
 * client-side hook (60s timeout, zero retries) which surfaces a
 * proper error state with a Retry button instead of a layout that
 * blocks the entire page render.
 */
const PREFETCH_TIMEOUT_MS = 8_000;

/**
 * Group-level deadline. `Promise.all` waits for the slowest prefetch
 * — even if 3 of 4 resolve in 100ms, the layout blocks until the
 * slow one does. Race the whole group against this deadline so the
 * layout always renders within a tight, predictable budget. Whatever
 * landed in the queryClient by deadline gets dehydrated; the rest
 * fall through to client-side fetches.
 *
 * 3s sized against cold-but-not-pathological responses (typical
 * Railway warm summary = 0.1s, cold summary on small/medium datasets
 * = 1-3s — captured in the queryClient before deadline).
 */
const PREFETCH_GROUP_DEADLINE_MS = 3_000;

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

    // Audit 2026-04-27 #10 — explicit 404 routing. Pre-fix, a bad
    // `[id]` (legacy deeplink, typo, deleted dataset) rendered the
    // hero band with the bare id as h1, the full tab bar, AND an
    // inline error in the body — visually suggesting the dataset
    // exists but failed to load. Cleanest fix is a server-side
    // status check at the layer that owns the chrome: when the
    // dataset endpoint returns a clean 404, throw via
    // `notFound()` so Next.js renders the closest `not-found.tsx`
    // (sibling to this file) WITHOUT mounting the chrome.
    //
    // Status `0` (network blip / timeout / unparseable) is treated
    // as transient — we DON'T 404-route on it, because a bad
    // network shouldn't masquerade as a missing dataset. The client
    // hook downstream surfaces a Retry button for those cases.
    //
    // Folding this check into the prefetch (vs a separate HEAD)
    // keeps it free: the dataset record is the FIRST thing we
    // need anyway, and the queryClient gets pre-populated from the
    // same response so the client island doesn't double-fetch.
    const datasetResult = await fetchDatasetServerWithStatus(baseUrl, id);
    if (datasetResult.status === 404) {
      notFound();
    }
    queryClient.setQueryData(['dataset', id], datasetResult.data);

    // Fire the secondary prefetches in parallel. Each prefetchQuery
    // internally catches errors so a single failure (e.g. /summary
    // 504 on a large dataset) doesn't propagate. The group is then
    // RACED against PREFETCH_GROUP_DEADLINE_MS so the layout never
    // blocks page render past that ceiling — whatever's in the
    // queryClient when the race resolves gets dehydrated;
    // client-side hooks fill in the rest with their own (60s-
    // timeout, zero-retry) fetches.
    //
    // We don't `await` individual prefetches outside the race —
    // `prefetchQuery` writes to the queryClient as soon as the
    // queryFn resolves, so even prefetches that finish AFTER the
    // race deadline still populate the cache for any client renders
    // that happen on the same QueryClient instance (none here, since
    // the QueryClient is request-scoped and dehydrated immediately
    // after the race; this is just a defensive note).
    const prefetchAll = Promise.all(
      DETAIL_PREFETCHES.map(({ suffix, queryKey }) =>
        queryClient.prefetchQuery({
          queryKey: ['dataset', id, queryKey],
          queryFn: () => prefetchDetailEndpoint(baseUrl, id, suffix),
        }),
      ),
    );
    const deadline = new Promise<void>((resolve) =>
      setTimeout(resolve, PREFETCH_GROUP_DEADLINE_MS),
    );
    await Promise.race([prefetchAll, deadline]);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DatasetDetailChromeGate datasetId={id}>
        {children}
      </DatasetDetailChromeGate>
    </HydrationBoundary>
  );
}

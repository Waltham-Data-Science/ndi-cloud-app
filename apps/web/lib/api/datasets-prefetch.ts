import 'server-only';

import {
  type DehydratedState,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query';
import { notFound } from 'next/navigation';

import { env } from '@/lib/env';

/**
 * Server-side dataset prefetch helper — Bug 1 (Audit follow-up).
 *
 * # Why this lives in a page-level helper, not the layout
 *
 * The previous architecture awaited the dataset existence check INSIDE
 * `app/(app)/datasets/[id]/layout.tsx`. Two problems with that:
 *
 *   1. **`loading.tsx` never paints.** Next.js's `loading.tsx` is the
 *      Suspense fallback for the PAGE, not the LAYOUT. A layout-level
 *      `await` blocks the page from even starting to render — including
 *      the page's Suspense fallback. Result: the user sees the OLD
 *      catalog page for the entire navigation, no skeleton, no
 *      visible feedback. PR #103 (`useLinkStatus` pending pill) made
 *      the click LAND visually, but the underlying freeze remained.
 *
 *   2. **`notFound()` from a layout doesn't pick up sibling
 *      not-found.tsx.** Next.js bubbles `notFound()` thrown from a
 *      layout up to the parent's not-found.tsx, skipping the layout's
 *      own siblings. Calling `notFound()` from the layout meant the
 *      dataset-scoped `[id]/not-found.tsx` never rendered; users hit
 *      the GLOBAL `app/not-found.tsx` instead. Confirmed visually in
 *      `verify-06-bad-id-fixed-but-shows-global-not-found.png`.
 *
 * Moving the existence check + prefetch into each page (via this
 * helper) fixes both:
 *
 *   - Page is async + suspending → loading.tsx fires instantly while
 *     the page awaits → user sees the skeleton during slow fetches.
 *   - `notFound()` from the page picks up `[id]/not-found.tsx` (its
 *     sibling), giving us the dataset-scoped 404 chrome.
 *
 * The layout becomes effectively synchronous (just renders chrome),
 * which is what Next.js needs to mount the Suspense boundary that
 * loading.tsx hooks into.
 *
 * # `'server-only'` enforcement
 *
 * `lib/api/datasets.ts` has `'use client'` at line 1 — every export
 * from there is client-only. PR #101 hotfixed a 500 caused by the
 * layout awaiting `fetchDatasetServerWithStatus` (a server fn that
 * lived in the client-marked module). This module imports `server-only`
 * to make the boundary explicit: any accidental client-side import
 * fails at build time with a clear error rather than crashing
 * production with a runtime "client/server boundary" throw.
 */

// Timeout budgets for this module live in `./timeouts.ts`:
//   - PREFETCH_TIMEOUT_MS — per-prefetch hard ceiling (secondary endpoints)
//   - PREFETCH_GROUP_DEADLINE_MS — group race for the secondary batch
//   - EXISTENCE_CHECK_TIMEOUT_MS — tight ceiling for the initial dataset gate
import {
  EXISTENCE_CHECK_TIMEOUT_MS,
  PREFETCH_GROUP_DEADLINE_MS,
  PREFETCH_TIMEOUT_MS,
} from './timeouts';

/**
 * Anonymous-public detail endpoints we prefetch on the server. Cookies
 * are NOT forwarded — anonymous-public projection only. Per-user
 * authed details fall through to the client-side fetch path which
 * carries cookies via `apiFetch`'s `credentials: include`.
 */
const DETAIL_PREFETCHES = [
  { suffix: '/summary', queryKey: 'summary' as const },
  { suffix: '/provenance', queryKey: 'provenance' as const },
  { suffix: '/class-counts', queryKey: 'class-counts' as const },
] as const;

/**
 * Inline server-side dataset fetch with status. Returns `{ status, data }`:
 *
 *   - `status >= 200 && < 300`: `data` is the parsed JSON body
 *   - `status >= 400`: `data` is `null`; caller routes 400/404 to
 *     `notFound()` and treats other 4xx/5xx as transient
 *   - `status === 0`: network/timeout/parse error; caller treats as
 *     transient (NEVER as not-found — a bad network shouldn't
 *     masquerade as a missing dataset)
 *
 * No zod validation here — the page just needs to know whether the
 * dataset exists. The downstream client `useDataset` hook parses the
 * body via `DatasetRecordSchema` when reading from cache.
 */
async function fetchDatasetWithStatus(
  baseUrl: string,
  id: string,
): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    EXISTENCE_CHECK_TIMEOUT_MS,
  );
  try {
    const res = await fetch(`${baseUrl}/api/datasets/${id}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'force-cache',
      next: { revalidate: 60 },
    });
    if (!res.ok) return { status: res.status, data: null };
    const body = (await res.json()) as unknown;
    return { status: res.status, data: body };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

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

/**
 * Existence check + dataset prefetch + secondary prefetches, returning
 * the dehydrated TanStack Query state for the page to wrap children
 * in `<HydrationBoundary>`.
 *
 * Calls `notFound()` if the upstream returns 400 or 404 — the cloud
 * distinguishes:
 *   - 404: id is Mongo-ObjectId-shaped but doesn't exist
 *   - 400: id isn't a valid identifier shape (validation rejected
 *     pre-Mongo-lookup)
 * Both surface the same UX (dataset-scoped not-found.tsx) so we treat
 * them identically.
 *
 * Other failures (500/502/503/504, status 0): NOT treated as
 * not-found. A bad network or upstream blip shouldn't masquerade as a
 * missing dataset; the client hook downstream surfaces a Retry button
 * for those cases.
 *
 * Returns the dehydrated state. Caller pattern:
 *
 * ```tsx
 * export default async function Page({ params }) {
 *   const { id } = await params;
 *   const dehydratedState = await prefetchDatasetForPage(id);
 *   return (
 *     <HydrationBoundary state={dehydratedState}>
 *       <Content datasetId={id} />
 *     </HydrationBoundary>
 *   );
 * }
 * ```
 *
 * `notFound()` throws a special error that flows OUT of this helper
 * up to the caller's page; Next.js's not-found infrastructure catches
 * it and renders the closest sibling not-found.tsx. The
 * HydrationBoundary in the page never runs in that case.
 */
export async function prefetchDatasetForPage(
  id: string,
): Promise<DehydratedState> {
  const queryClient = new QueryClient();

  if (!env.INTERNAL_API_URL) {
    // Dev / preview without INTERNAL_API_URL: skip prefetch silently.
    // The client `useDataset` hook will fire its own fetch on mount.
    return dehydrate(queryClient);
  }

  const baseUrl = env.INTERNAL_API_URL;

  // Outer try/catch belt: even though `fetchDatasetWithStatus` catches
  // its own errors and returns `{ status: 0 }`, ANY unexpected throw
  // here would render the global Next.js 500 page instead of the
  // dataset chrome. Belt + suspenders so a future regression in the
  // helper doesn't bring down every dataset detail visit.
  let datasetResult: { status: number; data: unknown };
  try {
    datasetResult = await fetchDatasetWithStatus(baseUrl, id);
  } catch {
    datasetResult = { status: 0, data: null };
  }
  if (datasetResult.status === 400 || datasetResult.status === 404) {
    notFound();
  }
  // ONLY populate the cache on a successful fetch (2xx with data).
  //
  // Audit follow-up #25 (post-cutover discovery 2026-04-27): the
  // tree-shrew dataset (`66140c237dbc358954ddffb9`) has a 2.85 MB
  // record that the cloud takes ~19s to serialize. Our 1.5s
  // existence-check timeout fires long before the response lands;
  // `fetchDatasetWithStatus` returns `{ status: 0, data: null }`.
  // PRE-fix: we wrote `null` into the cache unconditionally — which
  // poisoned the client `useDataset` hook (hit cache → returned
  // `null` → hero fell back to bare-id and never recovered).
  // POST-fix: skip the write on any non-2xx (or status 0). The
  // client hook then runs its own fetch with a 60s timeout and
  // populates the cache itself when the response eventually lands.
  // For tree shrew specifically the user sees the loading skeleton
  // (or hero fallback) for ~19s on the first cold visit, then full
  // hero data; subsequent visits hit the warm Vercel data cache.
  //
  // Other failure shapes (5xx, status 0) are also intentionally
  // SKIPPED — same reasoning: don't poison the cache; let the
  // client hook decide.
  if (
    datasetResult.status >= 200 &&
    datasetResult.status < 300 &&
    datasetResult.data != null
  ) {
    queryClient.setQueryData(['dataset', id], datasetResult.data);
  }

  // Secondary prefetches in parallel, raced against the group deadline.
  // `prefetchQuery` internally catches errors so a single failure
  // (e.g. /summary 504 on a large dataset) doesn't propagate.
  // Whatever's in the queryClient when the race resolves gets
  // dehydrated; client-side hooks fill in the rest.
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

  return dehydrate(queryClient);
}

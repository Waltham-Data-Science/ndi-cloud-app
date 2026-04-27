'use client';

/**
 * DocumentExplorer — class filter sidebar + progressively-loaded document list.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/pages/DocumentExplorerPage.tsx`
 * (Phase 6.5c of the cross-repo unification — see
 * `docs/plans/cross-repo-unification-2026-04-24.md`). Adapts the data-browser
 * page-level component into a route-shell component for the App Router:
 *
 *   1. Replaces react-router-dom `useSearchParams`/`useNavigate` with
 *      Next's `useSearchParams` + `useRouter` (read-only params, push to
 *      mutate URL — same UX, just plumbed through the App Router pattern).
 *   2. Imports rewritten for monorepo layout.
 *   3. Drops the wrapping `<DocumentExplorerPage>` boundary check (the
 *      monorepo route page guarantees `datasetId` is present).
 *
 * **Progressive loading** (smoke-test follow-up): switched from
 * page-by-page navigation (Previous/Next buttons + `?page=N` URL
 * state) to streaming progressive load via `useDocumentsInfinite`.
 * The first page (50 rows) renders the moment it lands. Once the
 * user is within `AUTO_FETCH_AHEAD_PX` of the table bottom, the
 * next page auto-fetches and appends. A "Load more" button is also
 * available for keyboard / explicit-control users. The total-count
 * line shows "X of Y · loading more..." while pages are in flight,
 * matching what the user actually sees instead of saying "page N of M"
 * which doesn't reflect cumulative progress.
 *
 * Why this change: smoke-test feedback called out the previous
 * "stuck on first-page load for 30+ seconds before any rows render"
 * UX. With infinite-query semantics the FIRST page lands the
 * moment the backend returns it, and subsequent pages stream in
 * progressively — the user is never staring at an empty table
 * while the backend churns through more rows.
 */
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';

import { useClassCounts } from '@/lib/api/datasets';
import { useDocumentsInfinite } from '@/lib/api/documents';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { ErrorState } from '@/components/errors/ErrorState';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';
import { ClassCountsList } from './ClassCountsList';

const PAGE_SIZE = 50;

/**
 * IntersectionObserver root margin for auto-fetch trigger. When the
 * sentinel below the table comes within this many pixels of the
 * viewport bottom, the next page is fetched. 600px is roughly
 * "user has scrolled 12 rows past the previous page boundary" — far
 * enough ahead that the next page lands before the user actually
 * runs out of content to read, but not so far ahead that we
 * eagerly fetch beyond the user's intent.
 */
const AUTO_FETCH_AHEAD_PX = 600;

export function DocumentExplorer({ datasetId }: { datasetId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const cls = searchParams?.get('class') ?? null;

  /**
   * Single-source URL mutator used by `clearClass`. Page-state is no
   * longer URL-tracked under the infinite-load model — a deeplink
   * carries only the class filter + (eventually) global filter / sort.
   * Replacing `?page=N` with infinite scroll matches the data-browser
   * source's UX where the user just kept scrolling.
   */
  const update = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const clearClass = () =>
    update((p) => {
      p.delete('class');
      // Drop legacy `?page=N` from older bookmarks — the param is now
      // a no-op under progressive loading, but keeping it in the URL
      // would mislead users into thinking pagination still works.
      p.delete('page');
    });

  const counts = useClassCounts(datasetId);
  const docs = useDocumentsInfinite(datasetId, cls, PAGE_SIZE);

  /**
   * Flatten all loaded pages into a single document list. `useMemo`
   * matters here: without it, the rendered `<tr>` set's referential
   * identity changes every render even when no new pages arrived,
   * which would defeat any future virtualization layer added on top.
   */
  const allDocs = useMemo(
    () => docs.data?.pages.flatMap((p) => p.documents) ?? [],
    [docs.data],
  );

  /**
   * `total` comes from any loaded page (the cloud reports the same
   * total on every page envelope). `null` until the first page
   * lands so the header doesn't render a misleading "0 of 0" while
   * the request is in flight.
   */
  const total = docs.data?.pages[0]?.total ?? null;
  const loaded = allDocs.length;

  /**
   * IntersectionObserver-based auto-fetch: when the sentinel below
   * the table comes within view, request the next page. Compatible
   * with React 19's strict mode — the observer is cleaned up on
   * unmount and on dataset/class change (the effect's deps include
   * the next-page-trigger function which is stable per page).
   *
   * `hasNextPage` is a function of cumulative-loaded vs total per
   * `useDocumentsInfinite.getNextPageParam`. `isFetchingNextPage`
   * gates redundant calls when one fetch is already in flight.
   */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Destructure the fields we depend on so eslint's `react-hooks/
  // exhaustive-deps` rule sees stable identifiers instead of
  // member-access expressions on the `docs` object — granular deps
  // are correct here (we DON'T want to re-arm the observer when
  // unrelated fields like `data` reference-change), and pinning to
  // primitives + the stable callback ref satisfies the rule.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = docs;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (!hasNextPage) return;
    if (isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            fetchNextPage();
            return;
          }
        }
      },
      { rootMargin: `0px 0px ${AUTO_FETCH_AHEAD_PX}px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // `min-w-0` on grid children so the 1fr track can shrink below its
  // min-content and the inner table's `overflow-x-auto` wrapper actually
  // scrolls horizontally instead of forcing the whole page wider.
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="min-w-0">
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">
              Document classes
            </CardTitle>
            <CardDescription>
              Click any class to filter below or jump to the summary tables.
            </CardDescription>
          </CardHeader>
          <CardBody>
            {counts.isLoading && <Skeleton className="h-32 w-full" />}
            {counts.isError && (
              <ErrorState error={counts.error} onRetry={() => counts.refetch()} />
            )}
            {counts.data && (
              <ClassCountsList datasetId={datasetId} data={counts.data} />
            )}
          </CardBody>
        </Card>
      </aside>

      <section className="min-w-0">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-brand-navy">
                {cls ? (
                  <span>
                    Documents · <span className="font-mono text-ndi-teal">{cls}</span>
                  </span>
                ) : (
                  'All documents'
                )}
              </h2>
              {cls && (
                <Button size="sm" variant="ghost" onClick={clearClass}>
                  Clear class filter
                </Button>
              )}
            </div>

            {/* `isPending && !data` — first-page-not-yet-arrived
                skeleton. Once any page lands, we render rows
                progressively (even if more are still in flight). */}
            {docs.isPending && !docs.data && <TableSkeleton rows={10} />}
            {docs.isError && !docs.data && (
              <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
            )}
            {docs.data && (
              <>
                <p
                  className="mb-2 text-xs text-fg-muted font-mono"
                  data-testid="documents-progress"
                >
                  {/* "X of Y · loading more…" while another page is
                      being fetched, "X of Y" once we've reached the
                      end. The progressive count is the user's signal
                      that more rows are still arriving. */}
                  {total !== null ? formatNumber(loaded) : formatNumber(loaded)}
                  {total !== null && total !== loaded
                    ? ` of ${formatNumber(total)}`
                    : ''}
                  {isFetchingNextPage
                    ? ' · loading more…'
                    : hasNextPage
                      ? ' · scroll to load more'
                      : ''}
                </p>
                <div className="overflow-x-auto rounded border border-border-subtle">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                          Name
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                          Class
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                          Mongo ID
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-fg-secondary">
                          ndiId
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {allDocs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-8 text-center text-fg-muted"
                          >
                            No documents for this class.
                          </td>
                        </tr>
                      ) : (
                        allDocs.map((d) => {
                          const did = d.id ?? d.ndiId ?? '';
                          const href = `/datasets/${datasetId}/documents/${did}`;
                          // Whole-row click navigates — matches the
                          // summary-table UX. The Name cell is a real
                          // `<Link>` for keyboard focus, screen readers,
                          // and middle-click. We skip navigation when
                          // the click originates from text selection
                          // (user highlighted an ID to copy).
                          return (
                            <tr
                              key={did}
                              className="border-t border-border-subtle hover:bg-bg-muted cursor-pointer"
                              onClick={() => {
                                if (!did) return;
                                const sel = window.getSelection?.();
                                if (sel && sel.toString().length > 0) return;
                                router.push(href);
                              }}
                            >
                              <td className="px-3 py-1.5">
                                <Link
                                  href={href}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-brand-navy hover:text-ndi-teal hover:underline transition-colors"
                                >
                                  {d.name || (
                                    <span className="text-fg-muted" aria-hidden>
                                      —
                                    </span>
                                  )}
                                </Link>
                              </td>
                              <td className="px-3 py-1.5 font-mono text-xs">
                                {d.className || '—'}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-xs text-fg-muted">
                                {d.id || ''}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-xs text-fg-muted truncate max-w-[220px] md:max-w-[340px] lg:max-w-[480px]">
                                {d.ndiId || ''}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Sentinel + manual "Load more" button. The sentinel
                    is purely an IntersectionObserver target — the
                    user never sees it. The Load-more button is the
                    keyboard / non-pointer affordance for the same
                    advance, and a useful explicit-control fallback
                    if a future style change accidentally hides the
                    sentinel-triggered auto-fetch. Showing it only
                    when there ARE more pages keeps the bottom of
                    the table clean once everything is loaded. */}
                <div ref={sentinelRef} className="h-px" aria-hidden />
                {hasNextPage && (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isFetchingNextPage}
                      onClick={() => fetchNextPage()}
                      data-testid="documents-load-more"
                    >
                      {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

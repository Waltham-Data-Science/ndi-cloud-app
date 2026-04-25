'use client';

/**
 * DocumentExplorer — class filter sidebar + paginated raw-document list.
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
 */
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

import { useClassCounts } from '@/lib/api/datasets';
import { useDocuments } from '@/lib/api/documents';
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

export function DocumentExplorer({ datasetId }: { datasetId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const cls = searchParams?.get('class') ?? null;
  const page = Math.max(1, parseInt(searchParams?.get('page') ?? '1', 10) || 1);

  const update = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const clearClass = () =>
    update((p) => {
      p.delete('class');
      p.delete('page');
    });

  const setPage = (next: number) =>
    update((p) => {
      if (next <= 1) p.delete('page');
      else p.set('page', String(next));
    });

  const counts = useClassCounts(datasetId);
  const docs = useDocuments(datasetId, cls, page, PAGE_SIZE);

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

            {docs.isLoading && <TableSkeleton rows={10} />}
            {docs.isError && <ErrorState error={docs.error} onRetry={() => docs.refetch()} />}
            {docs.data && (
              <>
                <p className="mb-2 text-xs text-fg-muted font-mono">
                  {formatNumber(docs.data.total)} total · page {page}
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
                      {docs.data.documents.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-8 text-center text-fg-muted"
                          >
                            No documents for this class.
                          </td>
                        </tr>
                      ) : (
                        docs.data.documents.map((d) => {
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

                <nav
                  className="mt-3 flex items-center justify-center gap-3"
                  aria-label="Pagination"
                >
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-fg-muted font-mono">Page {page}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page * PAGE_SIZE >= docs.data.total}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </nav>
              </>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

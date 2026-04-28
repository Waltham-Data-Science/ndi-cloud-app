'use client';

/**
 * Catalog client island — Phase 6.6 REBUILD-5.
 *
 * Owns the URL ↔ filter-state translation and renders the canonical
 * `<FacetSidebar>` checkbox filter (replaces the Phase 6.5d-shipped
 * research-vocabulary chip cloud, which was misplaced — that surface
 * lives on `/query` per source). Reads:
 *
 *   - `?q=` text search (set by `<DatasetsHero>` from REBUILD-4)
 *   - `?species=` / `?regions=` / `?license=` comma-separated multi-select
 *   - `?sort=` sort mode (relevance | newest | oldest | name)
 *   - `?page=` pagination
 *
 * Visible datasets = `data.datasets` filtered by `matchesFilters` then
 * sorted by `compareBy(sort)`. Filtering is client-side against the
 * current page of the published-datasets envelope — same model as the
 * source. A future iteration can lift filters into the
 * `/api/datasets/published` query string for cross-page filtering, but
 * the current envelope still ships the full count via `totalNumber`.
 *
 * Phase 3a's anonymous-public guarantee is preserved: this island reads
 * URL params (which any visitor can set on a deep link) but no
 * per-user state. Two visitors hitting the same URL see the same DOM.
 *
 * Hydration: the RSC at `./page.tsx` server-prefetches the
 * `['datasets', 'published', 1, 20]` query and wraps both this island
 * and `<DatasetsHero>` in a `<HydrationBoundary>`. The first
 * `useQuery` call resolves synchronously to the prefetched data —
 * no client-side fetch on first paint. Filtering is pure JS over that
 * cached page.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { DatasetCard } from '@/components/app/DatasetCard';
import { ErrorState } from '@/components/errors/ErrorState';
import { FacetSidebar } from '@/components/datasets/FacetSidebar';
import { FilterChip } from '@/components/datasets/FilterChip';
import { Button } from '@/components/ui/Button';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useFacets, usePublishedDatasets } from '@/lib/api/datasets';
import {
  compareBy,
  licenseOptionsFor,
  matchesFilters,
  parseCsv,
  type SortMode,
} from '@/lib/dataset-filters';
import { formatNumber } from '@/lib/format';

interface DatasetsListClientProps {
  page?: number;
  pageSize?: number;
}

export function DatasetsListClient({
  page: pageProp = 1,
  pageSize = 20,
}: DatasetsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-derived state. The `page` prop on the RSC wrapper is the
  // initial value; once the user paginates, `?page=` carries the
  // current value forward.
  const page = Math.max(
    1,
    parseInt(searchParams.get('page') ?? String(pageProp), 10) || pageProp,
  );
  const q = searchParams.get('q') ?? '';
  const sort = (searchParams.get('sort') as SortMode) || 'relevance';
  const speciesFilters = parseCsv(searchParams.get('species'));
  const regionFilters = parseCsv(searchParams.get('regions'));
  const licenseFilters = parseCsv(searchParams.get('license'));

  const { data, isPending, isFetching, isError, error, refetch } =
    usePublishedDatasets(page, pageSize);
  const facets = useFacets();
  // UX-leak audit (Tier 2 #7): skeleton ONLY when there's truly no
  // data yet, not on every background revalidation. The original
  // `isLoading` prop is `isPending && isFetching`, which fires `true`
  // during stale-while-revalidate refetches — replacing already-
  // rendered cards with skeletons and making the page feel broken.
  // `isPending && !data` is the cold-cache signal; the revalidate
  // indicator below renders a subtle "Refreshing…" badge instead.
  const showSkeleton = isPending && !data;
  const isRevalidating = isFetching && !!data;

  const datasets = useMemo(() => data?.datasets ?? [], [data]);
  const total = data?.totalNumber ?? 0;
  const pageCount = total > 0 ? Math.ceil(total / pageSize) : 1;

  const licenseOptions = useMemo(
    () => licenseOptionsFor(datasets),
    [datasets],
  );

  const visible = useMemo(() => {
    const matched = datasets.filter((d) =>
      matchesFilters(d, {
        q,
        species: speciesFilters,
        regions: regionFilters,
        license: licenseFilters,
      }),
    );
    return [...matched].sort(compareBy(sort));
  }, [datasets, q, speciesFilters, regionFilters, licenseFilters, sort]);

  const anyFilterActive =
    !!q ||
    speciesFilters.length > 0 ||
    regionFilters.length > 0 ||
    licenseFilters.length > 0;

  /** Push the next URLSearchParams to `/datasets`. Drops `?page=` on any
   * non-page change so a new filter resets pagination (matches source's
   * `setParam(...) { ... if (key !== 'page') next.delete('page'); }`). */
  const pushParams = (
    mutate: (next: URLSearchParams) => void,
    options: { resetPage?: boolean } = { resetPage: true },
  ) => {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    if (options.resetPage) next.delete('page');
    const qs = next.toString();
    router.push(qs ? `/datasets?${qs}` : '/datasets');
  };

  const setParam = (key: string, value: string | null) => {
    pushParams((next) => {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    });
  };

  const toggleFilter = (
    key: 'species' | 'regions' | 'license',
    value: string,
  ) => {
    const current = parseCsv(searchParams.get(key));
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setParam(key, next.length ? next.join(',') : null);
  };

  const clearAllFilters = () => {
    pushParams((next) => {
      ['species', 'regions', 'license', 'q'].forEach((k) => next.delete(k));
    });
  };

  const setPage = (n: number) => {
    pushParams(
      (next) => {
        next.set('page', String(n));
      },
      { resetPage: false },
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
      {/*
        Audit 2026-04-27 #15 — pre-fix, keyboard tab order traversed
        the FacetSidebar (~30 checkboxes) BEFORE reaching the first
        dataset card. Same pattern as the global "Skip to main
        content" link wired in `app/layout.tsx`: visually hidden
        until focused, pins to top-center on focus, jumps directly
        to the results region (`#datasets-results` below). Same
        accessible-name vocabulary ("Skip to results") as common
        ecommerce facet UIs.
      */}
      <a
        href="#datasets-results"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-1/2 focus:-translate-x-1/2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-brand-navy focus:text-white focus:font-semibold focus:text-sm focus:rounded-md focus:no-underline focus:shadow-lg"
      >
        Skip to results
      </a>
      <FacetSidebar
        species={(facets.data?.species ?? []).map((t) => t.label)}
        regions={(facets.data?.brainRegions ?? []).map((t) => t.label)}
        licenses={licenseOptions}
        activeSpecies={speciesFilters}
        activeRegions={regionFilters}
        activeLicenses={licenseFilters}
        onToggleSpecies={(v) => toggleFilter('species', v)}
        onToggleRegion={(v) => toggleFilter('regions', v)}
        onToggleLicense={(v) => toggleFilter('license', v)}
        loading={facets.isLoading}
      />

      <div id="datasets-results" className="min-w-0">
        {/* Results info bar + sort */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white border border-border-subtle px-4 py-2.5 mb-3"
          style={{ boxShadow: 'var(--shadow-xs)' }}
        >
          <span className="text-[13.5px] text-fg-secondary inline-flex items-center gap-2 flex-wrap">
            {showSkeleton ? (
              'Loading…'
            ) : anyFilterActive ? (
              <>
                <strong className="text-brand-navy font-semibold">
                  {visible.length}
                </strong>{' '}
                of {formatNumber(total)} dataset{total === 1 ? '' : 's'}
                {q && (
                  <>
                    {' '}matching{' '}
                    <em className="text-brand-navy not-italic font-medium">
                      &ldquo;{q}&rdquo;
                    </em>
                  </>
                )}
              </>
            ) : (
              <>
                <strong className="text-brand-navy font-semibold">
                  {formatNumber(total)}
                </strong>{' '}
                datasets &middot; page {page} of {pageCount}
              </>
            )}
            {/* Subtle revalidating badge alongside the stat — preserves
                the count info while signaling that data is refreshing
                in the background. UX-leak audit Tier 2 #7. */}
            {isRevalidating && (
              <span
                className="text-[11px] text-fg-muted italic"
                aria-live="polite"
              >
                refreshing…
              </span>
            )}
          </span>
          {/*
            Audit 2026-04-27 #13 — pre-fix, the Sort selector used
            default browser <select> styling (chunky dropdown arrow,
            inconsistent font, OS-themed open menu) which stuck out
            against the rest of the catalog's flat token-driven look.
            Native <select> is preserved (best a11y + keyboard nav for
            zero JS cost), but its rendering is normalized: appearance:
            none + a layered chevron icon + matching design-token
            border/padding/shadow so it sits flush with the FacetSidebar
            inputs and the page's rhythm.
          */}
          <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            <span className="uppercase tracking-wide text-[10.5px] font-semibold">
              Sort
            </span>
            <span className="relative inline-flex">
              <select
                value={sort}
                onChange={(e) => setParam('sort', e.target.value)}
                className={
                  // appearance-none drops the OS dropdown chevron;
                  // we render our own below for visual consistency.
                  // pr-7 reserves room for the icon; bg-bg-surface
                  // matches the catalog's panel tokens. The shadow-xs
                  // puts the control on the same elevation tier as
                  // the page's Card primitives.
                  'appearance-none bg-bg-surface border border-border-subtle rounded-md ' +
                  'pl-3 pr-7 py-1.5 text-[12.5px] text-fg-primary font-medium ' +
                  'shadow-xs transition-colors ' +
                  'hover:border-border-strong hover:bg-bg-canvas ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40 focus-visible:border-ndi-teal'
                }
                aria-label="Sort"
              >
                <option value="relevance">Most relevant</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Title (A–Z)</option>
              </select>
              {/* Chevron — purely presentational, sits inside the
                  control's reserved padding-right. pointer-events-none
                  so clicks pass through to the underlying <select>. */}
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                width="12"
                height="12"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted"
              >
                <path
                  d="M4 6l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </label>
        </div>

        {/* Applied filter chips */}
        {anyFilterActive && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {q && (
              <FilterChip
                label={`“${q}”`}
                onRemove={() => setParam('q', null)}
              />
            )}
            {speciesFilters.map((v) => (
              <FilterChip
                key={`s-${v}`}
                label={v}
                onRemove={() => toggleFilter('species', v)}
              />
            ))}
            {regionFilters.map((v) => (
              <FilterChip
                key={`r-${v}`}
                label={v}
                onRemove={() => toggleFilter('regions', v)}
              />
            ))}
            {licenseFilters.map((v) => (
              <FilterChip
                key={`l-${v}`}
                label={v}
                onRemove={() => toggleFilter('license', v)}
              />
            ))}
            <button
              type="button"
              className="text-[12px] text-fg-muted hover:text-fg-secondary underline underline-offset-2 ml-1"
              onClick={clearAllFilters}
            >
              Clear all
            </button>
          </div>
        )}

        {/* Cold-cache loading state — only when there's no data yet.
            Background revalidation surfaces via the `isRevalidating`
            badge in the results-bar above, NOT by replacing rendered
            cards with skeletons. */}
        {showSkeleton && (
          <div className="grid gap-5" aria-busy="true" aria-live="polite">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {isError && (
          <ErrorState error={error} onRetry={() => void refetch()} />
        )}

        {!showSkeleton && !isError && visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-subtle bg-white p-10 text-center">
            <p className="text-[14px] text-fg-secondary">
              {anyFilterActive
                ? 'No datasets match the current filters.'
                : 'No published datasets yet.'}
            </p>
            {anyFilterActive && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={clearAllFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        {!showSkeleton && visible.length > 0 && (
          <div
            className="grid gap-5"
            // Soften revalidating opacity so the user gets a subtle
            // "data is refreshing" hint without the cards collapsing to
            // a skeleton flash. `aria-busy` flips for assistive tech.
            aria-busy={isRevalidating || undefined}
            style={
              isRevalidating
                ? { opacity: 0.85, transition: 'opacity 200ms ease-out' }
                : undefined
            }
          >
            {visible.map((d) => (
              <DatasetCard key={d.id} dataset={d} />
            ))}
          </div>
        )}

        {!showSkeleton && pageCount > 1 && (
          <nav
            className="flex items-center justify-center gap-3 pt-8"
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
            <span className="text-[13px] text-fg-muted font-mono">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!data || page >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}

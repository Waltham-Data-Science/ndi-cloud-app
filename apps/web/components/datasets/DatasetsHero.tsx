'use client';

/**
 * Catalog hero band — Phase 6.6 REBUILD-4.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/pages/DatasetsPage.tsx:144-234`.
 * The source DatasetsPage was a single client component combining hero +
 * facet sidebar + result grid; this monorepo splits the catalog into RSC
 * (`page.tsx`) wrapping `<HydrationBoundary>` over two client siblings:
 * `<DatasetsHero>` (this file) and `<DatasetsListClient>` (the existing
 * grid + FacetPanel). Both children share the same prefetched query
 * (`['datasets', 'published', 1, 20]`), so only one network fetch
 * happens on mount.
 *
 * Why a sibling rather than wrapping the hero around the list:
 *   - The hero is full-bleed (depth-gradient edge-to-edge); the list is
 *     in a constrained `max-w-[1200px]` container. Splitting at the
 *     `<section>` boundary keeps the layout primitives clean.
 *   - The hero is a write-side surface (search submit, popular chips
 *     push `?q=` to URL); the list is a read-side surface (REBUILD-5
 *     reads `?q=`, `?species=`, `?regions=`, `?license=` to filter
 *     visible datasets). Separating them makes the data-flow direction
 *     explicit.
 *
 * Anonymous-public guarantee preserved: this component reads no
 * per-user state. The only dynamic content is `data.totalNumber` from
 * the published-datasets query, which is identical for every viewer.
 *
 * "Client-side stats" decision: the FastAPI proxy has no
 * `/api/datasets/stats` endpoint, and the only dynamic stat the hero
 * displays is the published-dataset count — already in the
 * `/api/datasets/published` response envelope as `totalNumber`. Reusing
 * that field instead of inventing a stats endpoint avoids a second
 * request per catalog mount and lets the hero render synchronously
 * from the prefetched RSC cache.
 */
import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { usePublishedDatasets } from '@/lib/api/datasets';
import { formatNumber } from '@/lib/format';

/**
 * Popular search seeds shown below the hero search. Click → run search.
 * Same five terms as the source's `POPULAR_SEARCHES` (DatasetsPage.tsx:16).
 */
const POPULAR_SEARCHES = [
  'Mus musculus',
  'V1 recordings',
  'Orientation tuning',
  'Chronic probe',
  'Van Hooser Lab',
] as const;

const PAGE_SIZE = 20;

export function DatasetsHero() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Prefill the search input from the URL on mount so a deep-link to
  // `/datasets?q=foo` shows "foo" in the search box. We don't subscribe
  // to URL changes — the search input is local state, committed on
  // submit (matches source's `draftQ` pattern).
  const initialQ = searchParams.get('q') ?? '';
  const [draftQ, setDraftQ] = useState(initialQ);

  // Reuse the prefetched query so the total count renders instantly on
  // first paint. The same key is prefetched in `app/(app)/datasets/page.tsx`
  // and consumed by `<DatasetsListClient>`; TanStack dedupes by key.
  const { data } = usePublishedDatasets(1, PAGE_SIZE);
  const total = data?.totalNumber ?? 0;

  const pushQ = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      const params = new URLSearchParams();
      params.set('q', trimmed);
      router.push(`/datasets?${params.toString()}`);
    } else {
      // Empty search clears the param entirely — keeps the URL clean
      // (matches source: `setParam('q', draftQ.trim() || null)` which
      // deletes the key when null).
      router.push('/datasets');
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    pushQ(draftQ);
  };

  const handlePopular = (term: string) => {
    setDraftQ(term);
    pushQ(term);
  };

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: 'var(--grad-depth)' }}
      aria-labelledby="datasets-hero"
    >
      {/* Pattern overlay — NDI brandmark at 5% opacity. Decorative; the
       * SVG ships in /public/brand/ to mirror the source's asset path. */}
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

      <div className="relative mx-auto max-w-[1200px] px-7 py-14 md:py-16">
        <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-4 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue-3"
          />
          NDI Data Commons · Open access
        </div>

        <h1
          id="datasets-hero"
          className="text-white font-display font-extrabold tracking-tight leading-[1.1] text-[2.25rem] md:text-[2.75rem] mb-3 max-w-3xl"
        >
          Discover published neuroscience datasets.
        </h1>

        <p className="text-white/70 text-[15px] leading-relaxed max-w-[640px] mb-6">
          Faceted search across every dataset on NDI Cloud. Filter by species,
          region, probe, year &mdash; every entry carries a Crossref DOI.
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex gap-1.5 p-1.5 rounded-xl border border-white/20 backdrop-blur-md max-w-[720px]"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          role="search"
        >
          <label htmlFor="hero-search" className="sr-only">
            Search datasets
          </label>
          <div className="flex-1 flex items-center gap-2 px-3">
            <Search className="h-4 w-4 text-white/55" aria-hidden />
            <input
              id="hero-search"
              type="search"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="Search species, region, probe, contributor, DOI…"
              className="flex-1 bg-transparent border-none outline-none text-white text-[15px] placeholder:text-white/50 py-2.5"
              autoComplete="off"
              aria-label="Search datasets"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-ndi-teal px-5 py-2.5 text-[14px] font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-3 transition-all"
            style={{ boxShadow: 'var(--shadow-cta)' }}
          >
            Search
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 items-center text-[12.5px]">
          <span className="text-white/55 font-semibold tracking-wide">
            Popular:
          </span>
          {POPULAR_SEARCHES.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => handlePopular(term)}
              className="px-3 py-1 rounded-full text-white/85 hover:text-white hover:bg-white/15 transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              {term}
            </button>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-x-10 gap-y-3 text-[11.5px] text-white/55">
          <Stat label="Published datasets" value={formatNumber(total)} />
          <Stat label="DOI coverage" value="Crossref" />
          <Stat label="Metadata standard" value="OpenMINDS" />
          <Stat label="Access" value="No login required" />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <strong className="text-white font-display font-bold text-[17px] tracking-tight leading-none mb-1">
        {value}
      </strong>
      <span className="uppercase tracking-wider">{label}</span>
    </div>
  );
}

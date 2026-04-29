/**
 * Catalog (RSC + ISR).
 *
 * Phase 3a's architectural deliverable. The page is a Server Component
 * with `revalidate: 60` so the rendered HTML is cached at the edge and
 * shipped to the next visitor without re-rendering. The same render
 * primes a TanStack Query cache via `prefetchQuery`, then ships that
 * dehydrated state to the client through `<HydrationBoundary>` so the
 * client island mounts with the data already in cache — no
 * waterfall fetch on first paint.
 *
 * **Anonymous-public guarantee:** this render path reads no per-user
 * state. The catalog renders identically for all viewers. Per-user
 * affordances (bookmark indicators, "recently viewed") would have to
 * live inside a separate client island that fetches its own state on
 * mount — not in this RSC, not in this prefetch query. ISR caching
 * across users is the correctness contract; per-user content here would
 * leak from one viewer to another.
 *
 * **Server-side fetch path:** RSC fetches the FastAPI directly via
 * `INTERNAL_API_URL` (Railway origin) rather than going through the
 * Vercel rewrite at `/api/*`. That avoids a server-to-edge-to-server
 * double-hop on every ISR build. In dev/test where `INTERNAL_API_URL`
 * is unset, prefetch is skipped and the client island fetches at mount
 * (the same path it'd take on a cache miss in prod).
 *
 * **Failure mode:** if the prefetch fails (Railway 5xx, network), we
 * still ship the page — the HydrationBoundary just hands over an empty
 * cache and the client falls back to its own fetch. Partial degradation
 * (page UP, list spins briefly) is preferable to a full 500.
 */
import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from '@tanstack/react-query';
import type { Metadata } from 'next';

import {
  fetchPublishedDatasets,
  type DatasetListResponse,
} from '@/lib/api/datasets';
import { env } from '@/lib/env';
import { DatasetsHero } from '@/components/datasets/DatasetsHero';
import { DatasetsListClient } from './datasets-client';

export const revalidate = 60;

export const metadata: Metadata = {
  // Bare title; root layout's `template: '%s · NDI Cloud'` adds the suffix.
  // (Pre-hotfix: this had a literal " · NDI Cloud" that the template then
  //  doubled into "Published datasets · NDI Cloud · NDI Cloud".)
  title: 'Published datasets',
  description:
    'Browse the NDI Data Commons — open neuroscience datasets with DOIs, openMINDS and NDI metadata, and full provenance.',
  alternates: { canonical: '/datasets' },
};

const PAGE_SIZE = 20;

export default async function DatasetsPage() {
  const queryClient = new QueryClient();

  if (env.INTERNAL_API_URL) {
    try {
      await queryClient.prefetchQuery<DatasetListResponse>({
        queryKey: ['datasets', 'published', 1, PAGE_SIZE],
        queryFn: () =>
          fetchPublishedDatasets(env.INTERNAL_API_URL!, 1, PAGE_SIZE),
      });
    } catch {
      // Prefetch failures fall through to client-side fetch on mount —
      // marketing chrome stays UP, list shows skeleton, then resolves
      // (or surfaces an error state if the proxy is also down).
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/* Full-bleed depth-gradient hero. Reads `totalNumber` from the
       * shared prefetched query so the "Published datasets" stat renders
       * synchronously on first paint — no second network request, no
       * skeleton flash. Phase 6.6 REBUILD-4 closes the catalog-hero
       * placeholder.
       */}
      <DatasetsHero />

      <div className="px-7 py-8 bg-bg-canvas">
        <div className="mx-auto max-w-[1200px]">
          <DatasetsListClient page={1} pageSize={PAGE_SIZE} />
        </div>
      </div>
    </HydrationBoundary>
  );
}

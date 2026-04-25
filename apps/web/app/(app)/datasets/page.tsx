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
import { DatasetsListClient } from './datasets-client';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Published datasets · NDI Cloud',
  description:
    'Browse the NDI Data Commons — open neuroscience datasets with Crossref DOIs, OpenMINDS metadata, and full provenance.',
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
    <div
      className="px-7 py-12 bg-bg-canvas"
      aria-labelledby="datasets-h1"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
          NDI Data Commons · Open access
        </div>
        <h1
          id="datasets-h1"
          className="text-[2.25rem] md:text-[2.75rem] font-bold tracking-tight text-fg-primary leading-[1.1] mb-3"
        >
          Published neuroscience datasets
        </h1>
        <p className="text-fg-secondary text-[15px] leading-relaxed max-w-[640px] mb-8">
          Faceted search across every dataset on NDI Cloud. Filter by
          species, region, probe, year — every entry carries a Crossref DOI.
        </p>

        <HydrationBoundary state={dehydrate(queryClient)}>
          <DatasetsListClient page={1} pageSize={PAGE_SIZE} />
        </HydrationBoundary>
      </div>
    </div>
  );
}

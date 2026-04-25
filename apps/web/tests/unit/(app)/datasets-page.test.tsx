/**
 * Catalog hydration contract — the Phase 3a payoff test.
 *
 * The catalog at `/datasets` is RSC + ISR. The RSC server-prefetches
 * `['datasets', 'published', 1, 20]`, dehydrates the cache, and ships
 * it through `<HydrationBoundary>`. The client island
 * (`DatasetsListClient`) consumes that cache via `usePublishedDatasets`
 * and SHOULD mount with the data already present — no fresh fetch on
 * first paint, no loading skeleton flash.
 *
 * This test simulates that handoff: build a server-side QueryClient,
 * prefetch with a known queryFn, dehydrate, then mount the client
 * inside `<QueryClientProvider>` + `<HydrationBoundary>` with a NEW
 * client (mirroring the SSR/CSR boundary). Assert:
 *   - The `<DatasetCard>` list renders synchronously with the known
 *     data (no isLoading flicker).
 *   - `global.fetch` is NOT called by the hook on mount.
 *
 * If `dehydrate` / `<HydrationBoundary>` regresses on a future
 * Next/React/TanStack upgrade, this test goes red. That's the early-
 * warning the post-Phase-2 plan called out: don't wait until the user
 * reports stale catalogs to find out the SSR-CSR handoff broke.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  dehydrate,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { DatasetsListClient } from '@/app/(app)/datasets/datasets-client';
import type { DatasetListResponse } from '@/lib/api/datasets';

// Two datasets from a real-ish shape; we don't need richness for the
// hydration assertion.
const FIXTURE: DatasetListResponse = {
  totalNumber: 2,
  datasets: [
    {
      id: 'd1',
      name: 'Dataset One — V1 chronic recordings',
      description: 'Mouse V1 chronic 32-channel recording across visual stimuli.',
      species: 'Mus musculus',
      brainRegions: 'V1',
      license: 'CC-BY-4.0',
      isPublished: true,
      doi: 'https://doi.org/10.1/aaa',
    },
    {
      id: 'd2',
      name: 'Dataset Two — Auditory cortex tone-evoked',
      description: 'Tone-evoked single-unit responses in mouse auditory cortex.',
      species: 'Mus musculus',
      brainRegions: 'A1',
      license: 'CC0-1.0',
      isPublished: true,
    },
  ],
};

function HydratedTestProvider({
  client,
  state,
  children,
}: {
  client: QueryClient;
  state: unknown;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={client}>
      <HydrationBoundary state={state}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}

describe('Catalog hydration contract', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mounts the catalog list synchronously from prefetched cache without a fresh fetch', async () => {
    // ── Server side: prefetch the catalog query, then dehydrate.
    const ssrClient = new QueryClient();
    await ssrClient.prefetchQuery({
      queryKey: ['datasets', 'published', 1, 20],
      queryFn: async () => FIXTURE,
    });
    const dehydrated = dehydrate(ssrClient);

    // ── Client side: fresh QueryClient, hydrate from the dehydrated state.
    const csrClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 60_000,
        },
      },
    });

    render(
      <HydratedTestProvider client={csrClient} state={dehydrated}>
        <DatasetsListClient page={1} pageSize={20} />
      </HydratedTestProvider>,
    );

    // Both dataset names should be present from the prefetched cache.
    expect(
      screen.getByText(/Dataset One — V1 chronic recordings/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Dataset Two — Auditory cortex tone-evoked/),
    ).toBeInTheDocument();

    // The whole point: useQuery resolves synchronously to the cached
    // data, no network call required. If this assertion fires, the SSR
    // → CSR handoff regressed.
    const catalogFetchCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0] ?? '').includes('/api/datasets/published'),
    );
    expect(catalogFetchCalls).toHaveLength(0);
  });

  it('falls back to a loading skeleton when no cache is hydrated (cold mount)', () => {
    const csrClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // Pending forever — we just check the loading branch.
          queryFn: async () => new Promise<DatasetListResponse>(() => {}),
        },
      },
    });

    render(
      <QueryClientProvider client={csrClient}>
        <DatasetsListClient page={1} pageSize={20} />
      </QueryClientProvider>,
    );

    // CardSkeleton renders 6 placeholders (see datasets-client.tsx).
    // We assert the skeleton container's aria-hidden squares are present
    // by querying for the count of `.skeleton` elements via the root.
    const skeletons = document.querySelectorAll('.skeleton');
    // 6 cards × 3 lines per CardSkeleton = 18 skeleton divs.
    expect(skeletons.length).toBeGreaterThanOrEqual(6);
  });
});

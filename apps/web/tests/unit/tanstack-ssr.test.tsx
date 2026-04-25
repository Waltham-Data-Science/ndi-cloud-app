/**
 * TanStack Query SSR pattern verification (Phase 3a pre-flight).
 *
 * Phase 3a's catalog RSC at app/(app)/datasets/page.tsx will:
 *   1. Create a fresh QueryClient on the server
 *   2. await queryClient.prefetchQuery({ queryKey, queryFn })
 *   3. dehydrate(queryClient) → serializable state
 *   4. <HydrationBoundary state={dehydrated}>
 *        <ClientIsland />
 *      </HydrationBoundary>
 *   5. ClientIsland calls useQuery({ queryKey, queryFn }), reads the
 *      pre-populated data WITHOUT invoking queryFn a second time.
 *
 * This pattern is documented in TanStack Query 5's SSR guide and is
 * stable across React 18 / 19; there's no Next-specific magic in the
 * dehydrated handoff (it's pure JSX + React state). But Next 16 is
 * paired with React 19 + Turbopack + Vite 8 + Vitest 4, all of which
 * have shipped recently — this test catches any regression in that
 * stack BEFORE Phase 3a's catalog RSC depends on the pattern.
 *
 * The test uses `renderToString` (the same rendering path Next.js
 * uses for Server Component output) to drive an SSR pass, then
 * remounts the same tree on the client and asserts the queryFn was
 * called exactly once (server side).
 *
 * If this test ever starts failing on a stack upgrade, Phase 3a's
 * catalog RSC will fall back to client-only fetching with a loading
 * skeleton (acceptable degradation; just slower first paint) until
 * the dependency is fixed upstream.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  dehydrate,
  useQuery,
} from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { render, screen, waitFor } from '@testing-library/react';

type SsrFixture = { ssrPrefetched: true; payload: string };

const QUERY_KEY = ['phase-2a:ssr-verification'] as const;

function createFreshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
}

/**
 * The same client island Phase 3a will use: a `'use client'` boundary
 * (not literally needed inside the test — it's a JSX function) that
 * consumes the dehydrated state via useQuery.
 */
function ClientIsland({ queryFn }: { queryFn: () => Promise<SsrFixture> }) {
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn });
  if (isLoading) return <div data-testid="status">loading</div>;
  if (!data) return <div data-testid="status">no-data</div>;
  return (
    <div data-testid="payload">
      {data.payload} (prefetched={String(data.ssrPrefetched)})
    </div>
  );
}

describe('TanStack Query SSR (Phase 3a contract)', () => {
  it('renderToString emits prefetched data without invoking queryFn after hydration', async () => {
    // ─── SERVER PASS ──────────────────────────────────────────────
    // Mirror what Phase 3a's RSC does: create a server-side QueryClient,
    // prefetch the query so its result is in the cache, dehydrate.
    const serverClient = createFreshClient();
    const serverQueryFn = vi
      .fn<() => Promise<SsrFixture>>()
      .mockResolvedValue({ ssrPrefetched: true, payload: 'server-payload' });

    await serverClient.prefetchQuery({ queryKey: QUERY_KEY, queryFn: serverQueryFn });
    expect(serverQueryFn).toHaveBeenCalledOnce();

    const dehydrated = dehydrate(serverClient);
    // dehydrate output must be serializable JSON — Phase 3a will pass
    // it through React's RSC payload to the client.
    expect(() => JSON.stringify(dehydrated)).not.toThrow();
    // The cache snapshot must contain our key.
    const cachedQueries = (
      dehydrated as { queries: Array<{ queryKey: ReadonlyArray<string> }> }
    ).queries;
    expect(cachedQueries.some((q) => q.queryKey[0] === QUERY_KEY[0])).toBe(true);

    // SSR-render the tree the way Next 16 will, with a fresh client-side
    // QueryClient + HydrationBoundary populating it from the dehydrated
    // state. Note: the queryFn passed to the client tree is a SPY — if
    // hydration works, it must NOT be invoked.
    const clientClient = createFreshClient();
    const clientQueryFn = vi.fn<() => Promise<SsrFixture>>();

    const ssrHtml = renderToString(
      <QueryClientProvider client={clientClient}>
        <HydrationBoundary state={dehydrated}>
          <ClientIsland queryFn={clientQueryFn} />
        </HydrationBoundary>
      </QueryClientProvider>,
    );

    // ─── ASSERTION 1: SSR HTML contains the prefetched payload ──
    // If hydration handoff works, renderToString sees the cache as
    // already populated and emits the data immediately. If it doesn't,
    // we'd see "loading" or "no-data" in the HTML.
    expect(ssrHtml).toContain('server-payload');
    expect(ssrHtml).toContain('data-testid="payload"');

    // ─── ASSERTION 2: The client queryFn was NOT invoked during SSR
    // The server already populated the cache; HydrationBoundary mirrored
    // that into the client QueryClient. useQuery sees the cache hit and
    // returns the data without calling queryFn.
    expect(clientQueryFn).not.toHaveBeenCalled();
  });

  it('mounting the hydrated tree on the client preserves the prefetched data without refetching', async () => {
    // ─── SERVER PASS (same as above, abbreviated) ─────────────────
    const serverClient = createFreshClient();
    await serverClient.prefetchQuery({
      queryKey: QUERY_KEY,
      queryFn: async () => ({
        ssrPrefetched: true,
        payload: 'pre-rendered',
      }) as SsrFixture,
    });
    const dehydrated = dehydrate(serverClient);

    // ─── CLIENT MOUNT ─────────────────────────────────────────────
    // Now mount the same tree via RTL (jsdom) — this is what happens
    // post-hydration in the browser. The client queryFn spy must remain
    // un-invoked: useQuery sees the cache populated by HydrationBoundary
    // and returns the data synchronously.
    const clientClient = createFreshClient();
    const clientQueryFn = vi.fn<() => Promise<SsrFixture>>();

    render(
      <QueryClientProvider client={clientClient}>
        <HydrationBoundary state={dehydrated}>
          <ClientIsland queryFn={clientQueryFn} />
        </HydrationBoundary>
      </QueryClientProvider>,
    );

    // The data should appear immediately, not after a network round-trip.
    await waitFor(() => {
      expect(screen.getByTestId('payload').textContent).toBe(
        'pre-rendered (prefetched=true)',
      );
    });

    // Critical: queryFn was NOT called on the client. Phase 3a depends
    // on this — if useQuery fired a refetch on every page load, the
    // RSC prefetch would be wasted and we'd pay double-fetch latency
    // for catalog hits.
    expect(clientQueryFn).not.toHaveBeenCalled();
  });

  it('dehydrate output round-trips through JSON.stringify/parse (Next RSC payload contract)', async () => {
    // Phase 3a passes the dehydrated state through Next.js's RSC payload,
    // which is JSON-serialized. Verify our query data round-trips.
    const serverClient = createFreshClient();
    await serverClient.prefetchQuery({
      queryKey: QUERY_KEY,
      queryFn: async () =>
        ({
          ssrPrefetched: true,
          payload: 'json-test-payload',
        }) as SsrFixture,
    });

    const dehydrated = dehydrate(serverClient);
    const serialized = JSON.stringify(dehydrated);
    const restored = JSON.parse(serialized);

    // The serialized form must reconstruct identically — anything else
    // means a non-JSON value (Date, Map, function) leaked into the
    // queryFn's return value, which would break Next's RSC handoff.
    expect(restored).toEqual(dehydrated);
    expect(serialized.length).toBeGreaterThan(0);
    expect(serialized).toContain('json-test-payload');
  });
});

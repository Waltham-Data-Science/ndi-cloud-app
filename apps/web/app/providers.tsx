'use client';

/**
 * Client-side providers tree.
 *
 * Composition history (kept brief because it explains *why* this file
 * has what it has, not future work):
 *   - Phase 1 wired `QueryClient` only.
 *   - Phase 3a layered `PersistQueryClientProvider` with a localStorage
 *     persister so `/datasets`, `/datasets/[id]`, and `/my` paint with
 *     last-known data on revisit before TanStack Query revalidates.
 *   - Vercel `<Analytics>` + `<SpeedInsights>` mount in `app/layout.tsx`
 *     (server-side / global), NOT here — this provider tree is purely
 *     client-side state.
 *
 * QueryClient is created via useState so HMR doesn't tear down the cache.
 *
 * Cache strategy
 * ──────────────
 * Two-tier client-side caching, ported verbatim from
 * `ndi-data-browser-v2/frontend/src/App.tsx` (PR #76 audit settings):
 *
 *   1. In-memory TanStack Query cache (`staleTime: 60s`, `gcTime: 30m`).
 *      Within a session a query is fresh for 60s; nav-back inside that
 *      window is a no-round-trip render.
 *
 *   2. Persisted cache via localStorage (`maxAge: 1h`). Survives page
 *      refresh + tab close. The catalog RSC also pre-warms via
 *      `<HydrationBoundary>` so cold-load hits the same cache key.
 *
 *      `buster` is bumped when a response shape changes incompatibly;
 *      mismatched cache entries are wiped on next mount so a stale
 *      client can't render fields that no longer exist.
 *
 * Auth-gated queries (`useSession`, `useMyDatasets`) persist too —
 * acceptable because localStorage is origin-scoped to ndi-cloud.com and
 * `useLogout` clears the whole cache (which also rewrites the persisted
 * snapshot) so a logged-out user's stale state can't leak.
 */
import { useState } from 'react';
import { QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

import { ApiError } from '@/lib/api/client';

// Bump when a response shape changes incompatibly (required-field removal,
// type narrowing). Touching this triggers a one-time cache wipe across all
// users on next visit after deploy.
const CACHE_BUSTER = 'v2-2026-04-25';

// Same retry rules as data-browser PR #76: never retry user errors
// (401/403/404/400/422), allow up to 2 retries on other errors.
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (
      error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 422
    ) {
      return false;
    }
  }
  return failureCount < 2;
}

/**
 * SSR / RSC / test-environment fallback. The catalog RSC server-prefetches
 * during render — at that point there's no `window.localStorage` to back
 * the persister. Returning an in-memory persister keeps the
 * `<PersistQueryClientProvider>` happy without crashing on the server.
 *
 * This mirrors data-browser's `App.tsx` `makePersister`.
 */
function makePersister(): Persister {
  if (typeof window === 'undefined' || !window.localStorage) {
    let snapshot: PersistedClient | undefined;
    return {
      persistClient: async (client) => {
        snapshot = client;
      },
      restoreClient: async () => snapshot,
      removeClient: async () => {
        snapshot = undefined;
      },
    };
  }
  return createSyncStoragePersister({
    storage: window.localStorage,
    // Namespaced so other apps / older builds on the same origin don't
    // clobber our cache key.
    key: 'ndi-query-cache',
    // Throttle writes so a burst of mutations doesn't spam
    // localStorage.setItem (sync, can be slow on large caches).
    throttleTime: 1_000,
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            retry: shouldRetryQuery,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  const [persister] = useState(() => makePersister());

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // One hour — long enough that "close tab, come back to the same
        // dataset in an hour" is instant; short enough that a window of
        // staleness stays bounded.
        maxAge: 60 * 60 * 1000,
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          // Don't persist pending/errored queries — they'd re-hydrate
          // into "forever loading" or "forever error" states. Only
          // successful responses are worth carrying over.
          shouldDehydrateQuery: (query) => query.state.status === 'success',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

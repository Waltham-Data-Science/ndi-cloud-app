'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Client-side providers tree.
 *
 * Phase 1: just QueryClient. Phase 3a layers PersistQueryClientProvider on
 * top with a localStorage persister. Phase 5 adds <Analytics /> +
 * <SpeedInsights />.
 *
 * QueryClient is created via useState so HMR doesn't tear down the cache.
 *
 * Retry rules mirror the ndi-data-browser-v2 PR #76 settings:
 * - never retry 4xx (client errors) except 408/429 (transient)
 * - retry up to 2x on other errors with backoff
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 30 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              const status = (error as { status?: number }).status;
              if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
                return false;
              }
              return failureCount < 2;
            },
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

'use client';

import { useQuery } from '@tanstack/react-query';

import { me, type AuthUser } from '@/lib/api/auth';

/**
 * Session hook — backed by TanStack Query against `/api/auth/me`.
 *
 *   - One `/api/auth/me` call shared across every consumer per page.
 *   - Automatic refetch on window focus + cache invalidation when
 *     `login` / `logout` mutate the cache.
 *   - SSR-safe: returns the unauthenticated state during prerender
 *     (the queryFn no-ops on the server because `document.cookie` is
 *     undefined in apiFetch's CSRF read path).
 *
 * The cache is layered with `PersistQueryClientProvider` (see
 * `app/providers.tsx`) so a fresh page load hydrates from localStorage
 * instead of showing a flash of "Log in / Create Account" while
 * `/api/auth/me` round-trips.
 */
export type Session = {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
};

export function useSession(): Session {
  const { data, isLoading, error } = useQuery({
    queryKey: ['session'],
    queryFn: me,
    staleTime: 60_000,
    // 401 from /api/auth/me is the legitimate "logged-out" state, not
    // an error to retry.
    retry: false,
    // Don't refetch on every focus — login/logout invalidate the
    // ['session'] cache explicitly when state changes.
    refetchOnWindowFocus: false,
  });

  return {
    user: data ?? null,
    isLoading,
    error: error instanceof Error ? error : null,
  };
}

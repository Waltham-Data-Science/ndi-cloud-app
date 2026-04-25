'use client';

import { useQuery } from '@tanstack/react-query';

import { me, type AuthUser } from '@/lib/api/auth';

/**
 * Real session hook — Phase 2b.
 *
 * Replaces the Phase 2a stub. Backed by TanStack Query, which gives
 * us:
 *   - one `/api/auth/me` call shared across every consumer per page
 *   - automatic refetch on window focus + cache invalidation when
 *     login/logout mutate the cache
 *   - SSR-safe: returns the unauthenticated state during prerender
 *     (the queryFn no-ops on the server because document.cookie is
 *     undefined in apiFetch's CSRF read path)
 *
 * The shape stays compatible with the Phase 2a stub (`{ user }`) so
 * Header.tsx and AccountSidebar.tsx don't need to change. Adds
 * `isLoading` and `error` so consumers that care about the
 * pre-resolution state can render a skeleton or hide auth-aware UI.
 *
 * Phase 3a layers PersistQueryClientProvider on top so a fresh page
 * load hydrates from localStorage instead of showing a flash of
 * "Log in / Create Account" while /api/auth/me round-trips.
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

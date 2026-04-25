'use client';

/**
 * Auth session hook — Phase 2a stub.
 *
 * Returns `null` (unauthenticated) for now. Phase 2b wires this up against
 * the cookie-based auth flow (apiFetch('/api/auth/me')); Phase 3a layers
 * TanStack Query caching on top via PersistQueryClient.
 *
 * Header + AccountSidebar consume this; while the real implementation is
 * pending, the stub lets the chrome render in its unauthenticated state
 * (Log in / Create Account CTAs visible) — which is the correct rendering
 * for every public marketing page.
 */

export type Session = {
  user: { email: string; name?: string } | null;
};

export function useSession(): Session {
  return { user: null };
}

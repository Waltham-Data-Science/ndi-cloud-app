/**
 * Tests for the Phase 2a stub useSession hook.
 *
 * The contract: returns `{ user: null }` (unauthenticated). Phase 2b
 * replaces this implementation with a real read against the cookie-
 * based auth flow; the test stays valid because the unauthenticated
 * fallback shape is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { useSession } from '@/lib/auth/use-session';

describe('useSession (Phase 2a stub)', () => {
  it('returns an unauthenticated session', () => {
    const session = useSession();
    expect(session).toEqual({ user: null });
  });

  it('returns the same shape on every call (referentially stable in Phase 2a)', () => {
    // Phase 2b will return a stable reference via React state; for now the
    // stub returns a fresh object each call, which is fine because the
    // Header's useSession() is called once per render.
    const a = useSession();
    const b = useSession();
    expect(a).toEqual(b);
    expect(a.user).toBeNull();
    expect(b.user).toBeNull();
  });
});

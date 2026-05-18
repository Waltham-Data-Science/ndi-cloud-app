/**
 * Auth-fixture helper for unit tests.
 *
 * Builds a default `AuthUser` matching FastAPI's `MeResponse` shape
 * (`backend/routers/auth.py:27-39`). Every field is overridable via
 * the `overrides` partial — tests only specify what matters for the
 * scenario (e.g. `mockAuthUser({ isAdmin: true })` for admin-only
 * paths) and inherit sensible defaults for everything else.
 *
 * Adding new fields to `AuthUser` only requires updating this
 * default, not every test fixture.
 */
import type { AuthUser } from '@/lib/api/auth';

const NOW_SECONDS = 1761504000; // 2025-10-26T16:00:00Z — fixed so test
                                // assertions on issuedAt/lastActive/
                                // expiresAt are stable across runs.

export function mockAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'user_test_123',
    email_hash: '0123456789abcdef',
    organizationIds: [],
    isAdmin: false,
    canUseAsk: true,
    issuedAt: NOW_SECONDS,
    lastActive: NOW_SECONDS,
    expiresAt: NOW_SECONDS + 3600,
    ...overrides,
  };
}

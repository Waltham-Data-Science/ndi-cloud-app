/**
 * Tests for the Phase 2b useSession() hook (real cookie-flow
 * implementation backed by TanStack Query).
 *
 * The hook reads /api/auth/me through apiFetch, returning:
 *   - { user: AuthUser, isLoading: false } on a successful read
 *   - { user: null,     isLoading: false } when /me returns 401
 *     (legitimate logged-out state — not an error)
 *   - { user: null,     isLoading: true  } during the in-flight read
 *
 * These tests render the hook through a fresh QueryClientProvider
 * each time so the cache state doesn't leak across cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useSession } from '@/lib/auth/use-session';
import { ApiError } from '@/lib/api/client';
import { mockAuthUser } from '@/tests/fixtures/auth';

vi.mock('@/lib/api/auth', () => ({
  me: vi.fn(),
}));

import { me as meMock } from '@/lib/api/auth';
const mockedMe = vi.mocked(meMock);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestQueryProvider;
}

describe('useSession (Phase 2b)', () => {
  beforeEach(() => {
    mockedMe.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns an authenticated user when /api/auth/me succeeds', async () => {
    const fixture = mockAuthUser();
    mockedMe.mockResolvedValue(fixture);
    const { result } = renderHook(() => useSession(), { wrapper: withClient() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toEqual(fixture);
    expect(result.current.error).toBeNull();
  });

  it('returns user: null when /api/auth/me resolves to null (401 logged-out state)', async () => {
    mockedMe.mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper: withClient() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('surfaces non-401 errors via the error field', async () => {
    mockedMe.mockRejectedValue(new ApiError(500, { code: 'server_error' }));
    const { result } = renderHook(() => useSession(), { wrapper: withClient() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('starts in isLoading: true before the first /me read resolves', () => {
    // Pending promise — never resolves; we're just checking the initial state.
    mockedMe.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSession(), { wrapper: withClient() });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
  });
});

/**
 * Header + useSession integration test (replaces the Phase 2a `it.todo`
 * reminder).
 *
 * The other Header tests (Header.test.tsx) mock `useSession` directly
 * to exercise the JSX branches. This file tests the FULL chain:
 *   - real `useSession()` hook (not mocked)
 *   - real `me()` from `lib/api/auth`
 *   - real `apiFetch()` from `lib/api/client`
 *   - mocked `global.fetch` returning a synthetic /api/auth/me payload
 *   - real `QueryClientProvider` so the cache-resolution path runs
 *
 * Verifies that the cookie-flow → useSession() → Header auth-aware
 * UI handoff works end to end at the unit-test level. Phase 6
 * verification adds a Playwright e2e spec hitting a real preview
 * deploy with a real session cookie; this is the unit-level guard
 * that catches regressions in the cache-handoff before they reach
 * staging.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { Header } from '@/components/marketing/Header';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

function stubMatchMedia(mobile: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: mobile && query.includes('max-width:900px'),
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  });
}

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestQueryProvider;
}

describe('Header + useSession integration', () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "My Account" after /api/auth/me resolves with a user', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'u-1',
          email: 'audri@walthamdatascience.com',
          name: 'Audri B',
          emailVerified: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const Wrapper = withClient();
    render(
      <Wrapper>
        <Header />
      </Wrapper>,
    );

    // Anonymous CTAs render synchronously while /me is in flight.
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();

    // Once /me resolves, Header re-renders with the authenticated UI.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^my account$/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /log in/i })).toBeNull();

    // Verify the network call shape — apiFetch must send credentials
    // for the cookie auth, not omit them.
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('shows "Log in" + "Create Free Account" when /api/auth/me returns 401', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const Wrapper = withClient();
    render(
      <Wrapper>
        <Header />
      </Wrapper>,
    );

    // After /me resolves to null, Header settles into the anonymous
    // CTA state (which is also the initial render — assert it's
    // *still* there and didn't flip to "My Account" mid-flight).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create free account/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^my account$/i })).toBeNull();
  });

  it('does not retry /api/auth/me on 401 (legitimate logged-out state, not a transient error)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const Wrapper = withClient();
    render(
      <Wrapper>
        <Header />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    });

    // /me should fire exactly once. A retry loop would mean the cookie
    // domain or apiFetch is fighting with TanStack's retry policy —
    // that's a bug worth catching at this layer.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

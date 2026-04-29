/**
 * `useTutorialAvailability` — HEAD-probe hook contract.
 *
 * The hook fires two parallel HEAD requests against
 * `ndi-cloud-tutorials.s3.us-east-2.amazonaws.com` (one per language)
 * and reports which (if any) tutorial source files exist. These tests
 * pin:
 *
 *   - The exact URL pattern (`tutorial_<id>.mlx`, `tutorial_<id>.ipynb`)
 *     so a future filename-scheme drift surfaces in CI.
 *   - The HEAD method + `mode: 'cors'` so a refactor doesn't
 *     accidentally degrade to GET (which would download the file body).
 *   - The result aggregation: `hasMatlab`, `hasPython`, `hasAny` flip
 *     correctly across the four 200/200, 200/404, 404/200, 404/404
 *     permutations.
 *   - The error path: a thrown fetch (network down) collapses to
 *     unavailable rather than retrying or surfacing an error state.
 *
 * The hook is mounted via `renderHook` inside a fresh QueryClient per
 * test so cache state doesn't bleed between cases.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useTutorialAvailability } from '@/lib/data/tutorials';

const BUCKET = 'https://ndi-cloud-tutorials.s3.us-east-2.amazonaws.com';

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

/**
 * Build a stub `fetch` that returns 200 or 404 based on whether the
 * URL ends in `.mlx` or `.ipynb`. The two arguments map 1:1 to the
 * two probes the hook fires.
 */
function stubFetch(matlabOk: boolean, pythonOk: boolean) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    // Pin: HEAD + cors-mode. If a refactor accidentally sends GET we
    // want the test to scream.
    expect(init?.method).toBe('HEAD');
    expect(init?.mode).toBe('cors');
    if (urlStr.endsWith('.mlx')) {
      return new Response(null, { status: matlabOk ? 200 : 404 });
    }
    if (urlStr.endsWith('.ipynb')) {
      return new Response(null, { status: pythonOk ? 200 : 404 });
    }
    return new Response(null, { status: 404 });
  });
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('useTutorialAvailability — HEAD-probe contract', () => {
  it('hits both URL patterns: tutorial_<id>.mlx and tutorial_<id>.ipynb', async () => {
    const fetchSpy = stubFetch(true, true);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    renderHook(() => useTutorialAvailability('abc123'), {
      wrapper: withClient(),
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const urls = fetchSpy.mock.calls.map((c) =>
      typeof c[0] === 'string' ? c[0] : c[0]!.toString(),
    );
    expect(urls).toContain(`${BUCKET}/tutorial_abc123.mlx`);
    expect(urls).toContain(`${BUCKET}/tutorial_abc123.ipynb`);
  });

  it('both 200 → hasMatlab + hasPython + hasAny all true', async () => {
    globalThis.fetch = stubFetch(true, true) as unknown as typeof fetch;
    const { result } = renderHook(
      () => useTutorialAvailability('mat-and-py'),
      { wrapper: withClient() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      hasMatlab: true,
      hasPython: true,
      hasAny: true,
    });
  });

  it('only MATLAB exists → hasMatlab true, hasPython false, hasAny true', async () => {
    globalThis.fetch = stubFetch(true, false) as unknown as typeof fetch;
    const { result } = renderHook(
      () => useTutorialAvailability('only-matlab'),
      { wrapper: withClient() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      hasMatlab: true,
      hasPython: false,
      hasAny: true,
    });
  });

  it('only Python exists → hasMatlab false, hasPython true, hasAny true', async () => {
    globalThis.fetch = stubFetch(false, true) as unknown as typeof fetch;
    const { result } = renderHook(
      () => useTutorialAvailability('only-python'),
      { wrapper: withClient() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      hasMatlab: false,
      hasPython: true,
      hasAny: true,
    });
  });

  it('neither exists → hasAny false (Tutorials tab gate hides the tab)', async () => {
    globalThis.fetch = stubFetch(false, false) as unknown as typeof fetch;
    const { result } = renderHook(
      () => useTutorialAvailability('nothing'),
      { wrapper: withClient() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      hasMatlab: false,
      hasPython: false,
      hasAny: false,
    });
  });

  it('thrown fetch (network error) collapses to unavailable for that language, no exception surfaced', async () => {
    // MATLAB throws (simulate offline / CORS hiccup); Python returns 200.
    // Per the probe contract, the throwing one resolves to `false`,
    // not propagated as a hook error.
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.endsWith('.mlx')) {
        throw new TypeError('NetworkError when attempting to fetch resource');
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(
      () => useTutorialAvailability('half-broken'),
      { wrapper: withClient() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      hasMatlab: false,
      hasPython: true,
      hasAny: true,
    });
    // No surfaced error — the hook is never in error state.
    expect(result.current.error).toBeNull();
  });

  it('disabled when datasetId is null/undefined (no fetch fires)', () => {
    const fetchSpy = stubFetch(true, true);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    renderHook(() => useTutorialAvailability(null), { wrapper: withClient() });
    renderHook(() => useTutorialAvailability(undefined), {
      wrapper: withClient(),
    });
    // Hook init renders synchronously; with `enabled: false` no probe
    // fires.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * useDocument — top-level `className` normalization.
 *
 * Pinned behavior (2026-05-19 video-playback fix):
 *   - Railway's per-doc detail endpoint returns
 *     `{ id, data: { document_class: { class_name }, ... } }` —
 *     class is buried inside `data`, NOT at the top level of the
 *     payload despite `DocumentSummary.className` being declared
 *     top-level.
 *   - `useDocument` MUST hoist `data.document_class.class_name` to
 *     the top-level `className` via a TanStack Query `select` so
 *     downstream consumers (VideoPlaybackPanel, DataPanel,
 *     the imageStack viewer routing) see the class without each
 *     having to dig through `data.document_class.class_name`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (url: string) => apiFetchMock(url),
  ApiError: class extends Error {},
}));

import { useDocument } from '@/lib/api/documents';

function wrap(_unused?: (qc: QueryClient) => ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children: c }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{c}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryClientWrapper';
  return Wrapper;
}

beforeEach(() => apiFetchMock.mockReset());
afterEach(() => vi.useRealTimers());

describe('useDocument className normalization', () => {
  it('hoists data.document_class.class_name into top-level className', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'doc-1',
      data: {
        document_class: { class_name: 'imageStack' },
        imageStack: { formatOntology: 'NCIT:C190180' },
      },
    });
    const { result } = renderHook(() => useDocument('ds1', 'doc-1'), {
      wrapper: wrap(() => null),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.className).toBe('imageStack');
    // Original data preserved
    expect((result.current.data?.data as { document_class?: { class_name?: string } })?.document_class?.class_name).toBe('imageStack');
  });

  it('preserves an existing top-level className without overwriting', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'doc-2',
      className: 'fromTopLevel',
      data: { document_class: { class_name: 'fromNested' } },
    });
    const { result } = renderHook(() => useDocument('ds1', 'doc-2'), {
      wrapper: wrap(() => null),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.className).toBe('fromTopLevel');
  });

  it('leaves the doc untouched when no class_name is present anywhere', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'doc-3',
      data: { base: { name: 'whatever' } },
    });
    const { result } = renderHook(() => useDocument('ds1', 'doc-3'), {
      wrapper: wrap(() => null),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.className).toBeUndefined();
  });

  it('handles empty/missing class_name gracefully (no falsy hoisting)', async () => {
    apiFetchMock.mockResolvedValue({
      id: 'doc-4',
      data: { document_class: { class_name: '' } },
    });
    const { result } = renderHook(() => useDocument('ds1', 'doc-4'), {
      wrapper: wrap(() => null),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.className).toBeUndefined();
  });
});

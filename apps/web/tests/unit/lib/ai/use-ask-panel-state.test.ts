/**
 * useAskPanelState — URL-state hook for the Ask panel.
 *
 * Phase D of the workspace redesign (2026-05-16). The hook is the
 * single source of truth for the panel's open/mode state, persisted
 * in the URL as `?ask=drawer|sidebar|fullscreen`. Tests exercise:
 *
 *   - open/close roundtrips through the URL
 *   - expand cycles drawer → sidebar → fullscreen and stops at the
 *     maximum (no wrap-around)
 *   - contract cycles fullscreen → sidebar → drawer and stops at
 *     the minimum
 *   - setMode jumps to any valid mode
 *   - invalid `?ask` values are treated as closed
 *   - unrelated query params (e.g. ?strain=PR811) are preserved
 *     through every mutation
 *
 * The Next.js navigation hooks are stubbed at the module level:
 *   - `useRouter().replace` captures the URL the hook wants to set
 *   - `useSearchParams()` returns a `URLSearchParams` we mutate
 *   - `usePathname()` returns a fixed workspace path
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const replaceMock = vi.fn();
let searchParamsStub: URLSearchParams = new URLSearchParams();
let pathnameStub: string = '/my/workspace/ds-test/overview';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsStub,
  usePathname: () => pathnameStub,
}));

import { useAskPanelState } from '@/lib/ai/use-ask-panel-state';

function setAskParam(value: string | null) {
  const p = new URLSearchParams(searchParamsStub.toString());
  if (value === null) {
    p.delete('ask');
  } else {
    p.set('ask', value);
  }
  searchParamsStub = p;
}

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsStub = new URLSearchParams();
  pathnameStub = '/my/workspace/ds-test/overview';
});

afterEach(() => {
  searchParamsStub = new URLSearchParams();
});

describe('useAskPanelState — initial state', () => {
  it('reports closed when ?ask is absent', () => {
    const { result } = renderHook(() => useAskPanelState());
    expect(result.current.open).toBe(false);
    expect(result.current.mode).toBe('drawer'); // default when closed
  });

  it('reports open+drawer when ?ask=drawer', () => {
    setAskParam('drawer');
    const { result } = renderHook(() => useAskPanelState());
    expect(result.current.open).toBe(true);
    expect(result.current.mode).toBe('drawer');
  });

  it('reports open+sidebar when ?ask=sidebar', () => {
    setAskParam('sidebar');
    const { result } = renderHook(() => useAskPanelState());
    expect(result.current.open).toBe(true);
    expect(result.current.mode).toBe('sidebar');
  });

  it('reports open+fullscreen when ?ask=fullscreen', () => {
    setAskParam('fullscreen');
    const { result } = renderHook(() => useAskPanelState());
    expect(result.current.open).toBe(true);
    expect(result.current.mode).toBe('fullscreen');
  });

  it('treats an invalid ?ask value as closed', () => {
    setAskParam('bogus');
    const { result } = renderHook(() => useAskPanelState());
    expect(result.current.open).toBe(false);
    expect(result.current.mode).toBe('drawer'); // safe default
  });
});

describe('useAskPanelState — openPanel', () => {
  it('adds ?ask=drawer to the URL when the panel is closed', () => {
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.openPanel();
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock.mock.calls[0]![0]).toContain('ask=drawer');
  });

  it('is a no-op when the panel is already open', () => {
    setAskParam('sidebar');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.openPanel();
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('useAskPanelState — close', () => {
  it('removes ?ask from the URL', () => {
    setAskParam('drawer');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.close();
    });
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain('ask=');
  });
});

describe('useAskPanelState — expand cycle', () => {
  it('cycles drawer → sidebar', () => {
    setAskParam('drawer');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.expand();
    });
    expect(replaceMock.mock.calls[0]![0]).toContain('ask=sidebar');
  });

  it('cycles sidebar → fullscreen', () => {
    setAskParam('sidebar');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.expand();
    });
    expect(replaceMock.mock.calls[0]![0]).toContain('ask=fullscreen');
  });

  it('is a no-op at fullscreen (no wrap-around)', () => {
    setAskParam('fullscreen');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.expand();
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('useAskPanelState — contract cycle', () => {
  it('cycles fullscreen → sidebar', () => {
    setAskParam('fullscreen');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.contract();
    });
    expect(replaceMock.mock.calls[0]![0]).toContain('ask=sidebar');
  });

  it('cycles sidebar → drawer', () => {
    setAskParam('sidebar');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.contract();
    });
    expect(replaceMock.mock.calls[0]![0]).toContain('ask=drawer');
  });

  it('is a no-op at drawer (no wrap-around, avoids accidental close)', () => {
    setAskParam('drawer');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.contract();
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe('useAskPanelState — setMode', () => {
  it('jumps to the specified mode regardless of current mode', () => {
    setAskParam('drawer');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.setMode('fullscreen');
    });
    expect(replaceMock.mock.calls[0]![0]).toContain('ask=fullscreen');
  });
});

describe('useAskPanelState — preserves unrelated query params', () => {
  it('keeps ?strain=PR811 when opening the panel', () => {
    searchParamsStub = new URLSearchParams('strain=PR811&select=NSUBJ-005');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.openPanel();
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('strain=PR811');
    expect(url).toContain('select=NSUBJ-005');
    expect(url).toContain('ask=drawer');
  });

  it('keeps other params when closing the panel', () => {
    searchParamsStub = new URLSearchParams('ask=drawer&strain=PR811');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.close();
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('strain=PR811');
    expect(url).not.toContain('ask=');
  });

  it('keeps other params when expanding the panel', () => {
    searchParamsStub = new URLSearchParams('ask=drawer&strain=PR811');
    const { result } = renderHook(() => useAskPanelState());
    act(() => {
      result.current.expand();
    });
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain('strain=PR811');
    expect(url).toContain('ask=sidebar');
  });
});

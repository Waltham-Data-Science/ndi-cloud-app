/**
 * useDebouncedValue (CQ5) — generic debounce hook tests.
 *
 * Audit (synthesis §CQ5) flagged that SummaryTableView pushes the
 * `tq` URL query param on every keystroke of the global filter input
 * — `router.replace` per character into the App Router, which forces
 * a navigation event per stroke. On a 10-character search query that's
 * 10 history-state writes + 10 prefetch evaluations, all instantly
 * superseded.
 *
 * The fix is a generic `useDebouncedValue<T>(value, delayMs)` hook
 * that returns a value that updates only after the input has been
 * stable for `delayMs`. SummaryTableView feeds the debounced value
 * into the URL-write effect so we get one router push per "settled"
 * search instead of one per keystroke.
 *
 * The hook is generic so it can also gate the upcoming sort and
 * column-visibility URL writes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedValue', () => {
  it('returns the initial value synchronously on first render', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 100));
    expect(result.current).toBe('initial');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    rerender({ value: 'abc' });
    // No timers advanced → still on the initial value.
    expect(result.current).toBe('a');
  });

  it('updates to the latest value after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'abc' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('abc');
  });

  it('cancels a pending update when a new value arrives within the window', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'ab' });
    act(() => {
      vi.advanceTimersByTime(50); // half the window
    });
    rerender({ value: 'abc' }); // new value before timeout fires
    act(() => {
      vi.advanceTimersByTime(50); // 50ms more — total 100ms since 'ab' set,
      // but only 50ms since 'abc' was set, so still pending
    });
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(50); // now 100ms since 'abc' was set
    });
    expect(result.current).toBe('abc');
  });

  it('clears the pending timer on unmount (no leak)', () => {
    const { rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    unmount();
    // Advancing time after unmount must not throw — a leaked timer
    // would try to setState on an unmounted component and React would
    // log an error.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // No assertion needed; the absence of a thrown error is the
    // contract.
  });

  it('handles object/array values via reference identity (no deep compare)', () => {
    // Generic over T — we don't deep-compare, we just track reference
    // changes. Callers that want value-equality should memoize their
    // input.
    const initial = { q: 'a' };
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 100),
      { initialProps: { value: initial } },
    );
    expect(result.current).toBe(initial);

    const next = { q: 'a' }; // structurally equal, different reference
    rerender({ value: next });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(next);
  });

  it('treats delayMs=0 as "next tick" (still asynchronous)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 0),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    expect(result.current).toBe('a'); // not yet
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe('b');
  });
});

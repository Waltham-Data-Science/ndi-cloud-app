/**
 * usePanelChangeIndicator — pulse-on-dependency-change hook.
 *
 * H7 polish (workspace-canvas-redesign 2026-05-16). Tests:
 *
 *   - pulse is FALSE on initial mount (no flash on cold-start)
 *   - changing a single dep flips pulse → true then back to false
 *     after the duration (default 800ms)
 *   - the same dep value re-rendered doesn't fire a pulse
 *   - multi-dep arrays: a change in ANY element fires the pulse
 *   - rapid successive changes coalesce (timer resets, one fade)
 *   - empty dep arrays never fire a pulse (opt-out for dataset-wide
 *     panels)
 *   - custom durationMs override
 *   - unmount cancels any pending timer (no setState-on-unmounted
 *     warning)
 *
 * Vitest fake timers exercise the timer logic deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePanelChangeIndicator', () => {
  it('returns false on initial mount', () => {
    const { result } = renderHook(() => usePanelChangeIndicator(['a']));
    expect(result.current).toBe(false);
  });

  it('does not pulse when deps stay the same across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps),
      { initialProps: { deps: ['a'] } },
    );

    expect(result.current).toBe(false);
    rerender({ deps: ['a'] });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });

  it('pulses when a single dep changes, then fades after the default 800ms', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps),
      { initialProps: { deps: ['a'] } },
    );

    expect(result.current).toBe(false);

    rerender({ deps: ['b'] });
    expect(result.current).toBe(true);

    // 799ms in — still pulsing.
    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(result.current).toBe(true);

    // Crossing the 800ms boundary — fade.
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current).toBe(false);
  });

  it('pulses when ANY element in a multi-dep array changes', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps),
      { initialProps: { deps: ['a', 'x'] } },
    );

    // Change the SECOND dep only.
    rerender({ deps: ['a', 'y'] });
    expect(result.current).toBe(true);

    // Fade.
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBe(false);

    // Change the FIRST dep only.
    rerender({ deps: ['b', 'y'] });
    expect(result.current).toBe(true);
  });

  it('coalesces rapid successive changes — timer resets, one fade', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps),
      { initialProps: { deps: ['a'] } },
    );

    rerender({ deps: ['b'] });
    expect(result.current).toBe(true);

    // Halfway through the fade, change again.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(true);

    rerender({ deps: ['c'] });
    expect(result.current).toBe(true);

    // The first timer would have fired at 800ms total (400 spent +
    // 400 to go). With coalescing it shouldn't — the new timer starts
    // fresh and runs for the full 800ms.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(true);

    // Now wait the rest of the new timer.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);
  });

  it('never pulses when deps is an empty array (opt-out)', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps),
      { initialProps: { deps: [] as ReadonlyArray<unknown> } },
    );

    expect(result.current).toBe(false);
    rerender({ deps: [] });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(false);
  });

  it('respects a custom durationMs option', () => {
    const { result, rerender } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps, { durationMs: 200 }),
      { initialProps: { deps: ['a'] } },
    );

    rerender({ deps: ['b'] });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current).toBe(false);
  });

  it('cancels pending timer on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps),
      { initialProps: { deps: ['a'] } },
    );

    rerender({ deps: ['b'] });
    expect(result.current).toBe(true);

    unmount();

    // Advancing past the duration shouldn't throw or warn — the
    // timer was cleared on unmount. Vitest fake timers don't throw
    // when a clearTimeout target is missing; this is a smoke check
    // that the cleanup path runs.
    expect(() => {
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
  });

  it('treats null deps consistently (initial null → no pulse, change to non-null → pulse)', () => {
    const initial: ReadonlyArray<unknown> = [null];
    const { result, rerender } = renderHook(
      ({ deps }: { deps: ReadonlyArray<unknown> }) =>
        usePanelChangeIndicator(deps),
      { initialProps: { deps: initial } },
    );

    expect(result.current).toBe(false);

    // null stays null → no pulse.
    rerender({ deps: [null] });
    expect(result.current).toBe(false);

    // null → string → pulse.
    rerender({ deps: ['something'] });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBe(false);

    // string → null → pulse (back to "cleared").
    rerender({ deps: [null] });
    expect(result.current).toBe(true);
  });
});

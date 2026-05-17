/**
 * useTableMultiSelect — ephemeral multi-row selection state.
 *
 * Phase G2 tests:
 *   - empty initial state
 *   - toggle: add / remove
 *   - toggleRange: Shift+click semantics (anchor → current, inclusive,
 *     forward + backward, additive — never toggles off range members)
 *   - selectAll: replaces selection wholesale
 *   - clear: empties
 *   - count + isSelected reflect state
 *
 * The hook is local state; tests use `renderHook` + `act`.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useTableMultiSelect } from '@/lib/workspace/use-table-multi-select';

describe('useTableMultiSelect — initial state', () => {
  it('starts with an empty selection', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    expect(result.current.count).toBe(0);
    expect(result.current.selected.size).toBe(0);
    expect(result.current.isSelected('any')).toBe(false);
  });
});

describe('useTableMultiSelect — toggle', () => {
  it('adds an id on first toggle', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a');
    });
    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it('removes an id on second toggle of the same value', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.toggle('a');
    });
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('accumulates multiple distinct toggles', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a');
      result.current.toggle('b');
      result.current.toggle('c');
    });
    expect(result.current.count).toBe(3);
    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.isSelected('c')).toBe(true);
  });
});

describe('useTableMultiSelect — toggleRange (Shift+click)', () => {
  const ORDERED = ['a', 'b', 'c', 'd', 'e'] as const;

  it('falls back to single toggle when no anchor is set', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggleRange('c', ORDERED);
    });
    expect(result.current.isSelected('c')).toBe(true);
    expect(result.current.count).toBe(1);
  });

  it('selects the inclusive range from anchor → current (forward)', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('b'); // anchor = b
    });
    act(() => {
      result.current.toggleRange('d', ORDERED);
    });
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.isSelected('c')).toBe(true);
    expect(result.current.isSelected('d')).toBe(true);
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.isSelected('e')).toBe(false);
  });

  it('selects the inclusive range from anchor → current (backward)', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('d'); // anchor = d
    });
    act(() => {
      result.current.toggleRange('b', ORDERED);
    });
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.isSelected('c')).toBe(true);
    expect(result.current.isSelected('d')).toBe(true);
  });

  it('is ADDITIVE — does not toggle off existing range members', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('c'); // anchor = c, c selected
    });
    act(() => {
      result.current.toggleRange('a', ORDERED);
    });
    // c stays selected after the range adds a..c
    expect(result.current.isSelected('c')).toBe(true);
    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.isSelected('b')).toBe(true);
  });

  it('moves the anchor to the range endpoint for chained shift-clicks', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a'); // anchor = a
    });
    act(() => {
      result.current.toggleRange('c', ORDERED); // selects a,b,c; anchor → c
    });
    act(() => {
      result.current.toggleRange('e', ORDERED); // selects c,d,e (additive)
    });
    expect(result.current.count).toBe(5);
  });
});

describe('useTableMultiSelect — selectAll', () => {
  it('replaces selection with given ids', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('x'); // x selected
    });
    act(() => {
      result.current.selectAll(['a', 'b', 'c']);
    });
    expect(result.current.count).toBe(3);
    expect(result.current.isSelected('x')).toBe(false);
    expect(result.current.isSelected('a')).toBe(true);
  });

  it('selectAll with empty array clears', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.selectAll([]);
    });
    expect(result.current.count).toBe(0);
  });
});

describe('useTableMultiSelect — clear', () => {
  it('empties the selection', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a');
      result.current.toggle('b');
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.count).toBe(0);
  });

  it('resets the range anchor (next toggleRange acts as fallback)', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.clear();
    });
    act(() => {
      // No anchor anymore — toggleRange falls back to single toggle.
      result.current.toggleRange('c', ['a', 'b', 'c']);
    });
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected('c')).toBe(true);
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.isSelected('b')).toBe(false);
  });
});

describe('useTableMultiSelect — derived values', () => {
  it('count tracks selected.size exactly', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    act(() => {
      result.current.toggle('a');
      result.current.toggle('b');
    });
    expect(result.current.count).toBe(result.current.selected.size);
  });

  it('isSelected returns false for any unknown id', () => {
    const { result } = renderHook(() => useTableMultiSelect());
    expect(result.current.isSelected('non-existent')).toBe(false);
  });
});

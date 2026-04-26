'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a value that updates only after `delayMs` of stability.
 *
 * Used to gate per-keystroke side effects (e.g. URL pushes) so that
 * fast typing collapses into a single trailing update once the user
 * pauses. Generic over `T` — works for strings, objects, arrays.
 *
 * On unmount, the pending timer is cleared so a stale `setState`
 * doesn't fire against a torn-down component.
 *
 * Reference identity is the comparison key — callers that want
 * value-equality should memoize their input (`useMemo`).
 *
 * Origin: CQ5. The audit (synthesis §CQ5) flagged
 * `SummaryTableView.tsx:271-273` writing `tq` into the URL on every
 * keystroke of the global filter. With `useDebouncedValue` the URL
 * is rewritten once per "settled" search instead of per stroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

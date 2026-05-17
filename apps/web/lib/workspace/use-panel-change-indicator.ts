'use client';

/**
 * usePanelChangeIndicator — pulse-on-input-change hook for workspace
 * analysis panels.
 *
 * H7 polish (workspace-canvas-redesign 2026-05-16). The selection-bar
 * driven auto-fill + auto-run loop means analysis cards silently
 * re-fetch when the user changes which subject / session / probe /
 * stimulus / unit is selected — the form fields update without any
 * visible "this card just changed" cue. This hook gives each panel a
 * short-lived `pulse` boolean that the PanelCard chrome can hang a
 * fading ring effect off, so the change is acknowledged visually
 * without being jarring.
 *
 * Contract:
 *   - Pass the array of selection-dependency values the panel cares
 *     about (e.g. `[selection.session]` for SignalViewer).
 *   - On the INITIAL mount, `pulse` is false — we don't want a flash on
 *     cold-start render.
 *   - On any subsequent change to any element of `deps`, `pulse` flips
 *     to true for ~800ms, then back to false.
 *   - Rapid successive changes are coalesced: the timer resets each
 *     time, so the pulse stays lit through a cascade and only fades
 *     once the dependency settles.
 *   - Pass an empty array to disable the pulse entirely (some panels
 *     are dataset-wide and have no selection deps — they don't pulse).
 *
 * Implementation notes:
 *   - The "initial mount" guard uses a ref rather than comparing deps
 *     to a sentinel value — JSON.stringify on heterogeneous arrays is
 *     brittle. The ref pattern is the same one usePrevious uses.
 *   - Comparison uses Object.is over each dep, mirroring React's own
 *     reconciliation semantics. Two `null`s are equal; two new object
 *     references are not.
 */
import { useEffect, useRef, useState } from 'react';

/**
 * Default pulse duration in milliseconds. 800ms is long enough to be
 * read as a deliberate visual cue (vs. a flicker), short enough not
 * to linger past the next likely interaction.
 */
const DEFAULT_DURATION_MS = 800;

export interface UsePanelChangeIndicatorOptions {
  /** Override the pulse duration. Defaults to 800ms. */
  durationMs?: number;
}

export function usePanelChangeIndicator(
  deps: ReadonlyArray<unknown>,
  options: UsePanelChangeIndicatorOptions = {},
): boolean {
  const { durationMs = DEFAULT_DURATION_MS } = options;
  const [pulse, setPulse] = useState(false);

  // Cache the previous deps array to compare against. On the very
  // first effect run, prevDepsRef.current is undefined → we skip the
  // pulse so cold-start doesn't flash. Subsequent runs do a shallow
  // element-by-element compare (Object.is) — same semantics React
  // uses for hook dep arrays.
  const prevDepsRef = useRef<ReadonlyArray<unknown> | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevDepsRef.current;
    prevDepsRef.current = deps;

    // Initial mount — record the deps but don't pulse.
    if (prev === undefined) {
      return;
    }

    // Empty-deps panels are explicitly opted out of pulsing.
    if (deps.length === 0) {
      return;
    }

    // Compare element-by-element. Length should match because the
    // caller passes the same array shape each render; defensive
    // length-mismatch falls through to "treat as changed."
    let changed = prev.length !== deps.length;
    if (!changed) {
      for (let i = 0; i < deps.length; i++) {
        if (!Object.is(prev[i], deps[i])) {
          changed = true;
          break;
        }
      }
    }

    if (!changed) return;

    // Restart any in-flight timer — coalesces rapid successive
    // changes into one fade so the ring doesn't flicker.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setPulse(true);
    timerRef.current = setTimeout(() => {
      setPulse(false);
      timerRef.current = null;
    }, durationMs);

    // The cleanup below covers unmount; the timer itself is shared
    // across re-runs so we deliberately DON'T clear it here.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the input array itself
  }, [...deps, durationMs]);

  // Unmount cleanup — flush any pending timer so we don't try to set
  // state on a torn-down component.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return pulse;
}

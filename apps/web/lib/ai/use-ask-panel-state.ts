'use client';

/**
 * useAskPanelState — URL-state hook for the workspace Ask panel.
 *
 * Phase D of the workspace redesign (2026-05-16). Single source of
 * truth: `?ask=drawer|sidebar|fullscreen` in the URL. Absent or
 * unrecognized values → panel is closed.
 *
 * Uses `router.replace` (not push) so toggling the panel doesn't spam
 * the browser history stack. The `useSearchParams()` read is purely
 * reactive — the component re-renders whenever the URL changes, giving
 * us free deep-link and refresh support.
 *
 * Cycle direction (non-wrapping by design — matches the design doc):
 *   expand:   drawer → sidebar → fullscreen (stops at fullscreen)
 *   contract: fullscreen → sidebar → drawer (stops at drawer)
 *
 * The three-step linear cycle makes the panel mode predictable. The
 * user always knows: keep pressing expand to get bigger, contract to
 * get smaller, close to dismiss. Wrapping would mean expand from
 * fullscreen teleports them to drawer — confusing.
 */
import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export type AskPanelMode = 'drawer' | 'sidebar' | 'fullscreen';

const VALID_MODES: ReadonlySet<string> = new Set<AskPanelMode>([
  'drawer',
  'sidebar',
  'fullscreen',
]);

const MODE_ORDER: readonly AskPanelMode[] = ['drawer', 'sidebar', 'fullscreen'];

function isValidMode(v: string | null): v is AskPanelMode {
  return v !== null && VALID_MODES.has(v);
}

export interface AskPanelState {
  open: boolean;
  mode: AskPanelMode;
  /** Opens in drawer mode. No-op if already open. */
  openPanel: () => void;
  /** Cycles drawer → sidebar → fullscreen. Stops at fullscreen. */
  expand: () => void;
  /** Cycles fullscreen → sidebar → drawer. Stops at drawer. */
  contract: () => void;
  /** Removes `?ask` from the URL, closing the panel. */
  close: () => void;
  /** Jumps to a specific mode. */
  setMode: (mode: AskPanelMode) => void;
}

export function useAskPanelState(): AskPanelState {
  const router = useRouter();
  const pathname = usePathname() ?? '/my';
  const searchParams = useSearchParams();

  const rawAsk = searchParams?.get('ask') ?? null;
  const mode: AskPanelMode = isValidMode(rawAsk) ? rawAsk : 'drawer';
  const open = isValidMode(rawAsk);

  // Build a URL with `?ask=<mode>` preserved alongside any other params
  // (e.g. ?strain=PR811&select=NSUBJ-005 must survive the panel toggle).
  const buildUrl = useCallback(
    (newMode: AskPanelMode | null): string => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (newMode === null) {
        params.delete('ask');
      } else {
        params.set('ask', newMode);
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  const openPanel = useCallback(() => {
    if (open) return;
    router.replace(buildUrl('drawer'));
  }, [open, router, buildUrl]);

  const expand = useCallback(() => {
    const currentIdx = MODE_ORDER.indexOf(mode);
    const nextIdx = Math.min(currentIdx + 1, MODE_ORDER.length - 1);
    const nextMode = MODE_ORDER[nextIdx]!;
    // Don't navigate if already at the max.
    if (nextMode === mode && open) return;
    router.replace(buildUrl(nextMode));
  }, [mode, open, router, buildUrl]);

  const contract = useCallback(() => {
    const currentIdx = MODE_ORDER.indexOf(mode);
    const prevIdx = Math.max(currentIdx - 1, 0);
    const prevMode = MODE_ORDER[prevIdx]!;
    // If contracting from the minimum, leave the panel alone — drawer
    // IS the minimum, and accidentally closing mid-conversation is
    // worse than a no-op press of the contract button.
    if (prevMode === mode) return;
    router.replace(buildUrl(prevMode));
  }, [mode, router, buildUrl]);

  const close = useCallback(() => {
    router.replace(buildUrl(null));
  }, [router, buildUrl]);

  const setMode = useCallback(
    (newMode: AskPanelMode) => {
      router.replace(buildUrl(newMode));
    },
    [router, buildUrl],
  );

  return useMemo(
    () => ({ open, mode, openPanel, expand, contract, close, setMode }),
    [open, mode, openPanel, expand, contract, close, setMode],
  );
}

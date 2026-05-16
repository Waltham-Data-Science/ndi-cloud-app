'use client';

/**
 * AskKeyboardShortcuts — global keyboard handler for the workspace
 * Ask panel.
 *
 * Phase D of the workspace redesign. Renders nothing — it is a pure
 * `useEffect` mount that registers and cleans up document-level
 * listeners. Drop it once in the workspace layout tree.
 *
 * Registered shortcuts:
 *   - Cmd+K  / Ctrl+K  → open panel (no-op when already open)
 *   - Cmd+\  / Ctrl+\  → cycle modes forward (drawer → sidebar → fullscreen)
 *   - /                → focus AskHeroQuickInput (handled by that
 *                        component; documented here for completeness)
 *   - Esc              → close panel (AskPanel itself handles this;
 *                        listed here for completeness)
 *
 * Focus guard: all shortcuts skip when the focused element is INPUT,
 * TEXTAREA, SELECT, or contenteditable. This component does NOT
 * register an Esc listener — AskPanel owns that — because a global
 * Esc would also fire when the user is just trying to blur a
 * workspace filter input.
 *
 * Co-existence: the Cmd+K listener here is redundant with
 * AskPanelTrigger's own Cmd+K listener. Both calling `openPanel()`
 * is safe because `openPanel` is a no-op when the panel is already
 * open. We keep both so neither component depends on the other for
 * the shortcut to work.
 */
import { useCallback, useEffect } from 'react';

import { useAskPanelState } from '@/lib/ai/use-ask-panel-state';

export function AskKeyboardShortcuts() {
  const { openPanel, expand } = useAskPanelState();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (isInput) return;

      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K → open. No-op when open; redundant with AskPanelTrigger.
      if (meta && e.key === 'k') {
        e.preventDefault();
        openPanel();
        return;
      }

      // Cmd+\ → cycle modes forward.
      if (meta && e.key === '\\') {
        e.preventDefault();
        expand();
        return;
      }
    },
    [openPanel, expand],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return null;
}

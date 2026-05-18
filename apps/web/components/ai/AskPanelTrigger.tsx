'use client';

/**
 * AskPanelTrigger — floating bottom-right button that opens the Ask
 * panel.
 *
 * Phase D of the workspace redesign. Two responsibilities:
 *   1. Click → `state.openPanel()`.
 *   2. Cmd+K / Ctrl+K → `state.openPanel()`.
 *
 * Hidden when the panel is already open (no double affordance — the
 * panel itself has a close button).
 *
 * Fixed at bottom-right, z-40 (below the panel at z-50, above tab
 * content). 48×48 rounded-full, white surface, brand-blue icon,
 * shadow-lg, hover lift. Keyboard hint "K" surfaces via the `title`
 * attribute on hover.
 *
 * Focus guard: the Cmd+K listener skips when the focused element is
 * an INPUT, TEXTAREA, SELECT, or contenteditable. Inputs handle the
 * shortcut themselves if needed (most don't bind Cmd+K).
 */
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { useAskPanelState } from '@/lib/ai/use-ask-panel-state';

export function AskPanelTrigger() {
  const { open, openPanel } = useAskPanelState();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !isInput) {
        e.preventDefault();
        openPanel();
      }
    },
    [openPanel],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (open) return null;

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open Ask panel (Cmd+K)"
      title="Ask (Cmd+K)"
      className={[
        'fixed bottom-6 right-6 z-40',
        'h-12 w-12 rounded-full',
        'bg-bg-surface text-brand-blue',
        'shadow-lg border border-border-subtle',
        'hover:-translate-y-0.5 hover:shadow-xl hover:border-ndi-teal-border',
        'transition-all duration-(--duration-base) ease-(--ease-out)',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal',
        'inline-flex items-center justify-center',
      ].join(' ')}
    >
      <Sparkles className="h-5 w-5" aria-hidden />
    </button>
  );
}

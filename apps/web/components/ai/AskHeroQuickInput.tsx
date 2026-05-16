'use client';

/**
 * AskHeroQuickInput — compact inline input intended to drop into the
 * workspace hero band.
 *
 * Phase D of the workspace redesign. Two affordances:
 *
 *   1. Pressing `/` from anywhere in the workspace (when no input is
 *      focused) focuses this input. Matches the Linear / Notion
 *      search-bar pattern.
 *   2. Submitting the input opens the Ask panel in drawer mode.
 *
 * Phase D limitation: the "pre-send on open" wiring requires AskShell
 * to accept an `initialInput` / `sendOnMount` mechanism, which in turn
 * needs a shared ephemeral store (Zustand atom or a React context)
 * that AskShell drains on first mount. Implementing that store is
 * deferred to a Phase E follow-up so it doesn't block the Phase D
 * merge. Current behavior: submitting opens the panel — the typed
 * text appears in the panel input field instead of being pre-sent.
 * Still a useful flow; just one extra Enter press.
 *
 * White-on-dark theming so the input reads on top of the depth
 * gradient in the workspace hero. The hint chip on the right shows
 * `/` for the focus shortcut.
 */
import { Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAskPanelState } from '@/lib/ai/use-ask-panel-state';

interface AskHeroQuickInputProps {
  /** Placeholder text. Defaults to "Ask about this dataset…" */
  placeholder?: string;
  className?: string;
}

export function AskHeroQuickInput({
  placeholder = 'Ask about this dataset…',
  className,
}: AskHeroQuickInputProps) {
  const [value, setValue] = useState('');
  const { openPanel } = useAskPanelState();
  const inputRef = useRef<HTMLInputElement>(null);

  // `/` from anywhere in the workspace focuses this input. Focus
  // guard: skip if the user is already typing in an input/textarea
  // (don't steal the "/" key from a filter).
  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable;

    if (e.key === '/' && !isInput && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Open the panel — whether or not the user typed anything. An
    // empty submit still opens the panel (matches Linear's behavior).
    // TODO (Phase E): if value is non-empty, write to a pending-send
    // store and have AskShell drain it on mount.
    openPanel();
    setValue('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={['flex items-center gap-2', className ?? ''].join(' ')}
      role="search"
      aria-label="Quick question for Ask"
    >
      <div className="relative flex items-center flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className={[
            'w-full rounded-lg px-3.5 py-2 text-[13.5px] leading-tight',
            'bg-white/15 border border-white/25 text-white placeholder:text-white/50',
            'focus:outline-none focus:bg-white/20 focus:border-white/40',
            'transition-colors duration-(--duration-base) ease-(--ease-out)',
            'pr-10',
          ].join(' ')}
        />
        <span
          className="absolute right-3 text-[11px] font-mono text-white/35 pointer-events-none select-none"
          aria-hidden
        >
          /
        </span>
      </div>
      <button
        type="submit"
        aria-label="Open Ask"
        className={[
          'shrink-0 rounded-lg px-3 py-2',
          'bg-white/15 border border-white/25 text-white',
          'hover:bg-white/25 hover:border-white/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
          'transition-colors duration-(--duration-base) ease-(--ease-out)',
          'inline-flex items-center gap-1.5 text-[13px] font-medium',
        ].join(' ')}
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
      </button>
    </form>
  );
}

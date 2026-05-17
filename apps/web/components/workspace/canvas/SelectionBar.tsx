'use client';

/**
 * SelectionBar — sticky chip strip at the top of the workspace
 * canvas showing the current selection context across all 5
 * dimensions (subject / session / probe / stimulus / unit).
 *
 * Phase F2 of the one-canvas redesign (2026-05-16 design doc:
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 *
 * Visual model:
 *   - Active chip: brand-blue background, mono short-id, ✕ to clear
 *   - Empty chip: dashed border, "Pick subject" hint, click jumps the
 *     picker rail to that tab and focuses its filter input
 *   - "Clear all" button on the right when anything is set
 *
 * Why short-id (first 8 chars) instead of full 24-char hex on the
 * chip: workspace URLs already carry the full id; the chip is a
 * visual reference, not a place to copy from. If the user needs the
 * full id they pop the "Selection" debug panel from the chip's
 * context (out of scope for v1 — they can read the URL).
 *
 * Sticky positioning: `top-0` with `z-30` (above canvas content,
 * below AskPanel which uses `z-40`). The hero scrolls away, the
 * selection bar stays — always visible while the user is scrolling
 * through the analysis grid.
 */
import { X } from 'lucide-react';
import { useCallback } from 'react';

import { cn } from '@/lib/cn';
import {
  SELECTION_TITLES,
  useWorkspaceSelection,
  type SelectionKey,
  type PickerTab,
} from '@/lib/workspace/use-workspace-selection';

/** Per-selection-key picker tab to jump to when an empty chip is clicked. */
const KEY_TO_PICKER_TAB: Readonly<Record<SelectionKey, PickerTab>> = {
  subject: 'subjects',
  session: 'sessions',
  probe: 'probes',
  stimulus: 'stimuli',
  unit: 'documents', // unit lives under vmspikesummary; user picks from documents tab
};

const KEYS_IN_ORDER: readonly SelectionKey[] = [
  'subject',
  'session',
  'probe',
  'stimulus',
  'unit',
];

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export interface SelectionBarProps {
  className?: string;
}

export function SelectionBar({ className }: SelectionBarProps) {
  const { selection, hasAnySelection, clearOne, clear, setPickerTab } =
    useWorkspaceSelection();

  const handleEmptyChipClick = useCallback(
    (key: SelectionKey) => {
      setPickerTab(KEY_TO_PICKER_TAB[key]);
    },
    [setPickerTab],
  );

  return (
    <div
      role="region"
      aria-label="Workspace selection context"
      className={cn(
        'sticky top-0 z-30',
        'border-b border-border-subtle bg-bg-surface-subtle/95',
        'backdrop-blur-sm',
        className,
      )}
    >
      <div className="mx-auto max-w-[1480px] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted shrink-0">
            Selection
          </span>

          {KEYS_IN_ORDER.map((key) => {
            const value = selection[key];
            const label = SELECTION_TITLES[key];
            if (value) {
              return (
                <SelectionChip
                  key={key}
                  label={label}
                  value={value}
                  onClear={() => clearOne(key)}
                />
              );
            }
            return (
              <EmptyChip
                key={key}
                label={label}
                onPick={() => handleEmptyChipClick(key)}
              />
            );
          })}

          {hasAnySelection && (
            <button
              type="button"
              onClick={clear}
              className={cn(
                'ml-auto text-[12px] text-fg-muted hover:text-fg-primary',
                'transition-colors duration-(--duration-base) ease-(--ease-out)',
                'focus-visible:outline-none focus-visible:underline',
              )}
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface SelectionChipProps {
  label: string;
  value: string;
  onClear: () => void;
}

function SelectionChip({ label, value, onClear }: SelectionChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill',
        'bg-brand-blue/10 text-brand-blue',
        'px-2.5 py-1 text-[12px] font-medium',
        'border border-brand-blue/20',
      )}
      title={`${label}: ${value}`}
    >
      <span className="text-[10px] font-bold tracking-eyebrow uppercase opacity-80">
        {label}
      </span>
      <span className="font-mono text-[11.5px]">{shortId(value)}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label} selection`}
        className={cn(
          'inline-flex items-center justify-center h-4 w-4 rounded-md',
          'text-brand-blue/70 hover:text-brand-blue hover:bg-brand-blue/15',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
          'transition-colors duration-(--duration-base) ease-(--ease-out)',
        )}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

interface EmptyChipProps {
  label: string;
  onPick: () => void;
}

function EmptyChip({ label, onPick }: EmptyChipProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill',
        'bg-transparent text-fg-muted',
        'px-2.5 py-1 text-[12px] font-medium',
        'border border-dashed border-border-subtle',
        'hover:bg-bg-muted hover:text-fg-secondary hover:border-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
      )}
      title={`Pick a ${label.toLowerCase()} from the left rail`}
    >
      <span className="text-[10px] font-bold tracking-eyebrow uppercase">
        {label}
      </span>
      <span className="text-[11.5px] opacity-70">— pick</span>
    </button>
  );
}

'use client';

/**
 * PickerRail — the left rail of the workspace canvas. Holds the
 * picker tabs (Subjects / Sessions / Probes / Stimuli / Documents)
 * and the active picker's table.
 *
 * Phase F2 of the one-canvas redesign. The rail is `~340px` wide on
 * desktop, collapses to a drawer on narrow viewports (Linear-style
 * `[`-key collapse — out of scope for v1, deferred to polish).
 *
 * Sticky positioning: the rail sticks below the selection bar
 * (which is itself sticky `top-0`). On scroll the canvas content
 * scrolls but the picker stays in view, so the user can always
 * pivot context without losing position in the analysis grid.
 *
 * The actual picker bodies (Subjects table, Sessions table, etc.)
 * are passed in as `slots` from the parent — keeping this component
 * dumb about which browser shows up under which tab.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import {
  useWorkspaceSelection,
  type PickerTab,
} from '@/lib/workspace/use-workspace-selection';

import { PickerRailTabs } from './PickerRailTabs';

export interface PickerRailProps {
  /**
   * Slot map keyed by picker tab id. Each slot renders its picker
   * body when its tab is active.
   */
  slots: Readonly<Record<PickerTab, ReactNode>>;
  /**
   * Footer slot — rendered below the picker body. Used for the
   * single "Browse all docs in Document Explorer →" escape link.
   */
  footer?: ReactNode;
  className?: string;
}

export function PickerRail({ slots, footer, className }: PickerRailProps) {
  const { pickerTab } = useWorkspaceSelection();

  return (
    <aside
      aria-label="Workspace picker"
      className={cn(
        // Audit 2026-05-18 (UI sweep): breakpoint dropped lg → md to
        // match WorkspaceCanvas's grid breakpoint. Was stacking on
        // Safari at typical laptop window widths.
        'md:sticky md:top-[3.25rem] md:self-start',
        // Picker rail height is the viewport minus hero+selection bar
        // header. On desktop it occupies the full visible scroll
        // region; below md: it stacks above the canvas.
        'md:h-[calc(100vh-3.25rem)] md:overflow-hidden',
        'flex flex-col bg-bg-surface md:border-r border-border-subtle',
        className,
      )}
    >
      <div className="px-3 pt-2">
        <PickerRailTabs />
      </div>

      <div
        role="tabpanel"
        id={`picker-panel-${pickerTab}`}
        aria-label={`${pickerTab} picker`}
        className="flex-1 min-h-0 overflow-auto px-3 py-3"
      >
        {slots[pickerTab]}
      </div>

      {footer && (
        <div className="shrink-0 border-t border-border-subtle px-3 py-2 bg-bg-canvas">
          {footer}
        </div>
      )}
    </aside>
  );
}

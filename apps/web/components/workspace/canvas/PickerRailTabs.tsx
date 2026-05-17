'use client';

/**
 * PickerRailTabs — the sub-tab nav inside the left rail of the
 * workspace canvas. Switches between Subjects / Sessions / Probes /
 * Stimuli / Documents picker tables.
 *
 * Phase F2 of the one-canvas redesign. These are PICKER tabs, NOT
 * page tabs. State is in URL (`?pick=subjects` etc.) so deep links
 * and refresh preserve the active picker — but the underlying route
 * never changes. The user stays on `/my/workspace/[id]` regardless
 * of which picker tab is active.
 *
 * Visual chrome: small underline-style tabs, similar in spirit to
 * DatasetTabs but compact (smaller font, no large padding). The rail
 * is narrow (~340px) so the tabs need to be space-efficient. Active
 * tab gets a 2px brand-blue underline; inactive tabs are dim.
 *
 * A11y: roving tabindex, ArrowLeft/ArrowRight cycle through tabs.
 * Mirrors the WAI-ARIA tablist pattern from the existing
 * `DatasetTabs` component.
 */
import { useCallback, useRef } from 'react';

import { cn } from '@/lib/cn';
import {
  useWorkspaceSelection,
  type PickerTab,
} from '@/lib/workspace/use-workspace-selection';

interface TabDef {
  id: PickerTab;
  label: string;
}

const TABS: ReadonlyArray<TabDef> = [
  { id: 'subjects', label: 'Subjects' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'probes', label: 'Probes' },
  { id: 'stimuli', label: 'Stimuli' },
  { id: 'documents', label: 'Documents' },
];

export interface PickerRailTabsProps {
  className?: string;
}

export function PickerRailTabs({ className }: PickerRailTabsProps) {
  const { pickerTab, setPickerTab } = useWorkspaceSelection();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, currentIndex: number) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      const next = (currentIndex + direction + TABS.length) % TABS.length;
      const nextTab = TABS[next];
      if (nextTab) {
        setPickerTab(nextTab.id);
        tabRefs.current[next]?.focus();
      }
    },
    [setPickerTab],
  );

  return (
    <div
      role="tablist"
      aria-label="Picker"
      aria-orientation="horizontal"
      className={cn(
        'flex items-end gap-1 border-b border-border-subtle',
        'overflow-x-auto -mb-px',
        className,
      )}
    >
      {TABS.map((tab, idx) => {
        const isActive = tab.id === pickerTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`picker-panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setPickerTab(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              'shrink-0 px-2.5 py-2 text-[12.5px] font-medium',
              'border-b-2 -mb-px transition-colors duration-(--duration-base) ease-(--ease-out)',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40 focus-visible:rounded-t-md',
              isActive
                ? 'border-brand-blue text-fg-primary'
                : 'border-transparent text-fg-muted hover:text-fg-secondary hover:border-border-subtle',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

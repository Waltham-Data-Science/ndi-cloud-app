'use client';

/**
 * DataGridRowKebab — the visible `⋯` button that opens the same
 * action set as the row's right-click context menu.
 *
 * Phase H1 of the data-grid polish (2026-05-17). The Phase G grid
 * shipped right-click context menus, but right-click is INVISIBLE
 * to a first-time user — nobody right-clicks unless they've been
 * told to. Linear / Notion / Hex / Airtable all expose a kebab on
 * each row so the actions are discoverable. This adds the kebab
 * and shares the action list with the context menu, so neither
 * surface drifts.
 *
 * Same action shape as `ContextMenuEntry` from `DataGridContextMenu`.
 * Built on Radix DropdownMenu rather than ContextMenu because:
 *   - kebab is click-driven, not contextmenu-event-driven
 *   - DropdownMenu's positioning + a11y is what users expect from
 *     a "click the trigger" pattern
 *
 * Renders inline at the end of every row in `WorkspaceDataGrid`.
 * Click stopPropagation so opening the menu doesn't ALSO toggle
 * the row's primary-selection (the click would otherwise bubble
 * up to the row body's onClick).
 */
import {
  CheckboxItem as DmCheckbox,
  Content as DmContent,
  Item as DmItem,
  ItemIndicator as DmItemIndicator,
  Label as DmLabel,
  Portal as DmPortal,
  Root as DmRoot,
  Separator as DmSeparator,
  Trigger as DmTrigger,
} from '@radix-ui/react-dropdown-menu';
import { Check, MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/cn';

import type {
  ContextMenuEntry,
  ContextMenuItem,
  ContextMenuGroup,
} from './DataGridContextMenu';

export interface DataGridRowKebabProps {
  /**
   * Same action set as the row's right-click context menu. Empty
   * list → the kebab button renders disabled with a tooltip
   * ("No actions for this row"); this keeps the row layout stable
   * across rows where some are actionable and others aren't.
   */
  actions: ReadonlyArray<ContextMenuEntry>;
  /** A11y label for the trigger button. */
  rowLabel?: string;
}

export function DataGridRowKebab({
  actions,
  rowLabel = 'row',
}: DataGridRowKebabProps) {
  const empty = actions.length === 0;
  return (
    <DmRoot>
      <DmTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={empty}
          aria-label={`Open ${rowLabel} actions`}
          title={empty ? 'No actions for this row' : `${rowLabel} actions`}
          className={cn(
            'inline-flex items-center justify-center',
            'h-6 w-6 rounded-md',
            'text-fg-muted hover:text-fg-primary hover:bg-bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
            'transition-colors duration-(--duration-base) ease-(--ease-out)',
            empty && 'opacity-40 cursor-not-allowed pointer-events-none',
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
        </button>
      </DmTrigger>
      <DmPortal>
        <DmContent
          align="end"
          sideOffset={4}
          onCloseAutoFocus={(e) => {
            // Don't snatch focus back to the trigger after close —
            // the user's cursor may be elsewhere (clicking another
            // row, etc.). Same convention as the context menu.
            e.preventDefault();
          }}
          className={cn(
            'z-50 min-w-[200px] max-w-[280px]',
            'rounded-md border border-border-subtle bg-bg-surface',
            'shadow-lg shadow-black/5 py-1',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
          collisionPadding={8}
        >
          {actions.map((entry, idx) => renderEntry(entry, idx))}
        </DmContent>
      </DmPortal>
    </DmRoot>
  );
}

function renderEntry(entry: ContextMenuEntry, idx: number) {
  if (entry.kind === 'separator') {
    return (
      <DmSeparator
        key={`sep-${idx}`}
        className="my-1 h-px bg-border-subtle"
      />
    );
  }
  if (entry.kind === 'group') {
    return renderGroup(entry, idx);
  }
  return renderItem(entry, idx.toString());
}

function renderGroup(group: ContextMenuGroup, idx: number) {
  return (
    <div key={`group-${idx}-${group.label}`}>
      <DmLabel
        className={cn(
          'px-2 py-1 text-[10px] font-bold tracking-eyebrow uppercase',
          'text-fg-muted select-none',
        )}
      >
        {group.label}
      </DmLabel>
      {group.items.map((item, j) => renderItem(item, `${idx}-${j}`))}
    </div>
  );
}

function renderItem(item: ContextMenuItem, key: string | number) {
  const Icon = item.icon;
  // Use DmCheckbox if the item is destructive, otherwise plain item.
  // (DropdownMenu doesn't have a "destructive" variant — we style
  // via tailwind classes instead.)
  void DmCheckbox; // keep import in scope; reserved for future checkbox-style items
  void DmItemIndicator;
  void Check;
  return (
    <DmItem
      key={`item-${key}-${item.label}`}
      disabled={item.disabled}
      onSelect={(e) => {
        if (item.disabled) {
          e.preventDefault();
          return;
        }
        item.onSelect();
      }}
      title={item.hint}
      className={cn(
        'group/item relative flex items-center gap-2.5',
        'px-2 py-1.5 text-[13px] outline-none cursor-default',
        'rounded-sm mx-1 my-px select-none',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
        item.disabled
          ? 'text-fg-muted/60 pointer-events-none'
          : item.destructive
            ? 'text-red-700 hover:bg-red-50 focus:bg-red-50 data-[highlighted]:bg-red-50'
            : 'text-fg-primary hover:bg-bg-muted focus:bg-bg-muted data-[highlighted]:bg-bg-muted',
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0',
            item.destructive ? 'text-red-600' : 'text-fg-secondary',
          )}
          aria-hidden
        />
      ) : (
        <span className="w-3.5 h-3.5 shrink-0" aria-hidden />
      )}
      <span className="flex-1 truncate">{item.label}</span>
      {item.shortcut && (
        <span
          className={cn(
            'ml-3 text-[10.5px] font-mono text-fg-muted',
            'opacity-70 group-data-[highlighted]/item:opacity-100',
          )}
        >
          {item.shortcut}
        </span>
      )}
    </DmItem>
  );
}

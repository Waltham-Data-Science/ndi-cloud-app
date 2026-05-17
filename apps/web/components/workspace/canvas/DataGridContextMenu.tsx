'use client';

/**
 * DataGridContextMenu — right-click menu primitive wrapping Radix's
 * accessible ContextMenu with the visual language of the rest of
 * the workspace (cream-on-white, rounded-md, brand-blue hover).
 *
 * Phase G3 of the data-grid redesign. Used by `WorkspaceDataGrid`
 * on every row — Radix handles all the a11y + positioning lifting
 * (keyboard nav, escape-to-close, focus return, RTL, etc.). The
 * action set is data-driven: each consumer passes an array of
 * `ContextMenuAction` records and the menu renders + dispatches.
 *
 * ## API shape
 *
 *   - `actions`: an ordered list of items. `{ kind: 'item', ... }`
 *     renders a clickable row; `{ kind: 'separator' }` renders a
 *     visual divider; `{ kind: 'group', label, items }` renders a
 *     labeled section.
 *
 *   - `disabled` on an item is opt-out — a disabled item still
 *     renders (so the menu shape stays predictable across selection
 *     states) but is non-interactive. Hover tooltip explains why.
 *
 *   - `destructive: true` shifts the item to a red palette — used
 *     for things like "Clear selection" or any future Delete.
 *
 *   - `shortcut: 'C'` renders a right-aligned hint. Visual only —
 *     keyboard binding lives elsewhere (parent grid).
 *
 * ## Why Radix
 *
 * The native `oncontextmenu` event doesn't compose with keyboard
 * a11y. Radix's ContextMenu handles `Menu` key (Linux), Shift+F10,
 * Esc-to-close, focus restoration after close, arrow-key nav
 * inside the menu. None of that we'd want to rewrite. ~6 KB gz.
 */
import {
  Content as RcContent,
  Group as RcGroup,
  Item as RcItem,
  Label as RcLabel,
  Portal as RcPortal,
  Root as RcRoot,
  Separator as RcSeparator,
  Trigger as RcTrigger,
} from '@radix-ui/react-context-menu';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** A clickable menu row. */
export interface ContextMenuItem {
  kind: 'item';
  label: string;
  /** Optional leading icon — keeps the menu visually scannable. */
  icon?: LucideIcon;
  /** Optional right-aligned shortcut hint, e.g. "⌘C". */
  shortcut?: string;
  /** Called when the user picks the item. */
  onSelect: () => void;
  /** Render but disable. The tooltip on hover explains why. */
  disabled?: boolean;
  /** Red palette + warning iconography for destructive actions. */
  destructive?: boolean;
  /** Tooltip on hover — useful for disabled-state explanations. */
  hint?: string;
}

/** Visual divider between two groups of items. */
export interface ContextMenuSeparator {
  kind: 'separator';
}

/** A labeled section header above a sub-list of items. */
export interface ContextMenuGroup {
  kind: 'group';
  label: string;
  items: ReadonlyArray<ContextMenuItem>;
}

export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuSeparator
  | ContextMenuGroup;

export interface DataGridContextMenuProps {
  /** The element that owns the right-click area — wraps the row. */
  children: ReactNode;
  /** The menu items, in render order. */
  actions: ReadonlyArray<ContextMenuEntry>;
  /**
   * If actions is empty, the menu won't render at all — Radix's
   * Trigger still binds the contextmenu event but produces nothing.
   * The native browser context menu does NOT show because Radix
   * preventDefaults before we know. Pass an empty array to opt out
   * gracefully (e.g. while a row is loading).
   */
}

export function DataGridContextMenu({
  children,
  actions,
}: DataGridContextMenuProps) {
  if (actions.length === 0) {
    // Render the trigger area as a plain wrapper so right-click
    // falls through to the browser's default. Avoids surprising the
    // user with an empty menu.
    return <>{children}</>;
  }

  return (
    <RcRoot>
      <RcTrigger asChild>{children}</RcTrigger>
      <RcPortal>
        <RcContent
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
        </RcContent>
      </RcPortal>
    </RcRoot>
  );
}

function renderEntry(entry: ContextMenuEntry, idx: number) {
  if (entry.kind === 'separator') {
    return (
      <RcSeparator
        key={`sep-${idx}`}
        className="my-1 h-px bg-border-subtle"
      />
    );
  }
  if (entry.kind === 'group') {
    return (
      <RcGroup key={`group-${idx}-${entry.label}`}>
        <RcLabel
          className={cn(
            'px-2 py-1 text-[10px] font-bold tracking-eyebrow uppercase',
            'text-fg-muted select-none',
          )}
        >
          {entry.label}
        </RcLabel>
        {entry.items.map((item, j) => renderItem(item, `${idx}-${j}`))}
      </RcGroup>
    );
  }
  return renderItem(entry, idx.toString());
}

function renderItem(item: ContextMenuItem, key: string | number) {
  const Icon = item.icon;
  return (
    <RcItem
      key={`item-${key}-${item.label}`}
      disabled={item.disabled}
      onSelect={(e) => {
        // Radix calls onSelect on click + Enter + Space. We want
        // those to trigger the action, but `e.preventDefault()` is
        // what keeps the menu open if the consumer wants to chain
        // further actions. Default behavior is to close, which is
        // the right call for the data-grid context.
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
            : 'text-fg-primary hover:bg-bg-muted focus:bg-bg-muted data-[highlighted]:bg-bg-muted data-[highlighted]:text-fg-primary',
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
    </RcItem>
  );
}

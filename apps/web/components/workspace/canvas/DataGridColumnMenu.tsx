'use client';

/**
 * DataGridColumnMenu — the column-visibility + density dropdown that
 * lives in the top-right corner of a `WorkspaceDataGrid`. Same Radix
 * primitive family as the row context menu (visual + a11y parity).
 *
 * Phase G4. Renders three groups:
 *
 *   1. Density — Compact / Comfortable radio (one selected)
 *   2. Columns — checkboxes per column (toggle visibility)
 *   3. Actions — Reset to defaults
 *
 * The menu is data-driven: pass an array of `ColumnVisibility`
 * records (label + visible + onToggle) and the menu handles render +
 * dispatch. Density is a controlled prop.
 */
import {
  CheckboxItem as DmCheckbox,
  Content as DmContent,
  Item as DmItem,
  ItemIndicator as DmItemIndicator,
  Label as DmLabel,
  Portal as DmPortal,
  RadioGroup as DmRadioGroup,
  RadioItem as DmRadioItem,
  Root as DmRoot,
  Separator as DmSeparator,
  Trigger as DmTrigger,
} from '@radix-ui/react-dropdown-menu';
import { Check, Settings2 } from 'lucide-react';

import { cn } from '@/lib/cn';

export type GridDensity = 'compact' | 'comfortable';

export interface ColumnVisibility {
  /** Column id (matches the TanStack Table column id). */
  id: string;
  /** Human-readable label shown in the menu. */
  label: string;
  /** Whether the column is currently visible. */
  visible: boolean;
  /** Toggle handler — receives the next visible state. */
  onToggle: (next: boolean) => void;
  /**
   * Optional — when true, the checkbox is rendered but disabled.
   * Used to lock a critical column (e.g. the row identifier) on so
   * the table never renders rows without a key column.
   */
  locked?: boolean;
}

export interface DataGridColumnMenuProps {
  columns: ReadonlyArray<ColumnVisibility>;
  density: GridDensity;
  onDensityChange: (next: GridDensity) => void;
  /** Reset both column visibility and density to defaults. */
  onReset?: () => void;
}

export function DataGridColumnMenu({
  columns,
  density,
  onDensityChange,
  onReset,
}: DataGridColumnMenuProps) {
  return (
    <DmRoot>
      <DmTrigger asChild>
        <button
          type="button"
          aria-label="Column and density settings"
          title="Columns and density"
          className={cn(
            'inline-flex items-center justify-center',
            'h-6 w-6 rounded-md',
            'text-fg-muted hover:text-fg-primary hover:bg-bg-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40',
            'transition-colors duration-(--duration-base) ease-(--ease-out)',
          )}
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </DmTrigger>
      <DmPortal>
        <DmContent
          align="end"
          sideOffset={4}
          className={cn(
            'z-50 min-w-[220px] max-w-[280px]',
            'rounded-md border border-border-subtle bg-bg-surface',
            'shadow-lg shadow-black/5 py-1',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          {/* Density */}
          <DmLabel
            className={cn(
              'px-2 py-1 text-[10px] font-bold tracking-eyebrow uppercase',
              'text-fg-muted select-none',
            )}
          >
            Density
          </DmLabel>
          <DmRadioGroup
            value={density}
            onValueChange={(v) => onDensityChange(v as GridDensity)}
          >
            <DensityRadioItem value="compact" label="Compact" />
            <DensityRadioItem value="comfortable" label="Comfortable" />
          </DmRadioGroup>

          <DmSeparator className="my-1 h-px bg-border-subtle" />

          {/* Columns */}
          <DmLabel
            className={cn(
              'px-2 py-1 text-[10px] font-bold tracking-eyebrow uppercase',
              'text-fg-muted select-none',
            )}
          >
            Columns
          </DmLabel>
          {columns.map((col) => (
            <DmCheckbox
              key={col.id}
              checked={col.visible}
              disabled={col.locked}
              onCheckedChange={(checked) => {
                col.onToggle(checked === true);
              }}
              onSelect={(e) => {
                // Keep menu open after toggling a column — users
                // typically toggle several columns in a row.
                e.preventDefault();
              }}
              className={cn(
                'group/item relative flex items-center gap-2.5',
                'px-2 py-1.5 text-[13px] outline-none cursor-default',
                'rounded-sm mx-1 my-px select-none',
                'transition-colors duration-(--duration-base) ease-(--ease-out)',
                col.locked
                  ? 'text-fg-muted/60 pointer-events-none'
                  : 'text-fg-primary hover:bg-bg-muted focus:bg-bg-muted data-[highlighted]:bg-bg-muted',
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center',
                  'h-3.5 w-3.5 rounded border shrink-0',
                  col.visible
                    ? 'bg-brand-blue border-brand-blue'
                    : 'bg-transparent border-border-strong',
                )}
                aria-hidden
              >
                <DmItemIndicator>
                  <Check className="h-2.5 w-2.5 text-white" />
                </DmItemIndicator>
              </span>
              <span className="flex-1 truncate">{col.label}</span>
              {col.locked && (
                <span className="text-[10px] text-fg-muted opacity-70">
                  required
                </span>
              )}
            </DmCheckbox>
          ))}

          {onReset && (
            <>
              <DmSeparator className="my-1 h-px bg-border-subtle" />
              <DmItem
                onSelect={onReset}
                className={cn(
                  'group/item relative flex items-center gap-2.5',
                  'px-2 py-1.5 text-[13px] outline-none cursor-default',
                  'rounded-sm mx-1 my-px select-none text-fg-secondary',
                  'hover:bg-bg-muted focus:bg-bg-muted data-[highlighted]:bg-bg-muted',
                  'transition-colors duration-(--duration-base) ease-(--ease-out)',
                )}
              >
                <span className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="flex-1">Reset to defaults</span>
              </DmItem>
            </>
          )}
        </DmContent>
      </DmPortal>
    </DmRoot>
  );
}

interface DensityRadioItemProps {
  value: GridDensity;
  label: string;
}

function DensityRadioItem({ value, label }: DensityRadioItemProps) {
  return (
    <DmRadioItem
      value={value}
      className={cn(
        'group/item relative flex items-center gap-2.5',
        'px-2 py-1.5 text-[13px] outline-none cursor-default',
        'rounded-sm mx-1 my-px select-none text-fg-primary',
        'hover:bg-bg-muted focus:bg-bg-muted data-[highlighted]:bg-bg-muted',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center',
          'h-3.5 w-3.5 rounded-full border shrink-0',
          'border-border-strong',
        )}
        aria-hidden
      >
        <DmItemIndicator>
          <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
        </DmItemIndicator>
      </span>
      <span className="flex-1">{label}</span>
    </DmRadioItem>
  );
}

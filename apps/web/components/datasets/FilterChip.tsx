'use client';

/**
 * FilterChip — applied-filter pill with X dismissal.
 *
 * Phase 6.6 REBUILD-5. Ported from
 * `ndi-data-browser-v2/frontend/src/pages/DatasetsPage.tsx:430-444`
 * (the inline `FilterChip` closure). Lifted into its own module so the
 * catalog client island can map over active filters and render a chip
 * per active value with a single import.
 *
 * The chip uses the `ndi-teal-light` background + `ndi-teal` text +
 * `ndi-teal-border` ring per the source — matches the design system's
 * "active filter" treatment used in summary tables and the query AST
 * builder.
 */
import { X as XIcon } from 'lucide-react';

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium pl-2.5 pr-1.5 py-1 rounded-md bg-ndi-teal-light text-ndi-teal ring-1 ring-inset ring-ndi-teal-border">
      <span>{label}</span>
      <button
        type="button"
        aria-label={`Remove filter ${label}`}
        className="inline-flex items-center justify-center h-4 w-4 rounded-sm hover:bg-ndi-teal/15"
        onClick={onRemove}
      >
        <XIcon className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

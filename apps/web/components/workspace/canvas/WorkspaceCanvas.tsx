'use client';

/**
 * WorkspaceCanvas — the one-canvas layout for `/my/workspace/[id]`.
 *
 * Phase F2 of the one-canvas redesign (2026-05-16 design doc:
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 *
 * Replaces the prior 5-tab IA. Layout:
 *
 *   ┌─ Hero (in layout.tsx) ───────────────────────────────────┐
 *   ├─ SelectionBar (sticky, top-0) ───────────────────────────┤
 *   ├─ PickerRail (~340px sticky)  │  Canvas (fluid, scrolls)  │
 *   │  Picker tabs                 │   Snapshot section        │
 *   │  Active picker body          │   Analyses grid (6 cards) │
 *   │  Document Explorer escape    │                           │
 *   └─────────────────────────────────────────────────────────┘
 *
 * The 5 picker tab bodies and the analysis cards are passed in as
 * slot props — WorkspaceCanvas stays dumb about the specific
 * browsers and panels. That keeps the layout testable in isolation
 * and lets us swap implementations without churning the chrome.
 *
 * On narrow viewports (<lg) the picker stacks above the canvas.
 * Picker collapse-to-drawer is deferred to a polish round per the
 * design doc.
 *
 * NB on "wraps with `<div key={datasetId}>`": the parent layout
 * already keys its children-div by datasetId, so the entire canvas
 * subtree remounts on cross-dataset navigation. We don't need to
 * re-key here.
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { PickerTab } from '@/lib/workspace/use-workspace-selection';

import { DocumentExplorerEscape } from './DocumentExplorerEscape';
import { PickerRail } from './PickerRail';
import { SelectionBar } from './SelectionBar';

export interface WorkspaceCanvasProps {
  datasetId: string;
  /**
   * Picker tab bodies, keyed by tab id. Each renders only when its
   * tab is the active picker tab. Parent (page.tsx) provides these.
   */
  pickerSlots: Readonly<Record<PickerTab, ReactNode>>;
  /**
   * The snapshot section — stats + provenance + cold-start guidance.
   * Rendered at the top of the canvas.
   */
  snapshot: ReactNode;
  /**
   * The analyses grid — the 6 panel cards. Rendered below the
   * snapshot.
   */
  analyses: ReactNode;
  className?: string;
}

export function WorkspaceCanvas({
  datasetId,
  pickerSlots,
  snapshot,
  analyses,
  className,
}: WorkspaceCanvasProps) {
  return (
    <div className={cn('bg-bg-canvas', className)}>
      <SelectionBar />

      <div
        className={cn(
          'mx-auto max-w-[1480px]',
          // Two-column on desktop, stacked on narrow viewports.
          'lg:grid lg:grid-cols-[340px_1fr] lg:gap-0',
        )}
      >
        <PickerRail
          slots={pickerSlots}
          footer={<DocumentExplorerEscape datasetId={datasetId} />}
        />

        <main className="px-4 py-6 lg:px-6 lg:py-8 space-y-8 min-w-0">
          {snapshot}
          {analyses}
        </main>
      </div>
    </div>
  );
}

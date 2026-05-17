'use client';

/**
 * StimuliPicker — picker-rail body for the Stimuli tab of the
 * workspace canvas.
 *
 * Phase F3 of the one-canvas redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 * Sits in the ~340px left rail; clicking a row sets the workspace's
 * `stimulus` selection dimension via `useWorkspaceSelection.set()`.
 * The PSTH panel (the main consumer of `selection.stimulus`) reads
 * the bar and auto-aligns when both `unit` and `stimulus` are set.
 *
 * Data source: NDI carries stimulus information across TWO classes
 *   - `stimulus_presentation` — per-presentation parameters + event
 *     timestamps (`time_started` / `time_stopped`)
 *   - `stimulus_response` — per-trial response measurements
 * The `tables` endpoint only exposes a handful of canonical classes
 * (subject / probe / element / element_epoch / treatment / etc.);
 * neither stimulus class is on the supported list, so we fall back
 * to `useDocuments(datasetId, <class>, 1, 500)` for both and merge
 * the results.
 *
 * Columns of interest in the rail (constrained to ~300px width):
 *   - stimulus type (best-effort: parsed from the doc's `data` field
 *     — `stimulus_presentation.stim_type`, `name`, or class fallback)
 *   - presentation count (number of presentations / responses on the
 *     doc — derived from `data.stimulus_presentation.presentations[]`
 *     or `data.stimulus_response.responses[]`)
 *   - short-id (first 8 chars of the doc id)
 *
 * The shape of stimulus docs varies dataset-to-dataset; when we
 * can't derive `type` or `count` we fall back to "—" rather than
 * crash. Per the design-doc principle: never crash on partial data.
 *
 * Phase G7 (2026-05-16): table body migrated to the shared
 * `WorkspaceDataGrid` primitive.
 */
import { Activity, Copy, Crosshair, ExternalLink, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table';

import { Skeleton } from '@/components/ui/Skeleton';
import { WorkspaceDataGrid } from '@/components/workspace/canvas/WorkspaceDataGrid';
import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type { ContextMenuEntry } from '@/components/workspace/canvas/DataGridContextMenu';
import { DataGridSearchInput } from '@/components/workspace/canvas/DataGridSearchInput';
import {
  buildPrefillPrompt,
  emitAskPrefill,
} from '@/lib/ai/ask-prefill-bus';
import { useDocuments, type DocumentSummary } from '@/lib/api/documents';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

interface StimuliPickerProps {
  datasetId: string;
}

/**
 * Normalised stimulus row — what the table actually renders. We
 * project the raw `DocumentSummary` into this shape once so the
 * column accessors can stay simple.
 */
export interface StimulusRow {
  docId: string;
  /** Source class: `stimulus_presentation` or `stimulus_response`. */
  className: string;
  /** Human-readable stimulus type — best-effort. */
  stimulusType: string;
  /** Number of presentations / responses on the doc; null when unknown. */
  presentationCount: number | null;
}

/**
 * Project a raw document into a `StimulusRow`. Pure for testability —
 * exported so the test can pin the type-derivation + count-derivation
 * paths across the multiple known stimulus doc shapes.
 *
 * Type derivation order (best-effort):
 *   1. `data.<className>.stim_type` or `.stimulus_type`
 *   2. `data.<className>.name`
 *   3. `doc.name`
 *   4. class fallback ("Presentation" / "Response")
 *
 * Count derivation:
 *   - `stimulus_presentation`: `data.stimulus_presentation.presentations[].length`
 *   - `stimulus_response`: `data.stimulus_response.responses[].length`
 *   - null when neither array is present (older / atypical schemas)
 */
export function projectStimulusRow(
  doc: DocumentSummary,
  className: string,
): StimulusRow | null {
  const docId = doc.id ?? doc.ndiId;
  if (typeof docId !== 'string' || docId.length === 0) return null;

  const data = (doc.data ?? {}) as Record<string, unknown>;
  const inner = (data[className] ?? {}) as Record<string, unknown>;

  // Type derivation
  let stimulusType = '—';
  const innerStimType = inner.stim_type ?? inner.stimulus_type;
  if (typeof innerStimType === 'string' && innerStimType.length > 0) {
    stimulusType = innerStimType;
  } else if (typeof inner.name === 'string' && inner.name.length > 0) {
    stimulusType = inner.name;
  } else if (typeof doc.name === 'string' && doc.name.length > 0) {
    stimulusType = doc.name;
  } else {
    stimulusType =
      className === 'stimulus_presentation' ? 'Presentation' : 'Response';
  }

  // Count derivation
  let presentationCount: number | null = null;
  if (className === 'stimulus_presentation') {
    const arr = inner.presentations;
    if (Array.isArray(arr)) presentationCount = arr.length;
  } else if (className === 'stimulus_response') {
    const arr = inner.responses;
    if (Array.isArray(arr)) presentationCount = arr.length;
  }

  return {
    docId,
    className,
    stimulusType,
    presentationCount,
  };
}

/**
 * Filter stimulus rows by free-text "type contains" matching against
 * either `stimulusType` or `className`. Pure for testability.
 */
export function filterStimuli(
  rows: StimulusRow[],
  typeQuery: string,
): StimulusRow[] {
  const q = typeQuery.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (row) =>
      row.stimulusType.toLowerCase().includes(q) ||
      row.className.toLowerCase().includes(q),
  );
}

/** Stable row id accessor — every grid touchpoint uses this. */
function stimulusRowId(row: StimulusRow): string {
  return row.docId;
}

export function StimuliPicker({ datasetId }: StimuliPickerProps) {
  const { selection, set } = useWorkspaceSelection();
  const [typeQuery, setTypeQuery] = useState('');

  // Two parallel doc fetches — useDocuments returns a TanStack Query
  // result, so React-Query handles dedup + caching. Both queries run
  // concurrently; the table renders when both have resolved (we treat
  // a 404 on either as "no docs of this class" — that's a NORMAL
  // shape for datasets that only carry one variant).
  const presentationQuery = useDocuments(
    datasetId,
    'stimulus_presentation',
    1,
    500,
  );
  const responseQuery = useDocuments(datasetId, 'stimulus_response', 1, 500);

  const isLoading = presentationQuery.isLoading || responseQuery.isLoading;
  // Both 404-ing simultaneously is a real "no stimuli" signal — but
  // one erroring with the other succeeding should still surface the
  // good half. The empty-state branch below covers the all-empty case.
  const allFailed = presentationQuery.isError && responseQuery.isError;

  const allRows: StimulusRow[] = useMemo(() => {
    const result: StimulusRow[] = [];
    const pres = presentationQuery.data?.documents ?? [];
    for (const doc of pres) {
      const row = projectStimulusRow(doc, 'stimulus_presentation');
      if (row) result.push(row);
    }
    const resp = responseQuery.data?.documents ?? [];
    for (const doc of resp) {
      const row = projectStimulusRow(doc, 'stimulus_response');
      if (row) result.push(row);
    }
    return result;
  }, [presentationQuery.data, responseQuery.data]);

  // Note: filtering moved into the grid's globalFilter (Phase H6).
  // `filterStimuli` is kept as an exported helper for direct
  // consumers, but no longer applied here.

  const columnHelper = createColumnHelper<StimulusRow>();
  const columns = useMemo<ColumnDef<StimulusRow, unknown>[]>(
    () =>
      [
        columnHelper.accessor((r) => r.stimulusType, {
          id: 'type',
          header: 'Type',
          cell: (info) => (
            <span className="text-[12px] text-fg-primary truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 150,
        }),
        columnHelper.accessor(
          (r) =>
            r.presentationCount === null
              ? '—'
              : r.presentationCount.toLocaleString(),
          {
            id: 'count',
            header: '#',
            cell: (info) => (
              <span className="text-[12px] text-fg-secondary tabular-nums">
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 60,
          },
        ),
        columnHelper.accessor((r) => `${r.docId.slice(0, 8)}…`, {
          id: 'shortid',
          header: 'ID',
          cell: (info) => (
            <span className="font-mono text-[11px] text-fg-muted">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 80,
        }),
      ] as ColumnDef<StimulusRow, unknown>[],
    [columnHelper],
  );

  // Context menu — "Use in PSTH" sets the stimulus and jumps the
  // user to the PSTH panel. This is the most common downstream use:
  // pick a stimulus → align spikes around it.
  const contextMenuActions = useCallback(
    (row: StimulusRow): ReadonlyArray<ContextMenuEntry> => {
      const id = row.docId;
      if (!id) return [];
      return [
        {
          kind: 'item',
          label: 'Set as primary stimulus',
          icon: Crosshair,
          onSelect: () => set({ stimulus: id }),
        },
        {
          kind: 'item',
          label: 'Copy ID',
          icon: Copy,
          shortcut: '⌘C',
          onSelect: () => {
            void navigator.clipboard?.writeText(id);
          },
        },
        { kind: 'separator' },
        {
          kind: 'item',
          label: 'Use in PSTH',
          icon: Activity,
          onSelect: () => {
            set({ stimulus: id });
            document
              .getElementById('psth')
              ?.scrollIntoView({ behavior: 'smooth' });
          },
        },
        {
          kind: 'item',
          label: 'Open in Document Detail',
          icon: ExternalLink,
          onSelect: () => {
            window.open(
              `/datasets/${datasetId}/documents/${id}`,
              '_blank',
              'noopener,noreferrer',
            );
          },
        },
      ];
    },
    [set, datasetId],
  );

  const bulkActions = useCallback(
    (selectedIds: ReadonlyArray<string>): ReadonlyArray<BulkAction> => [
      {
        id: 'copy-ids',
        label: `Copy ${selectedIds.length} IDs`,
        icon: Copy,
        onSelect: (ids) => {
          void navigator.clipboard?.writeText(ids.join('\n'));
        },
      },
      {
        id: 'ask-claude',
        label: `Ask Claude about these stimuli`,
        variant: 'primary',
        icon: Sparkles,
        onSelect: (ids) => {
          emitAskPrefill({
            text: buildPrefillPrompt('stimulus', ids),
            autoSend: false,
          });
        },
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading stimuli">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-[280px] w-full rounded-md" />
      </div>
    );
  }

  if (allFailed || allRows.length === 0) {
    return (
      <div
        role="status"
        className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-[12.5px] text-fg-secondary leading-relaxed"
      >
        No stimulus documents in this dataset.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DataGridSearchInput
        value={typeQuery}
        onChange={setTypeQuery}
        placeholder="Search stimuli…"
        ariaLabel="Search stimuli"
      />

      <WorkspaceDataGrid<StimulusRow>
        data={allRows}
        columns={columns}
        rowId={stimulusRowId}
        noun="stimulus"
        primaryId={selection.stimulus}
        onPrimaryChange={(id) => set({ stimulus: id })}
        contextMenuActions={contextMenuActions}
        bulkActions={bulkActions}
        globalFilter={typeQuery}
        // Stimulus Type is the natural group-by dimension
        // ("drift gratings vs gabor vs noise" cohorts).
        groupableColumnIds={['type']}
        columnLabels={{ type: 'Type', count: 'Count', shortid: 'ID' }}
        lockedColumnIds={['type']}
        label="Stimuli"
        emptyState={
          <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-center text-[12.5px] text-fg-secondary">
            No stimuli match the current filter.
          </div>
        }
      />
    </div>
  );
}

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
 * to `useDocuments(datasetId, <class>, 1, 200)` for both and merge
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
import { buildPickerColumns } from '@/lib/workspace/build-picker-columns';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

interface StimuliPickerProps {
  datasetId: string;
}

/**
 * Stimulus row — a flattened projection of a stimulus document.
 * Carries the doc identity + className for workspace selection,
 * plus every key from `data[className]` flattened to the top level
 * so the dynamic-column helper can discover them.
 *
 * Audit 2026-05-18 follow-up (no hardcoding): the previous version
 * of this picker projected just 4 hardcoded fields (`docId`,
 * `className`, `stimulusType`, `presentationCount`) and dropped
 * everything else the doc carried — `stim_time`, `parameters`,
 * `frequency`, etc. were silently invisible. Now: nothing is
 * dropped. The table renders every field the doc body exposes.
 */
export type StimulusRow = Record<string, unknown> & {
  /** Workspace selection key. Always present; everything else is open. */
  docId: string;
};

/**
 * Project a raw document into a `StimulusRow` by flattening
 * `doc.data[className]` keys to the top level. Doc-shell fields
 * (`id`, `ndiId`, `name`, `className`) are added as `docId`,
 * `ndiId`, `name`, `className` so they're available alongside the
 * inner stim data. Pure for testability.
 */
export function projectStimulusRow(
  doc: DocumentSummary,
  className: string,
): StimulusRow | null {
  const docId = doc.id ?? doc.ndiId;
  if (typeof docId !== 'string' || docId.length === 0) return null;

  const data = (doc.data ?? {}) as Record<string, unknown>;
  const inner = (data[className] ?? {}) as Record<string, unknown>;

  // Flatten: doc-shell fields + every inner field. Conflicts go to
  // the shell value (the doc's outer `name` wins over `data.name`).
  return {
    ...inner,
    docId,
    ndiId: doc.ndiId ?? null,
    name: doc.name ?? null,
    className,
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
  // Audit 2026-05-18 follow-up: StimulusRow is now an open record
  // (flattened doc body), so the legacy `stimulusType` / `className`
  // fields aren't guaranteed. Match against EVERY string value on
  // the row — same approach the grid's globalFilter uses for its
  // searchable substring matching.
  return rows.filter((row) => {
    for (const value of Object.values(row)) {
      if (typeof value === 'string' && value.toLowerCase().includes(q)) {
        return true;
      }
    }
    return false;
  });
}

/** Stable row id accessor — every grid touchpoint uses this. */
function stimulusRowId(row: StimulusRow): string {
  return String(row.docId ?? '');
}

export function StimuliPicker({ datasetId }: StimuliPickerProps) {
  const { selection, set } = useWorkspaceSelection();
  const [typeQuery, setTypeQuery] = useState('');

  // Two parallel doc fetches — useDocuments returns a TanStack Query
  // result, so React-Query handles dedup + caching. Both queries run
  // concurrently; the table renders when both have resolved (we treat
  // a 404 on either as "no docs of this class" — that's a NORMAL
  // shape for datasets that only carry one variant).
  //
  // Backend caps pageSize at 200 on /api/datasets/:id/documents (same
  // limit ElectrodePositionPanel hit). Capping here avoids silent 400
  // VALIDATION_ERROR responses that degrade to "no stimuli" empty
  // states. The right long-term fix is a dedicated /tables/stimulus
  // backend projection — see the Phase H architecture review.
  const presentationQuery = useDocuments(
    datasetId,
    'stimulus_presentation',
    1,
    200,
  );
  const responseQuery = useDocuments(datasetId, 'stimulus_response', 1, 200);

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

  // Audit 2026-05-18 follow-up — no column hardcoding. Stimuli docs
  // come from `useDocuments` (no /tables/stimulus projection yet —
  // see backend follow-up F-1). projectStimulusRow flattens
  // doc.data[className] keys to the top level, so the dynamic
  // helper discovers every field the stim doc carries (stim_time,
  // parameters, frequency, etc.) — not just the 3 hardcoded ones
  // (type / count / shortid) the picker used to surface.
  const built = useMemo(
    () =>
      buildPickerColumns<StimulusRow>({
        serverColumns: undefined, // discovered from rows
        rows: allRows,
        // The flattened row has `docId` as the canonical selection
        // identity; mark it primary so it renders mono + locked.
        primaryColumnId: 'docId',
      }),
    [allRows],
  );

  const columns = built.columns;
  const initialColumnVisibility = built.initialVisibility;
  const dynamicColumnLabels = built.columnLabels;
  const dynamicLockedColumnIds = built.lockedColumnIds;

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
        // No explicit groupableColumnIds — every backend-discovered
        // stim doc field is offered as a group-by option (audit
        // 2026-05-18 follow-up: no hardcoding).
        columnLabels={dynamicColumnLabels}
        lockedColumnIds={dynamicLockedColumnIds}
        initialColumnVisibility={initialColumnVisibility}
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

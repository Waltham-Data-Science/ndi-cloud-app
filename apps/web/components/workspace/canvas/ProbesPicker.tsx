'use client';

/**
 * ProbesPicker — picker-rail body for the Probes tab of the workspace
 * canvas.
 *
 * Phase F3 of the one-canvas redesign (design doc:
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 * Sits in the ~340px left rail; clicking a row sets the workspace's
 * `probe` selection dimension via `useWorkspaceSelection.set()`. The
 * selection bar then surfaces a chip and every panel that reads
 * `selection.probe` auto-runs.
 *
 * Data source: `useSummaryTable(datasetId, 'probe')` — the same
 * projection the Document Explorer probe table uses. Columns of
 * interest in the rail (constrained to ~300px width):
 *
 *   - probe name (short-id fallback when the doc has no name)
 *   - probe type (e.g. "patch", "Neuropixels 1.0")
 *   - sample rate (when carried on the doc — many older datasets
 *     don't include it; we omit the column rather than render "—"
 *     across every row when we detect none)
 *
 * Reactive cascade (per design doc):
 *
 *   When `selection.subject` is set, the list is filtered to only
 *   probes whose `depends_on` array carries `subject_id ==
 *   <selected>` — so the user picks a subject, the Probes tab
 *   automatically narrows to that subject's probes. Best-effort:
 *   `depends_on` lives under each doc's `data` field; the summary
 *   table doesn't always carry it, so we fall back to matching
 *   `subjectDocumentIdentifier` (which the probe projection DOES
 *   carry).
 *
 * Empty state: probes are absent on many datasets — especially
 * purely behavioural ones (Bhar's worm tracking, Francesconi's EPM
 * behavioural assays). We surface that explicitly rather than
 * implying the dataset is broken.
 *
 * Phase G7 (2026-05-16): table body migrated to the shared
 * `WorkspaceDataGrid` primitive.
 */
import { Copy, Crosshair, ExternalLink, MapPin, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table';

import { Skeleton } from '@/components/ui/Skeleton';
import { WorkspaceDataGrid } from '@/components/workspace/canvas/WorkspaceDataGrid';
import type { BulkAction } from '@/components/workspace/canvas/DataGridBulkActions';
import type { ContextMenuEntry } from '@/components/workspace/canvas/DataGridContextMenu';
import {
  buildPrefillPrompt,
  emitAskPrefill,
} from '@/lib/ai/ask-prefill-bus';
import { useSummaryTable } from '@/lib/api/tables';
import { cn } from '@/lib/cn';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

interface ProbesPickerProps {
  datasetId: string;
}

interface ProbeRow {
  probeDocumentIdentifier?: string | null;
  probeName?: string | null;
  probeType?: string | null;
  probeReference?: string | null;
  subjectDocumentIdentifier?: string | null;
  /** Some projections also carry the raw doc shape under `data`. */
  data?: {
    depends_on?: Array<{ name?: string; value?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Best-effort subject extractor — first checks the doc's
 * `depends_on` array (canonical), then the projection's
 * `subjectDocumentIdentifier` field (summary-table fallback).
 *
 * Pure for testability.
 */
export function probeSubjectId(row: ProbeRow): string | null {
  const depends = row.data?.depends_on;
  if (Array.isArray(depends)) {
    for (const dep of depends) {
      if (!dep || typeof dep !== 'object') continue;
      const name = dep.name;
      if (
        typeof name === 'string' &&
        (name === 'subject_id' ||
          name === 'openminds_subject_id' ||
          name.endsWith('subject_id'))
      ) {
        const value = dep.value;
        if (typeof value === 'string' && value.length > 0) return value;
      }
    }
  }
  const flat = row.subjectDocumentIdentifier;
  return typeof flat === 'string' && flat.length > 0 ? flat : null;
}

/**
 * Filter probes by free-text "name contains" + (optional) reactive
 * subject filter from the workspace selection.
 *
 * Pure for testability — exported separately so the unit test can
 * cover the AND-semantics + the subject cascade without React.
 */
export function filterProbes(
  rows: ProbeRow[],
  nameQuery: string,
  subjectFilter: string | null,
): ProbeRow[] {
  const q = nameQuery.trim().toLowerCase();
  return rows.filter((row) => {
    if (q) {
      const name = String(row.probeName ?? '').toLowerCase();
      const id = String(row.probeDocumentIdentifier ?? '').toLowerCase();
      if (!name.includes(q) && !id.includes(q)) return false;
    }
    if (subjectFilter) {
      const sid = probeSubjectId(row);
      if (sid !== subjectFilter) return false;
    }
    return true;
  });
}

/** Stable row-id accessor — shared across grid + context + bulk actions. */
function probeRowId(row: ProbeRow): string {
  const id = row.probeDocumentIdentifier;
  return typeof id === 'string' && id.length > 0 ? id : '';
}

export function ProbesPicker({ datasetId }: ProbesPickerProps) {
  const { selection, set } = useWorkspaceSelection();
  const [nameQuery, setNameQuery] = useState('');

  const summary = useSummaryTable(datasetId, 'probe');

  const allRows: ProbeRow[] = useMemo(
    () => (summary.data?.rows as ProbeRow[]) ?? [],
    [summary.data],
  );

  const filteredRows = useMemo(
    () => filterProbes(allRows, nameQuery, selection.subject),
    [allRows, nameQuery, selection.subject],
  );

  const columnHelper = createColumnHelper<ProbeRow>();
  const columns = useMemo<ColumnDef<ProbeRow, unknown>[]>(
    () =>
      [
        columnHelper.accessor(
          (r) =>
            r.probeName ??
            (typeof r.probeDocumentIdentifier === 'string'
              ? `${r.probeDocumentIdentifier.slice(0, 8)}…`
              : '—'),
          {
            id: 'name',
            header: 'Probe',
            cell: (info) => (
              <span className="font-mono text-[12px] text-fg-primary truncate inline-block max-w-full">
                {String(info.getValue() ?? '—')}
              </span>
            ),
            size: 160,
          },
        ),
        columnHelper.accessor((r) => r.probeType ?? '—', {
          id: 'type',
          header: 'Type',
          cell: (info) => (
            <span className="text-[12px] text-fg-secondary truncate inline-block max-w-full">
              {String(info.getValue() ?? '—')}
            </span>
          ),
          size: 130,
        }),
      ] as ColumnDef<ProbeRow, unknown>[],
    [columnHelper],
  );

  // Context menu — "Show electrode positions" jumps to the
  // ElectrodePosition panel (matching the canvas's analysis grid).
  const contextMenuActions = useCallback(
    (row: ProbeRow): ReadonlyArray<ContextMenuEntry> => {
      const id = probeRowId(row);
      if (!id) return [];
      return [
        {
          kind: 'item',
          label: 'Set as primary probe',
          icon: Crosshair,
          onSelect: () => set({ probe: id }),
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
          label: 'Show electrode positions',
          icon: MapPin,
          onSelect: () => {
            set({ probe: id });
            document
              .getElementById('electrode-position')
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
        label: `Ask Claude about these probes`,
        variant: 'primary',
        icon: Sparkles,
        onSelect: (ids) => {
          emitAskPrefill({
            text: buildPrefillPrompt('probe', ids),
            autoSend: false,
          });
        },
      },
    ],
    [],
  );

  if (summary.isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading probes">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-[280px] w-full rounded-md" />
      </div>
    );
  }

  if (summary.isError || allRows.length === 0) {
    return (
      <div
        role="status"
        className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-[12.5px] text-fg-secondary leading-relaxed"
      >
        No probes in this dataset. Many datasets — especially
        purely-behavioural ones — don&rsquo;t carry probe documents.
      </div>
    );
  }

  const subjectFilterActive = selection.subject !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Name contains…"
          className={cn(
            'flex-1 min-w-0 rounded-md border border-border-subtle bg-bg-surface',
            'px-2 py-1 text-[12px] text-fg-primary placeholder:text-fg-muted',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/40',
          )}
          aria-label="Filter probes by name"
        />
      </div>

      <div className="text-[11px] text-fg-muted tabular-nums">
        Showing{' '}
        <span className="font-semibold text-fg-secondary">
          {filteredRows.length.toLocaleString()}
        </span>{' '}
        of {allRows.length.toLocaleString()} probe
        {allRows.length === 1 ? '' : 's'}
        {subjectFilterActive && (
          <span className="ml-1 text-fg-muted">
            (filtered to selected subject)
          </span>
        )}
      </div>

      <WorkspaceDataGrid<ProbeRow>
        data={filteredRows}
        columns={columns}
        rowId={probeRowId}
        noun="probe"
        primaryId={selection.probe}
        onPrimaryChange={(id) => set({ probe: id })}
        contextMenuActions={contextMenuActions}
        bulkActions={bulkActions}
        columnLabels={{ name: 'Probe', type: 'Type' }}
        lockedColumnIds={['name']}
        label="Probes"
        emptyState={
          <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-6 text-center text-[12.5px] text-fg-secondary">
            No probes match the current filters.
          </div>
        }
      />
    </div>
  );
}

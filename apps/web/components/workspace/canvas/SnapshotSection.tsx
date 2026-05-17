'use client';

/**
 * SnapshotSection — top-of-canvas section that orients the user when
 * they land on a workspace. Renders three things:
 *
 *   1. Six clickable stat tiles (Subjects / Sessions / Probes /
 *      Epochs / Documents / Species). Click switches the picker
 *      rail to the relevant tab — never routes the user out.
 *   2. The provenance band (brain regions / strains / sexes /
 *      probe types / paper DOIs).
 *   3. A cold-start guidance card shown ONLY when `hasAnySelection`
 *      is false. Reads "Pick a subject in the left rail to start"
 *      with two short hints. Hides as soon as anything is selected.
 *
 * Phase F4 of the one-canvas redesign. Replaces the old `/overview`
 * page which routed every stat-tile click to either a deleted
 * workspace tab or, worse, out to the Document Explorer (`/datasets/
 * {id}/tables/probe` etc. — the user complained about every one of
 * those escape routes).
 *
 * The provenance band is reused verbatim from the prior Overview
 * tab; the stat tiles are re-implemented here with picker-tab-
 * switching clicks because the old `StatTilesRow` always routes out.
 */
import {
  FileText,
  FlaskConical,
  Layers,
  Microscope,
  Sparkles,
  Users2,
  type LucideIcon,
} from 'lucide-react';

import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useClassCounts, useDatasetSummary } from '@/lib/api/datasets';
import { formatNumber } from '@/lib/format';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

import { WorkspaceProvenanceBand } from '../WorkspaceProvenanceBand';

export interface SnapshotSectionProps {
  datasetId: string;
}

export function SnapshotSection({ datasetId }: SnapshotSectionProps) {
  const { hasAnySelection } = useWorkspaceSelection();

  return (
    <section
      aria-label="Dataset snapshot"
      className="space-y-5"
      id="snapshot"
    >
      <div>
        <p className="text-[10.5px] font-bold tracking-eyebrow uppercase text-ndi-teal mb-2">
          Snapshot
        </p>
        <h2 className="text-[18px] font-semibold text-fg-primary leading-tight">
          What&rsquo;s in this dataset
        </h2>
      </div>

      <CanvasStatTiles datasetId={datasetId} />
      <WorkspaceProvenanceBand datasetId={datasetId} />

      {!hasAnySelection && <ColdStartGuidance />}
    </section>
  );
}

/**
 * Stat tiles tuned for the canvas — click switches picker tab, never
 * routes the user out. Lifted from the deprecated StatTilesRow but
 * with the navigate-out behavior replaced by a setPickerTab call.
 */
interface CanvasStatTilesProps {
  datasetId: string;
}

function CanvasStatTiles({ datasetId }: CanvasStatTilesProps) {
  const summary = useDatasetSummary(datasetId);
  const classCounts = useClassCounts(datasetId);
  const { setPickerTab } = useWorkspaceSelection();

  const isLoading = summary.isLoading || classCounts.isLoading;
  const counts = summary.data?.counts;
  const species = summary.data?.species;
  const numClasses = classCounts.data
    ? Object.keys(classCounts.data.classCounts).length
    : null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-6 max-[1100px]:grid-cols-3 max-[480px]:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CanvasStatTileSkeleton key={i} />
        ))}
      </div>
    );
  }

  const v = (n: number | undefined): string =>
    typeof n === 'number' ? formatNumber(n) : '—';

  return (
    <div className="grid grid-cols-6 max-[1100px]:grid-cols-3 max-[480px]:grid-cols-2 gap-3">
      <CanvasStatTile
        label="Subjects"
        value={v(counts?.subjects)}
        subLabel={formatSpeciesSubLabel(species)}
        icon={Users2}
        onClick={() => setPickerTab('subjects')}
      />
      <CanvasStatTile
        label="Sessions"
        value={v(counts?.sessions)}
        subLabel={
          counts?.elements
            ? `${formatNumber(counts.elements)} elements`
            : undefined
        }
        icon={Microscope}
        onClick={() => setPickerTab('sessions')}
      />
      <CanvasStatTile
        label="Probes"
        // Audit 2026-05-18 finding: backend's `counts.probes` counts
        // the literal `probe` class which doesn't exist as an NDI
        // document class (probe is a Python runtime alias for
        // `element`). For datasets like Francesconi the field reads
        // 0 even though `counts.elements` is 606 and 3 probe types
        // exist. Fall back to `elements` when probes is 0/missing
        // AND any probe types are reported (which means the dataset
        // really does have probes, just under the element class
        // alias). Filed as backend follow-up F-1c.
        value={v(
          (counts?.probes && counts.probes > 0
            ? counts.probes
            : (summary.data?.probeTypes?.length ?? 0) > 0
              ? counts?.elements
              : counts?.probes) ?? undefined,
        )}
        subLabel={
          summary.data?.probeTypes && summary.data.probeTypes.length > 0
            ? summary.data.probeTypes.slice(0, 2).join(' · ') +
              (summary.data.probeTypes.length > 2
                ? ` +${summary.data.probeTypes.length - 2}`
                : '')
            : undefined
        }
        icon={FlaskConical}
        onClick={() => setPickerTab('probes')}
      />
      <CanvasStatTile
        label="Epochs"
        value={v(counts?.epochs)}
        subLabel={
          counts?.elements
            ? `across ${formatNumber(counts.elements)} elements`
            : undefined
        }
        icon={Layers}
        // Epochs map to sessions in the picker — both come from
        // element_epoch / epochid. Switching to Sessions is the
        // closest semantic match without adding a separate tab.
        onClick={() => setPickerTab('sessions')}
      />
      <CanvasStatTile
        label="Documents"
        value={v(counts?.totalDocuments)}
        subLabel={
          numClasses != null
            ? `across ${formatNumber(numClasses)} classes`
            : undefined
        }
        icon={FileText}
        onClick={() => setPickerTab('documents')}
      />
      <CanvasStatTile
        label="Species"
        value={species ? formatNumber(species.length) : '—'}
        subLabel={
          species && species.length > 0
            ? species
                .slice(0, 2)
                .map((s) => s.label)
                .join(' · ')
            : undefined
        }
        icon={Sparkles}
        // Species has no picker tab — the band below already exposes
        // species pills with ontology drill-down. Leave non-clickable.
      />
    </div>
  );
}

interface CanvasStatTileProps {
  label: string;
  value: string;
  subLabel?: string;
  icon: LucideIcon;
  onClick?: () => void;
}

function CanvasStatTile({
  label,
  value,
  subLabel,
  icon: Icon,
  onClick,
}: CanvasStatTileProps) {
  const sharedClasses = cn(
    'rounded-xl border border-border-subtle bg-bg-surface px-3.5 py-3.5',
    'shadow-sm flex flex-col gap-1',
    onClick &&
      'cursor-pointer hover:border-ndi-teal-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-(--duration-base) ease-(--ease-out)',
  );

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-ndi-teal shrink-0" aria-hidden />
        <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
          {label}
        </span>
      </div>
      <div className="text-[20px] font-semibold text-fg-primary tabular-nums leading-none">
        {value}
      </div>
      {subLabel && (
        <div className="text-[11px] text-fg-secondary truncate">{subLabel}</div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(sharedClasses, 'text-left')}
        aria-label={`${label}: ${value}. Open ${label.toLowerCase()} picker.`}
      >
        {body}
      </button>
    );
  }

  return <div className={sharedClasses}>{body}</div>;
}

function CanvasStatTileSkeleton() {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface px-3.5 py-3.5 shadow-sm space-y-2">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function formatSpeciesSubLabel(
  species: { label: string }[] | null | undefined,
): string {
  if (!species || species.length === 0) return '—';
  if (species.length === 1) return species[0]!.label;
  return `${species[0]!.label} + ${species.length - 1} more`;
}

/**
 * Cold-start guidance — shown when no selection is set. The first
 * thing a new user sees is the analyses grid (right column) full of
 * empty-state cards saying "Pick a subject in the left rail." That
 * gets repetitive. This card sits between the snapshot and the
 * analyses grid and orients them once, then hides as soon as
 * anything is selected.
 */
function ColdStartGuidance() {
  return (
    <div
      role="status"
      className={cn(
        'rounded-xl border border-dashed border-ndi-teal-border/60',
        'bg-ndi-teal-light/30 px-4 py-3.5',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <div className="h-7 w-7 rounded-full bg-ndi-teal/10 ring-1 ring-inset ring-ndi-teal/20 grid place-items-center">
            <span className="text-ndi-teal text-[13px] font-bold">→</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg-primary leading-snug">
            Pick a subject or session in the left rail to start.
          </p>
          <p className="mt-1 text-[12px] text-fg-secondary leading-snug">
            Each analysis card below auto-fills from the selection and runs
            on its own — no copy-pasting document IDs. Use{' '}
            <kbd className="font-mono text-[10.5px] bg-bg-canvas border border-border-subtle rounded px-1 py-px">
              ⌘K
            </kbd>{' '}
            to ask the data anything.
          </p>
        </div>
      </div>
    </div>
  );
}

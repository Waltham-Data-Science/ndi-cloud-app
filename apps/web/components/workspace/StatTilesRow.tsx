'use client';

/**
 * StatTilesRow — six clickable stat tiles for the Overview tab.
 *
 * Phase B of the workspace redesign. Surfaces the cardinal facts
 * of a dataset (Subjects / Sessions / Probes / Epochs / Documents /
 * Species) as a row of `<StatTile>` primitives. Each tile drills
 * into the relevant tab or summary table when clicked.
 *
 * Data sources: `useDatasetSummary` for the labeled counts +
 * species, `useClassCounts` for the class-count headline that backs
 * the Documents tile's sub-label ("across N classes"). The hooks
 * own their loading/error state; the row renders a six-tile
 * skeleton matrix during resolve and an inline error chip when both
 * hooks fail.
 *
 * Grid: 6 across on desktop, 3x2 on tablet, 2x3 on mobile. Matches
 * the marketing FairTile + institutionLogos responsive pattern so
 * the workspace section looks like a continuation of the marketing
 * surface, not its own visual world.
 */
import {
  FileText,
  FlaskConical,
  Layers,
  Microscope,
  Sparkles,
  Users2,
} from 'lucide-react';

import { useClassCounts, useDatasetSummary } from '@/lib/api/datasets';
import { formatNumber } from '@/lib/format';

import { StatTile, StatTileSkeleton } from './StatTile';

interface StatTilesRowProps {
  datasetId: string;
}

/**
 * Format a list of ontology terms into a compact sub-label.
 * "C. elegans (1)" / "C. elegans + 1 more" / "—" when null/empty.
 */
function formatSpeciesSubLabel(
  species: { label: string }[] | null | undefined,
): string {
  if (!species || species.length === 0) return '—';
  if (species.length === 1) return species[0]!.label;
  return `${species[0]!.label} + ${species.length - 1} more`;
}

export function StatTilesRow({ datasetId }: StatTilesRowProps) {
  const summary = useDatasetSummary(datasetId);
  const classCounts = useClassCounts(datasetId);

  const isLoading = summary.isLoading || classCounts.isLoading;
  const counts = summary.data?.counts;
  const species = summary.data?.species;
  const numClasses = classCounts.data
    ? Object.keys(classCounts.data.classCounts).length
    : null;

  if (isLoading) {
    // Skeleton — same six tiles, no values. Keeps the layout stable
    // so the page doesn't reflow when the data resolves.
    return (
      <div className="grid grid-cols-6 max-[840px]:grid-cols-3 max-[480px]:grid-cols-2 gap-4">
        <StatTileSkeleton label="Subjects" />
        <StatTileSkeleton label="Sessions" />
        <StatTileSkeleton label="Probes" />
        <StatTileSkeleton label="Epochs" />
        <StatTileSkeleton label="Documents" />
        <StatTileSkeleton label="Species" />
      </div>
    );
  }

  // Defensive: both hooks resolved but `counts` is somehow absent
  // (network blip, schema drift). Render the row with em-dashes
  // rather than blowing up — the rest of the Overview tab can still
  // function. The Provenance band below carries the same data via
  // its own hook so the user isn't totally without context.
  const v = (n: number | undefined): string =>
    typeof n === 'number' ? formatNumber(n) : '—';

  return (
    <div className="grid grid-cols-6 max-[840px]:grid-cols-3 max-[480px]:grid-cols-2 gap-4">
      <StatTile
        label="Subjects"
        value={v(counts?.subjects)}
        subLabel={formatSpeciesSubLabel(species)}
        href={`/my/workspace/${datasetId}/subjects`}
        icon={Users2}
      />
      <StatTile
        label="Sessions"
        value={v(counts?.sessions)}
        subLabel={
          counts?.elements ? `${formatNumber(counts.elements)} elements` : undefined
        }
        href={`/my/workspace/${datasetId}/sessions`}
        icon={Microscope}
      />
      <StatTile
        label="Probes"
        value={v(counts?.probes)}
        subLabel={
          summary.data?.probeTypes && summary.data.probeTypes.length > 0
            ? summary.data.probeTypes.slice(0, 2).join(' · ') +
              (summary.data.probeTypes.length > 2
                ? ` +${summary.data.probeTypes.length - 2}`
                : '')
            : undefined
        }
        // Probes/Epochs drill to the existing summary table for now;
        // Phase C will route these into the new Structure / Sessions
        // tabs with the relevant class pre-selected.
        href={`/datasets/${datasetId}/tables/probe`}
        icon={FlaskConical}
      />
      <StatTile
        label="Epochs"
        value={v(counts?.epochs)}
        subLabel={
          counts?.elements
            ? `across ${formatNumber(counts.elements)} elements`
            : undefined
        }
        href={`/datasets/${datasetId}/tables/element_epoch`}
        icon={Layers}
      />
      <StatTile
        label="Documents"
        value={v(counts?.totalDocuments)}
        subLabel={
          numClasses != null
            ? `across ${formatNumber(numClasses)} classes`
            : undefined
        }
        href={`/datasets/${datasetId}/documents`}
        icon={FileText}
      />
      <StatTile
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
        // No drill destination for "all species in this dataset" —
        // the species pills in the Provenance band are individually
        // clickable to ontology references. The tile here is purely
        // informational (matches the FairTile precedent of non-
        // navigable display tiles).
        icon={Sparkles}
      />
    </div>
  );
}

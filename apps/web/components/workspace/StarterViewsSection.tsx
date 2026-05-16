'use client';

/**
 * StarterViewsSection — eyebrow + 3 auto-selected starter view cards.
 *
 * Phase B of the workspace redesign. The viewer scoping doc
 * (`ndi-next-steps/Summer 2026/2_MatlabPython_Viewer_GUI/_Why_it_matters.md`)
 * mandates "3-5 standard visualizations" exposed prominently for the
 * "first hour" experience. This section surfaces three of them,
 * **auto-selected from the dataset's class counts** so the picks
 * match what the dataset actually contains.
 *
 * Selection priority (the first three matches win):
 *   1. BehavioralCompare — ontologyTableRow + subjects ≥ 2
 *   2. Treatment timeline — treatment | treatment_drug
 *   3. Plot signal trace — element_epoch | epoch
 *   4. PSTH — vmspikesummary + (stimulus_presentation | stimulus_response)
 *   5. Spike raster — vmspikesummary
 *   6. Browse subjects — fallback, always available when subjects ≥ 1
 *
 * Visual chrome: the marketing BridgeRow pattern from the home page —
 * a unified `rounded-xl bg-bg-surface border` container with internal
 * `border-t` dividers between cards (`first:border-t-0` resets the
 * top edge). The auto-selected card slugs become the link targets,
 * routing to /analyses with a future anchor hash (Phase D adds the
 * per-panel `headingId` anchors).
 */
import { useMemo } from 'react';

import { useClassCounts, useDatasetSummary } from '@/lib/api/datasets';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';

import { StarterViewCard } from './StarterViewCard';

interface StarterViewsSectionProps {
  datasetId: string;
}

interface StarterViewCandidate {
  /**
   * Stable slug used for the panel-anchor href once Phase D wires
   * deep links into Analyses. For Phase B this is informational
   * (the link target is `/analyses`); the slug shows up as the
   * anchor (`#${slug}`) once the panels carry matching headingIds.
   */
  slug: string;
  title: string;
  description: string;
  /** Hint surfaced on the right of the row — count + viewType. */
  hintCount: string;
  viewType: string;
}

interface StarterViewSelectionInput {
  classCounts: Record<string, number>;
  subjects: number;
  epochs: number;
}

/**
 * Pure function: pick up to three starter views from the dataset's
 * shape. Exported (with `internalsForTesting`) so the selection
 * algorithm is unit-testable without TanStack Query plumbing.
 */
export function selectStarterViews(
  input: StarterViewSelectionInput,
): StarterViewCandidate[] {
  const { classCounts, subjects, epochs } = input;
  const out: StarterViewCandidate[] = [];

  const get = (cls: string): number => classCounts[cls] ?? 0;
  const otrCount = get('ontologyTableRow');
  const treatmentCount = get('treatment') + get('treatment_drug');
  const vmspikeCount = get('vmspikesummary');
  const stimCount =
    get('stimulus_presentation') + get('stimulus_response');

  // 1. Behavioral compare (ontologyTableRow + cohort)
  if (otrCount > 0 && subjects >= 2) {
    out.push({
      slug: 'behavioral-compare',
      title: 'Compare measurements across groups',
      description:
        'Pull behavioural or measurement tables (ontologyTableRow) and compute per-group statistics with a violin overlay.',
      hintCount: `${formatNumber(otrCount)} rows`,
      viewType: 'violin',
    });
  }

  // 2. Treatment timeline
  if (treatmentCount > 0) {
    out.push({
      slug: 'treatment-timeline',
      title: 'Plot the treatment timeline',
      description:
        'Render a per-subject Gantt of treatments — explicit dates when the dataset carries them, ordinal order otherwise.',
      hintCount: `${formatNumber(treatmentCount)} treatments`,
      viewType: 'gantt',
    });
  }

  // 3. Signal trace
  if (out.length < 3 && epochs > 0) {
    out.push({
      slug: 'signal-viewer',
      title: 'Plot a signal trace',
      description:
        'Open the patch-Vm / position / spike-rate trace from any binary recording in the dataset.',
      hintCount: `${formatNumber(epochs)} epochs`,
      viewType: 'signal',
    });
  }

  // 4. PSTH
  if (out.length < 3 && vmspikeCount > 0 && stimCount > 0) {
    out.push({
      slug: 'psth',
      title: 'Compute a PSTH around stimulus events',
      description:
        'Align spike rates to stimulus onsets across trials and render the peri-stimulus time histogram.',
      hintCount: `${formatNumber(vmspikeCount)} units`,
      viewType: 'psth',
    });
  }

  // 5. Spike raster (only if PSTH wasn't already picked)
  if (
    out.length < 3 &&
    vmspikeCount > 0 &&
    !out.some((c) => c.slug === 'psth')
  ) {
    out.push({
      slug: 'spike-activity',
      title: 'Show the spike raster',
      description:
        'One vertical tick per spike per unit — the canonical first look at electrophysiology data.',
      hintCount: `${formatNumber(vmspikeCount)} units`,
      viewType: 'raster',
    });
  }

  // 6. Browse subjects — fallback. Always relevant if there are
  //    subjects to filter, even when nothing scientific can be
  //    auto-plotted yet.
  if (out.length < 3 && subjects > 0) {
    out.push({
      slug: 'browse-subjects',
      title: 'Browse the subject roster',
      description:
        'Filter by strain, sex, species, or treatment, then launch any analysis from a selected subject.',
      hintCount: `${formatNumber(subjects)} subjects`,
      viewType: 'table',
    });
  }

  return out.slice(0, 3);
}

/**
 * For very thin datasets (no matches across the six candidates),
 * render a graceful placeholder pointing users at the Document
 * Explorer instead of an empty section. Rare in practice — every
 * dataset we ship has either subjects or measurements — but the
 * empty path needs to render something legible.
 */
function EmptyStarterViews({ datasetId }: { datasetId: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 text-[14px] text-fg-secondary leading-relaxed">
      No starter views match this dataset&rsquo;s shape yet. Open the{' '}
      <a
        href={`/datasets/${datasetId}/documents`}
        className="text-ndi-teal hover:underline font-semibold"
      >
        Document Explorer
      </a>{' '}
      to browse the raw documents, or hit the{' '}
      <a
        href={`/my/workspace/${datasetId}/analyses`}
        className="text-ndi-teal hover:underline font-semibold"
      >
        Analyses tab
      </a>{' '}
      to try a panel directly.
    </div>
  );
}

export function StarterViewsSection({ datasetId }: StarterViewsSectionProps) {
  const summary = useDatasetSummary(datasetId);
  const classCounts = useClassCounts(datasetId);

  const isLoading = summary.isLoading || classCounts.isLoading;

  const picks = useMemo<StarterViewCandidate[]>(() => {
    if (!summary.data || !classCounts.data) return [];
    return selectStarterViews({
      classCounts: classCounts.data.classCounts,
      subjects: summary.data.counts.subjects,
      epochs: summary.data.counts.epochs,
    });
  }, [summary.data, classCounts.data]);

  if (isLoading) {
    // Skeleton — three placeholder rows so the section's height
    // matches the resolved state and the page doesn't reflow.
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="grid grid-cols-[56px_1fr_auto] gap-6 items-center px-8 py-7 border-t first:border-t-0 border-border-subtle"
          >
            <Skeleton className="h-4 w-8" />
            <div className="space-y-2 min-w-0">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (picks.length === 0) {
    return <EmptyStarterViews datasetId={datasetId} />;
  }

  // Unified container — same pattern as the marketing home's
  // BridgeRow stack. Internal dividers come from each card's
  // `border-t first:border-t-0`.
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden shadow-sm">
      {picks.map((pick, i) => (
        <StarterViewCard
          key={pick.slug}
          num={String(i + 1).padStart(2, '0')}
          title={pick.title}
          description={pick.description}
          // Phase D will add `#${pick.slug}` anchors once the panels
          // carry matching headingIds. For Phase B we route to the
          // tab; users scroll to the relevant panel.
          href={`/my/workspace/${datasetId}/analyses`}
          hint={{ count: pick.hintCount, viewType: pick.viewType }}
        />
      ))}
    </div>
  );
}

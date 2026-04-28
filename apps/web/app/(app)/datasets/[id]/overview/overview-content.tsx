'use client';

/**
 * OverviewContent — the "read this dataset" view for the Overview tab.
 *
 * Three sections (DatasetOverviewCard + DatasetSummaryCard +
 * DatasetProvenanceCard) laid out in a two-column grid: the main
 * "Details" card on the left, summary pills + provenance on the right.
 *
 * Mirrors `ndi-data-browser-v2/frontend/src/pages/DatasetDetailPage.tsx`
 * `OverviewTab` (lines 238-308 in source). Phase 6.6 REBUILD-3c lifts
 * this from a Phase 3b placeholder into a source-faithful Overview.
 *
 * **Degraded-summary fallback (post-PR #102 smoke-test)**: when the
 * backend synthesizer's stage-1 counts/metadata calls time out on
 * large datasets, the response carries all-zero counts + null per-
 * class facts + extractionWarnings. Without intervention, the Summary
 * card directly contradicts the hero band ("78,687 docs · 1,656
 * subjects" up top vs "0 / 0 / Not applicable" in the sidecar).
 * `enrichDegradedSummary()` splices the dataset record's raw fields
 * (numberOfSubjects, documentCount, species, brainRegions, totalSize,
 * createdAt, citation) into the degraded shape so the card renders
 * the basics. The original extractionWarnings carry forward so the
 * footer's warnings tooltip still surfaces the underlying timeout
 * for operators.
 *
 * **Provenance card silent-load**: provenance is non-essential
 * (branches/dependencies — most datasets don't have any). The first-
 * paint skeleton is what the user perceives as "perpetually loading";
 * it shows for the full 60s apiFetch timeout. Switched to render-
 * on-success-only so during the load window the slot is empty
 * rather than skeleton-filled. Same data still arrives (or fails
 * silently per the original "errors degrade silently" contract); the
 * UX no longer signals a stuck wait.
 */
import { useMemo } from 'react';

import {
  useClassCounts,
  useDataset,
  useDatasetProvenance,
  useDatasetSummary,
} from '@/lib/api/datasets';
import { DatasetOverviewCard } from '@/components/datasets/DatasetOverviewCard';
import { DatasetProvenanceCard } from '@/components/datasets/DatasetProvenanceCard';
import { DatasetSummaryCard } from '@/components/datasets/DatasetSummaryCard';
import { ErrorState } from '@/components/errors/ErrorState';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { enrichDegradedSummary, isDegraded } from '@/lib/data/summary-fallback';

export function OverviewContent({ datasetId }: { datasetId: string }) {
  const ds = useDataset(datasetId);
  const summary = useDatasetSummary(datasetId);
  const provenance = useDatasetProvenance(datasetId);
  // 2026-04-28 — class counts pulled in here so we can correct the
  // synthesizer's +1 sessions count on datasets that publish only the
  // `session_in_a_dataset` wrapper class (one per dataset). See
  // `displaySummary` memo below for the correction logic.
  const classCounts = useClassCounts(datasetId);

  // Smoke-test feedback: the sidecar appeared empty when summary or
  // provenance errored, because `isLoading` (TanStack Query 5) is
  // `isPending && isFetching` — false the moment a query's first
  // attempt errors out. With the new zero-retry hooks the error path
  // is reached on the first attempt; we use `isPending` (no data, no
  // success yet) for the "first paint" skeleton instead so a slow but
  // not-yet-errored fetch keeps showing the skeleton until it resolves
  // either way.
  //
  // `isPending && !data` = "we have no data yet, still in flight".
  // `isError`            = "first attempt failed; surface a retry".
  // `data`               = "render the card".
  const summaryShowSkeleton = summary.isPending && !summary.data;

  // Compute the display summary: when /summary returns degraded data
  // (counts all zero + extractionWarnings, the structural fingerprint
  // of a stage-1 backend timeout), splice in the dataset record's
  // raw fields so the Summary card renders the basics instead of
  // contradicting the hero with "0 documents · 0 subjects ·
  // Not applicable" everywhere. See `summary-fallback.ts` for the
  // field-level rules; preserving extractionWarnings means the
  // existing "X warnings" tooltip continues to surface the
  // underlying issue for operators.
  const displaySummary = useMemo(() => {
    if (!summary.data) return undefined;
    let s = summary.data;
    if (isDegraded(s) && ds.data) {
      s = enrichDegradedSummary(s, ds.data);
    }
    // 2026-04-28 — correct +1 session count (team review feedback).
    // Reviewer flagged "an extra session being counted per dataset
    // (at least for Bhar and Haley)." Backend's
    // `dataset_summary_service._counts_from_raw` does
    // `sessions = class_counts.get("session") OR class_counts.get("session_in_a_dataset")`.
    // For datasets that publish only `session_in_a_dataset` (the
    // per-dataset wrapper doc — one per dataset), the OR-fallback
    // returns the wrapper count which is "real recordings + 1 wrapper".
    // The correct read from the same `/class-counts` payload that
    // drives the explorer's class list is:
    //   - prefer `classCounts.session` (the actual recording sessions)
    //   - else if `session_in_a_dataset` matches the synthesizer's
    //     reported count, the synthesizer fell back to the wrapper —
    //     subtract 1 to remove the wrapper from the user-facing total
    // Pure fix on the read side; no backend change required.
    const cc = classCounts.data?.classCounts;
    if (cc) {
      const realSession = cc.session;
      const wrapper = cc.session_in_a_dataset;
      if (typeof realSession === 'number') {
        s = { ...s, counts: { ...s.counts, sessions: realSession } };
      } else if (
        typeof wrapper === 'number' &&
        s.counts.sessions === wrapper
      ) {
        s = {
          ...s,
          counts: { ...s.counts, sessions: Math.max(0, wrapper - 1) },
        };
      }
    }
    return s;
  }, [summary.data, ds.data, classCounts.data]);

  return (
    // 2026-04-28 — breakpoint dropped from `lg:` (1024px) to `md:`
    // (768px). At 200% Safari zoom on 32" 4K (CSS viewport
    // ~960-1080px), `lg:` was just below the threshold, stacking
    // overview vertically and burying the abstract under the sidecar
    // pills. `md:` keeps abstract + sidecar side-by-side from 768px
    // upward, restoring v2's effective behavior at high-zoom levels.
    <div className="grid gap-5 md:grid-cols-[1fr_360px] min-w-0">
      {/* ── Main column: details (abstract + authors + pubs + cite) ── */}
      <div className="space-y-4 min-w-0 order-2 md:order-1">
        {ds.isPending && !ds.data && <CardSkeleton />}
        {ds.isError && (
          // Source data-browser used `<ErrorState onRetry={…} />` for a
          // typed-error UI with a retry button (visual-comparison audit
          // #6 — port had degraded this to a static "Couldn't load
          // dataset {id}" line with no actionable affordance). Restored
          // so a Railway flap mid-session is recoverable in-place
          // rather than requiring a hard refresh.
          <ErrorState error={ds.error} onRetry={() => ds.refetch()} />
        )}
        {ds.data && (
          <DatasetOverviewCard
            ds={ds.data}
            datasetId={datasetId}
            summary={summary.data}
          />
        )}
      </div>

      {/* ── Sidecar: summary pills + provenance ─────────────────────── */}
      <aside className="space-y-4 min-w-0 order-1 md:order-2">
        {summaryShowSkeleton && <CardSkeleton />}
        {summary.isError && (
          // Audit #6 — summary errors were swallowed silently so a
          // synthesizer outage left users staring at an empty sidebar
          // with no signal what happened.
          <ErrorState
            error={summary.error}
            onRetry={() => summary.refetch()}
          />
        )}
        {/* Render the (possibly enriched) display summary. When
            `displaySummary` differs from `summary.data`, it's because
            we spliced in raw record fields to compensate for backend
            stage-1 timeouts — see overview-content.tsx header docstring
            and `summary-fallback.ts` for the full rationale. */}
        {displaySummary && <DatasetSummaryCard summary={displaySummary} />}

        {/* Plan B B5 — dataset provenance card (derivation graph,
            cross-dataset depends_on edges, branches).
            **Silent-load**: render only on success. Provenance is
            non-essential (most datasets have no branches/dependencies);
            the previous render-skeleton-then-card pattern showed a
            CardSkeleton for the full 60s apiFetch timeout window on
            slow upstream queries — perceived by users as "perpetually
            loading." With render-on-success-only, the slot is empty
            during the load (no UI signal of a stuck wait), and the
            card pops in once data arrives or stays absent if the
            backend can't compute provenance (the typed error case is
            non-actionable for the user — they just don't get a
            provenance card, which is fine because most datasets
            don't have one anyway). Errors degrade silently per the
            original "errors on provenance never block the detail
            view" contract from the source data-browser. */}
        {provenance.data && (
          <DatasetProvenanceCard provenance={provenance.data} />
        )}
      </aside>
    </div>
  );
}

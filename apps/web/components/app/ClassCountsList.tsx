'use client';

/**
 * ClassCountsList — sidebar component listing every NDI document class
 * present in a dataset, sorted by count, with a horizontal progress bar
 * per class showing its share of the total.
 *
 * Ported from the inline component inside
 * `ndi-data-browser-v2/frontend/src/pages/DatasetDetailPage.tsx`
 * (extracted to its own file so DocumentExplorer can mount it without
 * dragging the whole DatasetDetailPage into the import graph). One
 * monorepo adaptation: react-router-dom `<Link>` → Next's `<Link>`.
 *
 * 2026-04-28 — routing rule simplified. Previously the sidebar split
 * its links: `subject` / `element` / `element_epoch` / `treatment` /
 * `openminds_subject` / `probe_location` (the six "summary" classes)
 * routed to `/datasets/[id]/tables/[className]`, the rest to
 * `/datasets/[id]/documents?class=...`. The intent was helpful — point
 * users to the rich table view when one exists — but in practice it
 * yanked the user OUT of the Document Explorer they were already
 * inside, dropping them onto the Summary Tables tab. Confusing
 * because the click looked like a filter ("filter the explorer to
 * subject docs") and behaved like a tab swap.
 *
 * New rule: every class link stays in the explorer. Click a class →
 * the explorer's class filter applies. Users wanting the rich summary
 * tables can still get there via the top tab bar's "Summary tables"
 * entry, which is the correct (singular) discovery surface for that
 * view.
 */
import Link from 'next/link';
import { FileText } from 'lucide-react';

import { formatNumber } from '@/lib/format';

/**
 * 2026-04-29 — round-2 team review: "There is an extra session being
 * counted per dataset (at least for Bhar)". Investigation found this
 * came from the Document Explorer sidebar listing TWO adjacent class
 * rows for Bhar: `session: 2` and `session_in_a_dataset: 1`. The eye
 * scans both and reads "3 sessions". But `session_in_a_dataset` is an
 * internal NDI manifest/wrapper class — its data fields are pure
 * bookkeeping (`session_id`, `session_reference`, `session_creator`,
 * `session_creator_input1..6`, `is_linked`), one doc per dataset,
 * NOT a recording session in the user-facing sense. The overview
 * hero already excludes it (PR #129); the sidebar should too.
 *
 * Hiding it from the sidebar (rather than relabeling) is the right
 * move — the wrapper has no useful drilldown for an end user; the
 * Document Explorer's `?class=session_in_a_dataset` filter would
 * land them on a single doc full of internal references they can't
 * act on. Anyone who wants to inspect the wrapper directly can still
 * navigate via direct URL.
 *
 * The set is exhaustive against currently-observed wrapper classes
 * across all 8 published datasets; new wrappers would need an
 * explicit add. Intentionally NOT a regex / heuristic — we want a
 * deliberate, audited list rather than a class-name pattern that
 * might silently swallow content classes named with `_dataset`
 * suffix in the future.
 */
const HIDDEN_WRAPPER_CLASSES: ReadonlySet<string> = new Set([
  'session_in_a_dataset',
]);

export interface ClassCountsListProps {
  datasetId: string;
  data: { totalDocuments: number; classCounts: Record<string, number> };
}

export function ClassCountsList({ datasetId, data }: ClassCountsListProps) {
  // Strip wrapper classes BEFORE sorting so they never appear in the
  // sidebar list. The total document count below the heading still
  // reflects the cloud's true total (including the wrapper) — that
  // number is the catalog-side "this dataset has N documents" claim
  // and shouldn't suddenly diverge from what other UI surfaces show.
  // Only the per-class breakdown drops the wrapper entries.
  const filtered = Object.entries(data.classCounts).filter(
    ([cls]) => !HIDDEN_WRAPPER_CLASSES.has(cls),
  );
  const sorted = filtered.sort((a, b) => b[1] - a[1]);
  const total = Math.max(1, data.totalDocuments);
  return (
    <>
      <p className="mb-2 text-[11px] text-fg-muted font-mono">
        {formatNumber(data.totalDocuments)} documents total
      </p>
      <ul className="space-y-1">
        {/* 2026-04-28 — `slice(0, 25)` removed (team review feedback).
            The cap was a defensive guard against a pathological dataset
            with hundreds of classes flooding the sidebar, but in
            practice all real-world NDI datasets have ≤ ~30 classes,
            and the cap was silently hiding rare-but-real classes
            from the user. Show all classes; if a future dataset ever
            blows past 50 we can revisit with a search filter inside
            the explorer rather than a silent truncation. */}
        {sorted.map(([cls, n]) => {
          const pct = (n / total) * 100;
          // Every class stays in the explorer (see file docstring for
          // why this used to split). The class-filter URL form is the
          // explorer's stable contract — `?class=<cls>` becomes the
          // active filter chip.
          const href = `/datasets/${datasetId}/documents?class=${encodeURIComponent(cls)}`;
          return (
            <li key={cls} className="text-xs">
              <Link
                href={href}
                className="flex items-center gap-2 hover:text-ndi-teal transition-colors"
              >
                {/* 2026-04-28 (round 2) — class names are truncated with
                 * an ellipsis when they overflow the sidebar column.
                 * Reverts the Phase 6.6 PR-H "show full name; wrap if
                 * needed" choice (team review feedback): long class
                 * names like `stimulus_response_scalar_parameters_…`
                 * pushed the document-count number off-screen and
                 * stacked rows onto multiple visual lines, breaking
                 * the dense at-a-glance scan the list is meant to
                 * support. The truncated cell shows `…` at overflow,
                 * the full name is in `title=` for hover, and the
                 * count + icon are now `shrink-0` so they always
                 * remain visible regardless of name length.
                 *
                 * `min-w-0` on the truncating span is required because
                 * flex children default to min-content min-width, which
                 * would otherwise let the long name push past the row's
                 * available width. */}
                <span
                  className="font-mono truncate min-w-0 flex-1"
                  title={cls}
                >
                  {cls}
                </span>
                <span className="text-fg-muted shrink-0">{formatNumber(n)}</span>
                <FileText className="h-3 w-3 text-fg-muted shrink-0" aria-hidden />
              </Link>
              <div
                className="mt-0.5 h-1 rounded bg-bg-muted overflow-hidden"
                role="progressbar"
                aria-label={`${cls} ${formatNumber(n)} of ${formatNumber(data.totalDocuments)}`}
              >
                <div
                  className="h-1 rounded bg-ndi-teal"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

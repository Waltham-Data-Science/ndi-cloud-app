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

export interface ClassCountsListProps {
  datasetId: string;
  data: { totalDocuments: number; classCounts: Record<string, number> };
}

export function ClassCountsList({ datasetId, data }: ClassCountsListProps) {
  const sorted = Object.entries(data.classCounts).sort((a, b) => b[1] - a[1]);
  const total = Math.max(1, data.totalDocuments);
  return (
    <>
      <p className="mb-2 text-[11px] text-fg-muted font-mono">
        {formatNumber(data.totalDocuments)} documents total
      </p>
      <ul className="space-y-1">
        {sorted.slice(0, 25).map(([cls, n]) => {
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
                {/* Phase 6.6 PR-H polish: dropped `truncate` — class names
                 * (`subject`, `element_epoch`, `openminds_subject`,
                 * `probe_location`, etc.) need to be fully visible since
                 * they're the entry point to the documents tab and the
                 * tables grid. The list is in a fixed-width column;
                 * `break-words` lets a long class name wrap if needed
                 * rather than getting cut off mid-name. */}
                <span className="font-mono break-words flex-1">{cls}</span>
                <span className="text-fg-muted">{formatNumber(n)}</span>
                <FileText className="h-3 w-3 text-fg-muted" aria-hidden />
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

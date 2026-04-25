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
 * Routing rule: `subject` / `element` / `element_epoch` / `treatment` /
 * `openminds_subject` / `probe_location` are "summary" classes that have
 * a rich table view at `/datasets/[id]/tables/[className]`. Everything
 * else routes to `/datasets/[id]/documents?class=...` for the raw
 * document list.
 */
import Link from 'next/link';
import { FileText, Globe } from 'lucide-react';

import { formatNumber } from '@/lib/format';

const COMMON_CLASSES = [
  'subject',
  'element',
  'element_epoch',
  'treatment',
  'openminds_subject',
  'probe_location',
];

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
          const isSummary = COMMON_CLASSES.includes(cls);
          // Route summary classes to the rich table view; the rest go
          // through the Raw Documents list with a class filter.
          const href = isSummary
            ? `/datasets/${datasetId}/tables/${cls}`
            : `/datasets/${datasetId}/documents?class=${encodeURIComponent(cls)}`;
          return (
            <li key={cls} className="text-xs">
              <Link
                href={href}
                className="flex items-center gap-2 hover:text-ndi-teal transition-colors"
              >
                <span className="font-mono truncate flex-1">{cls}</span>
                <span className="text-fg-muted">{formatNumber(n)}</span>
                {isSummary && <FileText className="h-3 w-3 text-fg-muted" aria-hidden />}
                {!isSummary && <Globe className="h-3 w-3 text-fg-muted" aria-hidden />}
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

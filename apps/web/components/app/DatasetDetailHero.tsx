'use client';

/**
 * Dataset detail hero — renders dataset name, byline (contributors +
 * date), license + DOI badges, and primary action buttons (cite,
 * use-this-data). Phase 3b minimum-viable hero — Phase 3+ polish layers
 * the cite/use-this-data modal connections + provenance hint.
 *
 * Uses `useDataset()` directly (no prefetch from the layout RSC because
 * App Router layouts don't share fetched data with their children's
 * routes). Renders skeletons during load; falls back to dataset id as
 * heading text if the fetch fails (the page below the hero stays
 * usable; you can still navigate tabs).
 */
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDataset } from '@/lib/api/datasets';
import { formatDate } from '@/lib/format';

export function DatasetDetailHero({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useDataset(datasetId);

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: 'var(--grad-depth)' }}
      aria-labelledby="dataset-hero-h1"
    >
      <div className="relative mx-auto max-w-[1200px] px-7 py-10">
        <Link
          href="/datasets"
          className="inline-flex items-center gap-1 text-[12.5px] text-white/70 hover:text-white transition-colors mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Data Commons
        </Link>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : isError || !data ? (
          <h1
            id="dataset-hero-h1"
            className="text-[1.75rem] md:text-[2rem] font-display font-bold tracking-tight leading-tight"
          >
            {datasetId}
          </h1>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge variant="pub">● Published</Badge>
              {data.license && (
                <Badge variant="outline" className="font-mono normal-case bg-white/10 ring-white/20 text-white/85">
                  {data.license}
                </Badge>
              )}
              {data.branchName && data.branchName !== 'original' && (
                <Badge variant="teal" className="font-mono normal-case">
                  {data.branchName}
                </Badge>
              )}
            </div>

            <h1
              id="dataset-hero-h1"
              className="text-[1.75rem] md:text-[2rem] font-display font-bold tracking-tight leading-tight mb-3 max-w-3xl"
            >
              {data.name}
            </h1>

            {(data.contributors?.length || data.uploadedAt || data.createdAt) && (
              <p className="text-[13px] text-white/70 max-w-3xl">
                {data.contributors && data.contributors.length > 0 && (
                  <>
                    {data.contributors
                      .slice(0, 3)
                      .map((c) =>
                        [c.firstName, c.lastName].filter(Boolean).join(' '),
                      )
                      .filter(Boolean)
                      .join(', ')}
                    {data.contributors.length > 3 &&
                      ` +${data.contributors.length - 3}`}
                  </>
                )}
                {data.contributors && data.contributors.length > 0 && (data.uploadedAt || data.createdAt) && (
                  <span className="mx-2 text-white/40">·</span>
                )}
                {(data.uploadedAt || data.createdAt) && (
                  <span>
                    {formatDate(data.uploadedAt || data.createdAt!)}
                  </span>
                )}
                {data.doi && (
                  <>
                    <span className="mx-2 text-white/40">·</span>
                    <span className="font-mono text-white/55">
                      {data.doi.replace(/^https?:\/\//, '')}
                    </span>
                  </>
                )}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

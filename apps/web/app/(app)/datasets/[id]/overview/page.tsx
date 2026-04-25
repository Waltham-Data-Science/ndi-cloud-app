/**
 * Dataset detail Overview tab — Phase 3a shell.
 *
 * **Pre-renders the top-20 most-trafficked datasets at build time**
 * via `generateStaticParams` against the same `/api/datasets/published`
 * endpoint the catalog uses. Result:
 *   - Top-20 dataset detail URLs ship as pre-built static HTML (free
 *     SEO + sub-50ms first paint at the edge).
 *   - The other dataset URLs fall through to on-demand ISR with
 *     `revalidate: 60` — first request renders + caches, subsequent
 *     requests hit the edge.
 *
 * `dynamicParams: true` (the default) is what makes that fall-through
 * work. If `INTERNAL_API_URL` is unset (dev / cold builds), we return
 * an empty params list so every dataset URL hits ISR — equivalent
 * behavior, just without the build-time prewarm.
 *
 * Phase 3b builds the actual Overview UI (DatasetSummaryCard + cite
 * modal + provenance graph + species/region pills). This file is the
 * minimal shell that the redirect at `/datasets/[id]` lands on.
 */
import type { Metadata } from 'next';

import {
  fetchPublishedDatasets,
  type DatasetListResponse,
} from '@/lib/api/datasets';
import { env } from '@/lib/env';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

const TOP_N_PRERENDER = 20;

/**
 * Pre-render the top-N most-trafficked dataset detail routes at build
 * time. Anonymous-public read (no cookies); failures fall through to
 * `[]` so a transient Railway 5xx can't fail the whole build.
 */
export async function generateStaticParams() {
  if (!env.INTERNAL_API_URL) return [];
  try {
    const list: DatasetListResponse = await fetchPublishedDatasets(
      env.INTERNAL_API_URL,
      1,
      TOP_N_PRERENDER,
    );
    return list.datasets.map((d) => ({ id: d.id }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Dataset · NDI Cloud`,
    alternates: { canonical: `/datasets/${id}/overview` },
  };
}

export default async function DatasetOverviewPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div
      className="px-7 py-12 bg-bg-canvas"
      aria-labelledby="dataset-overview-h1"
    >
      <div className="mx-auto max-w-[1200px]">
        <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
          Dataset · Overview
        </div>
        <h1
          id="dataset-overview-h1"
          className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-4"
        >
          {id}
        </h1>
        <p className="text-fg-secondary text-sm">
          Phase 3a shell. Phase 3b lands the dataset hero + tab bar +
          summary card + provenance graph.
        </p>
      </div>
    </div>
  );
}

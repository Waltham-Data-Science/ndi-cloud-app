/**
 * Dataset detail Overview tab.
 *
 * Renders the ported overview content (DatasetSummaryCard,
 * DatasetProvenanceCard, abstract, class counts, cite + use-this-data
 * modals) via `<OverviewContent>` (Phase 6.6 REBUILD-3c).
 *
 * **Pre-renders the top-20 most-trafficked datasets at build time** via
 * `generateStaticParams` against `/api/datasets/published`. Top-20 detail
 * URLs ship as static HTML; the rest fall through to on-demand ISR with
 * `revalidate: 60`.
 */
import type { Metadata } from 'next';

import { OverviewContent } from './overview-content';
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
  // Bare title; root layout's `template: '%s · NDI Cloud'` adds the
  // suffix → "Dataset · NDI Cloud". A2 follow-up #67 (per-dataset
  // titles) intentionally NOT done here yet — see the layout's
  // header comment for the Next.js 16.2 InvariantError that crashed
  // the previous attempts. Per-dataset title via the leaf page is the
  // safer composition; needs a small spike with the test deploy.
  return {
    title: 'Dataset',
    alternates: { canonical: `/datasets/${id}/overview` },
  };
}

export default async function DatasetOverviewPage({ params }: PageProps) {
  const { id } = await params;
  return <OverviewContent datasetId={id} />;
}

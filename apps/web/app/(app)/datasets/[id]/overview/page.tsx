/**
 * Dataset detail Overview tab — Phase 3b structural shell.
 *
 * **Pre-renders the top-20 most-trafficked datasets at build time**
 * via `generateStaticParams` against `/api/datasets/published`. Top-20
 * detail URLs ship as static HTML; the rest fall through to on-demand
 * ISR with `revalidate: 60`.
 *
 * Phase 3b lays the hero + tab bar around this page (in `[id]/layout.tsx`).
 * The Overview-specific content (DatasetSummaryCard, DatasetProvenanceCard,
 * abstract + class counts) lands in a follow-up port — it depends on
 * `components/datasets/DatasetSummaryCard.tsx` (533 LOC) +
 * `DatasetProvenanceCard.tsx` (264 LOC) + `CiteModal.tsx` +
 * `UseThisDataModal.tsx`. Phase 3b ships the structural shell so the tab
 * bar a11y gate (#65) can close; content port ships as a separate
 * sub-phase to keep this PR reviewable.
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
  return {
    title: `Dataset · NDI Cloud`,
    alternates: { canonical: `/datasets/${id}/overview` },
  };
}

export default async function DatasetOverviewPage({ params }: PageProps) {
  const { id } = await params;
  return <OverviewContent datasetId={id} />;
}

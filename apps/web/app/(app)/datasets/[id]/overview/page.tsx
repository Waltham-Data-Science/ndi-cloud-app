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
  if (!env.INTERNAL_API_URL) {
    // Dev / test / preview without INTERNAL_API_URL configured: skip
    // prerender silently. Production deploys MUST have it set; the
    // log line below makes the misconfiguration visible in Vercel
    // build logs.
    if (process.env.VERCEL_ENV === 'production') {
      console.error(
        '[generateStaticParams] INTERNAL_API_URL unset in production — top-20 dataset prerender SKIPPED. Every dataset detail will fall through to runtime ISR (slower first paint). Set INTERNAL_API_URL in the Vercel project env.',
      );
    }
    return [];
  }
  try {
    const list: DatasetListResponse = await fetchPublishedDatasets(
      env.INTERNAL_API_URL,
      1,
      TOP_N_PRERENDER,
    );
    if (list.datasets.length === 0) {
      // Empty list → cloud is up but has zero published datasets, OR
      // the response shape changed. Either way, surface it loudly so
      // the deploy log shows we're shipping zero static params.
      console.warn(
        '[generateStaticParams] /api/datasets/published returned 0 datasets — top-20 prerender will produce 0 static pages. Verify the cloud has published datasets and the response shape is unchanged.',
      );
    }
    return list.datasets.map((d) => ({ id: d.id }));
  } catch (err) {
    // Surface the failure in production build logs (audit #5 — was
    // silently returning [] before, so a Railway flap during build
    // dropped the prerender silently). In production this is a
    // hard error condition: the deploy still ships, but ALL detail
    // pages fall through to runtime ISR with cold-cache penalty.
    const message = err instanceof Error ? err.message : String(err);
    if (process.env.VERCEL_ENV === 'production') {
      console.error(
        `[generateStaticParams] Failed to fetch /api/datasets/published for prerender: ${message}. Top-20 dataset prerender SKIPPED — every dataset detail will fall through to runtime ISR.`,
      );
    } else {
      console.warn(
        `[generateStaticParams] Prefetch failed (${message}) — falling back to runtime ISR. Set INTERNAL_API_URL or check Railway availability.`,
      );
    }
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

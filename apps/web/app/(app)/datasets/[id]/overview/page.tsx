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
 *
 * **Per-dataset titles** (audit follow-up #67): generateMetadata fetches
 * the dataset name directly so the document title is `<dataset name> ·
 * NDI Cloud` instead of the generic `Dataset · NDI Cloud`. Earlier
 * attempts to do this from the LAYOUT failed with Next.js 16.2's
 * `InvariantError: The manifests singleton was not initialized` when
 * an async layout-level metadata fetch met a child route's
 * `generateStaticParams`. Doing it from the leaf PAGE — which already
 * has `generateStaticParams` and `revalidate: 60` — sidesteps that
 * boundary because metadata + static-params are co-located on the same
 * route segment. Also INLINES the fetch (no shared helper import) to
 * avoid the previous turbopack bundling failure when the helper lived
 * in a separate `lib/api/datasets-server.ts` module.
 *
 * Failure mode: fetch errors / non-2xx → falls back to bare
 * `'Dataset'`, identical to pre-fix behavior. Title metadata is a
 * best-effort enhancement, never a page-blocker.
 */
import type { Metadata } from 'next';
import { HydrationBoundary } from '@tanstack/react-query';

import { OverviewContent } from './overview-content';
import {
  fetchPublishedDatasets,
  type DatasetListResponse,
} from '@/lib/api/datasets';
import { prefetchDatasetForPage } from '@/lib/api/datasets-prefetch';
import { safeFetchDataset } from '@/lib/api/datasets-server';
import { env } from '@/lib/env';
import { cleanDatasetName } from '@/lib/format';
import { datasetJsonLd } from '@/lib/seo/dataset-jsonld';

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
    // build logs (audit follow-up #5 — silent return [] in production
    // dropped the top-20 prerender with no signal).
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

/**
 * Truncate text at the first sentence boundary up to `max` chars, or
 * hard-cut at `max - 1` + `'…'` if no sentence boundary is reachable.
 * Used for `<meta description>` / `og:description` so the snippet
 * Google shows ends cleanly instead of mid-word.
 */
function truncateAtSentence(raw: string, max: number): string {
  const trimmed = raw.trim();
  if (trimmed.length <= max) return trimmed;
  const window = trimmed.slice(0, max);
  const lastBoundary = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  if (lastBoundary > max * 0.5) {
    return window.slice(0, lastBoundary + 1);
  }
  return window.slice(0, max - 1).trimEnd() + '…';
}

/**
 * Build a per-dataset description for SEO meta tags. Prefers the
 * abstract; falls back to a generic "by <authors> on NDI Cloud" string
 * so search-engine snippets always carry useful signal — never the
 * generic homepage description that the audit flagged for every
 * dataset URL pre-fix.
 */
function descriptionForMetadata(
  data: { abstract?: string; description?: string; contributors?: Array<{ firstName?: string; lastName?: string }> } | null,
): string {
  if (!data) {
    return 'A neuroscience dataset on NDI Cloud — published with openMINDS and NDI metadata, browseable in MATLAB or Python.';
  }
  const abstract = (data.abstract || data.description)?.trim();
  if (abstract) return truncateAtSentence(abstract, 250);
  const authors = (data.contributors ?? [])
    .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' '))
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  if (authors) {
    return `Neuroscience dataset by ${authors} on NDI Cloud — DOI-citable with openMINDS and NDI metadata.`;
  }
  return 'A neuroscience dataset on NDI Cloud — published with openMINDS and NDI metadata, browseable in MATLAB or Python.';
}

/**
 * SEO metadata for `/datasets/[id]/overview`. Per-dataset title,
 * description, openGraph + twitter cards. Reuses the same
 * `safeFetchDataset` cache as the page render (Next's request-scoped
 * fetch cache deduplicates the call within a single SSR), so this
 * doesn't add a second Railway round-trip per page load.
 *
 * Values fall back gracefully when the cloud is slow / unreachable: the
 * title degrades to the bare `'Dataset'` string and the description
 * falls back to a generic NDI Cloud one-liner. Never blocks the page
 * from rendering — metadata is best-effort enhancement.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const dataset = await safeFetchDataset(id);
  const name = dataset?.name ? cleanDatasetName(dataset.name) : null;
  const description = descriptionForMetadata(dataset);
  const canonical = `https://ndi-cloud.com/datasets/${id}/overview`;
  return {
    // Root layout's `title.template: '%s · NDI Cloud'` adds the
    // suffix automatically. Pass the bare dataset name; never include
    // the brand here or it doubles ("X · NDI Cloud · NDI Cloud").
    title: name ?? 'Dataset',
    description,
    alternates: { canonical: `/datasets/${id}/overview` },
    openGraph: {
      type: 'article',
      url: canonical,
      title: name ?? 'Dataset',
      description,
      siteName: 'NDI Cloud',
      images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    },
    twitter: {
      card: 'summary',
      title: name ?? 'Dataset',
      description,
      images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    },
  };
}

export default async function DatasetOverviewPage({ params }: PageProps) {
  const { id } = await params;
  // Existence check + prefetch lives here (not in the parent layout)
  // so loading.tsx can fire while we await, AND so notFound() picks
  // up the sibling `[id]/not-found.tsx` instead of the global one.
  // See `lib/api/datasets-prefetch.ts` for the full rationale.
  const dehydratedState = await prefetchDatasetForPage(id);
  // Read the dataset record for SEO JSON-LD. Same Railway URL as the
  // prefetch above — Next's request-scoped fetch cache deduplicates
  // within this render, so this is free (cached body, no extra
  // round-trip). `null` means the cloud was slow / unreachable; in
  // that case we skip the JSON-LD rather than emitting a half-formed
  // structured-data document. The page still renders fine; Google
  // Dataset Search just won't pick this dataset up until the next
  // ISR rebuild gets a successful fetch.
  const dataset = await safeFetchDataset(id);
  return (
    <HydrationBoundary state={dehydratedState}>
      {dataset && (
        <script
          type="application/ld+json"
          // JSON-LD structured data — never executable; the
          // `dangerouslySetInnerHTML` pattern is the standard way to
          // emit it as a script tag with type="application/ld+json".
          // The content is a JSON.stringify of a plain object built
          // from the cloud record by `datasetJsonLd` (no user input
          // reaches this attribute outside the curated cloud fields).
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(datasetJsonLd(dataset, id)),
          }}
        />
      )}
      <OverviewContent datasetId={id} />
    </HydrationBoundary>
  );
}

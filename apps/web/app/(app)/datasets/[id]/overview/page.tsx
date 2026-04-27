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

import { OverviewContent } from './overview-content';
import {
  fetchPublishedDatasets,
  type DatasetListResponse,
} from '@/lib/api/datasets';
import { env } from '@/lib/env';
import { cleanDatasetName } from '@/lib/format';

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

/**
 * Resolve a dataset's display name for the document title. Inlined
 * (not via a shared helper) to keep the import graph minimal — the
 * previous attempt to share a `fetchDatasetServer` helper triggered
 * a turbopack bundling failure when the helper lived alongside
 * `'use client'`-marked exports. This function imports nothing from
 * `lib/api/datasets.ts` — it talks straight to the API.
 *
 * Cloud's detail endpoint returns `_id` on some entries and `id` on
 * others; both are checked. Returns `null` on any failure so the
 * caller can fall back to the generic title.
 *
 * `cache: 'force-cache'` + the page's `revalidate: 60` means the same
 * dataset visited within the revalidate window reuses the cached body
 * — no additional Railway round-trip per metadata generation.
 */
async function fetchDatasetNameForMetadata(
  id: string,
): Promise<string | null> {
  if (!env.INTERNAL_API_URL) return null;
  try {
    const res = await fetch(`${env.INTERNAL_API_URL}/api/datasets/${id}`, {
      headers: { Accept: 'application/json' },
      // Anonymous-public read; no cookie forwarded. Org-private datasets
      // (which would 401 here) get a generic title — acceptable since
      // they're not link-shareable for SEO anyway.
      cache: 'force-cache',
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: unknown };
    if (typeof data.name !== 'string' || data.name.length === 0) return null;
    return cleanDatasetName(data.name);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = await fetchDatasetNameForMetadata(id);
  return {
    // Root layout's `title.template: '%s · NDI Cloud'` adds the suffix
    // automatically. Pass the bare dataset name; never include the
    // brand here or it doubles ("X · NDI Cloud · NDI Cloud").
    title: name ?? 'Dataset',
    alternates: { canonical: `/datasets/${id}/overview` },
  };
}

export default async function DatasetOverviewPage({ params }: PageProps) {
  const { id } = await params;
  return <OverviewContent datasetId={id} />;
}

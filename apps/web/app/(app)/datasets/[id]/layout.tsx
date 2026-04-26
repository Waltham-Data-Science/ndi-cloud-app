/**
 * Dataset detail layout — Phase 3b + REBUILD-8 chrome gate.
 *
 * Wraps every `/datasets/[id]/{overview,tables,pivot,documents}` route
 * with a shared hero band + the from-scratch a11y tab bar (audit #65).
 * The tab bar is URL-routed (`<Link>` + `usePathname`-derived
 * aria-selected), NOT state-controlled — that's the structural fix
 * for the audit.
 *
 * Phase 6.6 REBUILD-8: chrome rendering now goes through
 * `<DatasetDetailChromeGate>`, which conditionally hides the hero +
 * tab bar + constrained-width section on the document-detail URL
 * (`/datasets/[id]/documents/[docId]`). Source had document detail
 * "outside the Outlet" with its own hero; in App Router that's a
 * client-side pathname check rather than a layout sibling, but the
 * UX is identical — document detail drops the dataset chrome entirely.
 *
 * Phase 6.7 A2 (hotfix-revised): `generateMetadata` recovers the
 * source SPA's `useDocumentTitle` per-route title (audit #67). Anon
 * fetch via `INTERNAL_API_URL` — `/api/datasets/{id}` is public-
 * readable for published datasets, which covers the common case.
 *
 * Title resolution:
 *   - INTERNAL_API_URL set + dataset is public → "${name}" (root
 *     layout's `template: '%s · NDI Cloud'` adds the suffix).
 *   - INTERNAL_API_URL unset (dev/test) → "Dataset" → wrapped to
 *     "Dataset · NDI Cloud".
 *   - Fetch fails / dataset is org-private (401) → "Dataset" fallback.
 *
 * **No `cookies()` call** — calling `cookies()` here opted the route
 * into dynamic rendering, which conflicts with the Overview page's
 * `generateStaticParams` (top-20 prerender). The previous version
 * threw `Route used 'cookies' while rendering a static page` and
 * returned a global 500 because errors in `generateMetadata` bypass
 * the `error.tsx` boundary entirely. The trade-off: org-private
 * datasets show the generic title; their actual content still
 * renders fine because the client-side `useDataset` hook carries
 * cookies via apiFetch.
 *
 * Tabs as nested routes (still wired here):
 *   `tables/page.tsx`         → server redirect to ./subject
 *   `tables/[className]/page.tsx`
 *   `pivot/[grain]/page.tsx`
 *   `documents/page.tsx`              → DocumentExplorer (under chrome)
 *   `documents/[docId]/page.tsx`      → standalone (chrome hidden)
 */
import type { Metadata } from 'next';

import { DatasetDetailChromeGate } from '@/components/app/DatasetDetailChromeGate';
import { fetchDatasetServer } from '@/lib/api/datasets';
import { env } from '@/lib/env';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

// Bare title — root layout's `template: '%s · NDI Cloud'` adds the
// suffix automatically. Prevents the `… · NDI Cloud · NDI Cloud`
// duplication this PR also fixes elsewhere.
const FALLBACK_TITLE = 'Dataset';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  // Without INTERNAL_API_URL (dev/test/preview-without-upstream), don't
  // try to fetch — return the generic title so builds don't ping a
  // missing endpoint and time out.
  if (!env.INTERNAL_API_URL) {
    return { title: FALLBACK_TITLE };
  }

  // Anonymous fetch — `/api/datasets/{id}` is public-readable for
  // published datasets. Org-private datasets return 401 →
  // fetchDatasetServer returns null → fallback. NO `cookies()` call:
  // see header comment for the static-prerender conflict story.
  const dataset = await fetchDatasetServer(env.INTERNAL_API_URL, id);

  if (!dataset?.name) {
    return { title: FALLBACK_TITLE };
  }

  // Bare name; root layout's template wraps with " · NDI Cloud".
  return { title: dataset.name };
}

export default async function DatasetDetailLayout({
  children,
  params,
}: LayoutProps) {
  const { id } = await params;
  return (
    <DatasetDetailChromeGate datasetId={id}>{children}</DatasetDetailChromeGate>
  );
}

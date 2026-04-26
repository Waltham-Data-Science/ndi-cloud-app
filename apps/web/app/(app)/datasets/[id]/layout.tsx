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
 * Phase 6.7 A2: `generateMetadata` recovers the source SPA's
 * `useDocumentTitle` per-route title (audit follow-up #67). Server-
 * side fetches the dataset name via `INTERNAL_API_URL` (forwarding
 * the caller's cookies so org-private datasets resolve), falls back
 * to a generic "Dataset · NDI Cloud" if the fetch fails or the env
 * isn't wired (dev/test). Layout-level metadata applies to every
 * tab — child pages can override per-tab titles in a future PR.
 *
 * Tabs as nested routes (still wired here):
 *   `tables/page.tsx`         → server redirect to ./subject
 *   `tables/[className]/page.tsx`
 *   `pivot/[grain]/page.tsx`
 *   `documents/page.tsx`              → DocumentExplorer (under chrome)
 *   `documents/[docId]/page.tsx`      → standalone (chrome hidden)
 */
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { DatasetDetailChromeGate } from '@/components/app/DatasetDetailChromeGate';
import { fetchDatasetServer } from '@/lib/api/datasets';
import { env } from '@/lib/env';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

const FALLBACK_TITLE = 'Dataset · NDI Cloud';

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

  // Forward the request's cookies so org-private datasets resolve to
  // their real names instead of falling back. Anonymous public datasets
  // resolve either way; private datasets hit 401 without this.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const dataset = await fetchDatasetServer(
    env.INTERNAL_API_URL,
    id,
    cookieHeader || undefined,
  );

  if (!dataset?.name) {
    return { title: FALLBACK_TITLE };
  }

  return { title: `${dataset.name} · NDI Cloud` };
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

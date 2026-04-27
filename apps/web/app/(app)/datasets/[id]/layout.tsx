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
 * **No `generateMetadata` here.** Phase 6.7 A2 (PR #75) tried to
 * recover the source SPA's `useDocumentTitle` per-route title by
 * adding a layout-level `generateMetadata` that fetched the dataset
 * name. Two production failures resulted:
 *
 *   1. v1 used `cookies()` to forward auth — that opted the route
 *      into dynamic rendering and conflicted with the Overview
 *      page's `generateStaticParams` (top-20 prerender). 500.
 *   2. v2 dropped `cookies()` — but Next.js 16.2 still threw
 *      `InvariantError: The manifests singleton was not initialized`
 *      whenever the layout's async `generateMetadata` tried to fetch
 *      while the child page had `generateStaticParams`. Same 500.
 *
 * Errors thrown in `generateMetadata` bypass the `error.tsx`
 * boundary and surface as the global Next 500 page — so the
 * blast radius was "every dataset detail URL is broken."
 *
 * Per-dataset titles are now set at the LEAF overview page
 * (`overview/page.tsx`) — the safer composition. The fetch is inlined
 * (no shared helper) to dodge the turbopack runtime error that crashed
 * the previous attempt to extract a `lib/api/datasets-server.ts`
 * module. Sibling tabs (tables/documents/pivot) keep generic
 * "Tables · NDI Cloud" titles; the dataset name appears only on the
 * canonical Overview URL since that's the link people share.
 *
 * A2 audit follow-up #67 — CLOSED in this session.
 *
 * Tabs as nested routes:
 *   `tables/page.tsx`         → server redirect to ./subject
 *   `tables/[className]/page.tsx`
 *   `pivot/[grain]/page.tsx`
 *   `documents/page.tsx`              → DocumentExplorer (under chrome)
 *   `documents/[docId]/page.tsx`      → standalone (chrome hidden)
 */
import { DatasetDetailChromeGate } from '@/components/app/DatasetDetailChromeGate';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
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

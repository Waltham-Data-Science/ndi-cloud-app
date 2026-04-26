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
 * Tabs as nested routes (still wired here):
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

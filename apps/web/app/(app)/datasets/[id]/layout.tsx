/**
 * Dataset detail layout — Phase 3b.
 *
 * Wraps every `/datasets/[id]/{overview,tables,pivot,documents}` route
 * with a shared hero band + the from-scratch a11y tab bar (audit #65).
 * The tab bar is URL-routed (`<Link>` + `usePathname`-derived
 * aria-selected), NOT state-controlled — that's the structural fix
 * for the audit. Document detail (`documents/[docId]`) opts OUT via
 * its own nested layout that drops this chrome (matches the
 * data-browser's "outside the Outlet" pattern).
 *
 * Tabs as nested routes (Phase 3b also wires):
 *   `tables/page.tsx`         → server redirect to ./subject
 *   `tables/[className]/page.tsx`
 *   `pivot/[grain]/page.tsx`
 *   `documents/page.tsx`
 *   `documents/[docId]/layout.tsx`  → opt-out wrapper (no tab bar)
 *   `documents/[docId]/page.tsx`
 */
import { DatasetDetailHero } from '@/components/app/DatasetDetailHero';
import { DatasetTabs } from '@/components/app/DatasetTabs';

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
    <>
      <DatasetDetailHero datasetId={id} />
      <DatasetTabs datasetId={id} />
      {/*
        `min-w-0` keeps wide inner tables honest — CSS Grid items default
        to `min-width: auto`, so without this a table wider than the
        viewport would push the whole page wider instead of triggering
        its own overflow-x-auto scroll. (Carried over from data-browser.)
      */}
      <section className="mx-auto max-w-[1200px] px-7 py-7 min-w-0">
        {children}
      </section>
    </>
  );
}

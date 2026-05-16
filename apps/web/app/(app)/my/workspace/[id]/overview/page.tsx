/**
 * `/my/workspace/[id]/overview` — landing tab (Phase A scaffold).
 *
 * Phase A renders just the DatasetStructurePanel for orientation — the
 * minimum-viable Overview that still gives the user the "what's in
 * this dataset" moment we want them to land on. Phase B replaces this
 * page with the full Overview design (stat tiles + provenance band +
 * auto-selected starter view cards) per the redesign doc
 * `apps/web/docs/design/2026-05-16-workspace-redesign.md`.
 *
 * Keeping the existing DatasetStructurePanel as the Phase A content
 * means: the moment we ship the layout split, users still see useful
 * content here (counts + species + brain regions + strains via the
 * panel's existing API) and we haven't blocked the redesign on Phase
 * B being complete. The "more coming soon" callout points users to
 * the Analyses tab where the remaining 6 panels live.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { DatasetStructurePanel } from '@/components/workspace/DatasetStructurePanel';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Overview',
  description:
    'See what is in this dataset: counts, species, regions, strains.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceOverviewPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <section className="mx-auto max-w-[1200px] px-7 py-8 space-y-5">
      <DatasetStructurePanel datasetId={id} />

      {/* Phase A footer — points users at the Analyses tab while the
          richer overview (stat tiles + starter views) is in flight. */}
      <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-4 py-3 text-[13px] text-fg-secondary">
        Plotting, comparisons, and provenance walks live on the{' '}
        <Link
          href={`/my/workspace/${id}/analyses`}
          className="text-ndi-teal hover:underline font-semibold"
        >
          Analyses tab
        </Link>
        . A richer Overview with stat tiles + starter views is coming in
        Phase B of the redesign.
      </div>
    </section>
  );
}

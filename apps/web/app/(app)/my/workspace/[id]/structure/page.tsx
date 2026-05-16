/**
 * `/my/workspace/[id]/structure` — class browser (Phase B build).
 *
 * Replaces the Phase A "Coming Soon" placeholder with the real
 * class browser: every NDI document class in the dataset listed
 * with per-class counts, sortable, filterable, click-to-drill into
 * the Document Explorer with the class pre-selected.
 *
 * The browser itself is a client component (sort + filter state).
 * The page is a server component that just supplies the dataset
 * id and renders the section header.
 *
 * Routing note: classes drill to `/datasets/[id]/documents?class=…`
 * (Document Explorer) rather than the summary-tables surface. The
 * summary-tables endpoint only supports a fixed set of NDI classes
 * (subject / probe / element / element_epoch / treatment /
 * openminds_subject / probe_location); classes outside that set
 * (ontologyTableRow, imageStack, generic_file, …) wouldn't have a
 * tables URL to route to. The Document Explorer accepts every
 * class so the drill path stays uniform.
 */
import type { Metadata } from 'next';

import { StructureBrowser } from '@/components/workspace/StructureBrowser';
import { WorkspaceSectionHeader } from '@/components/workspace/WorkspaceSectionHeader';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Structure',
  description:
    'Browse every NDI document class in this dataset with counts and drill-in.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceStructurePage({ params }: PageProps) {
  const { id } = await params;
  return (
    <section className="mx-auto max-w-[1200px] px-7 py-10">
      <WorkspaceSectionHeader
        eyebrow="Dataset structure"
        title="Every document class, every count"
        description="The shape of this dataset at the NDI document level. Sort by count or name, filter to a class family, and click any row to open it in the Document Explorer."
      />
      <StructureBrowser datasetId={id} />
    </section>
  );
}

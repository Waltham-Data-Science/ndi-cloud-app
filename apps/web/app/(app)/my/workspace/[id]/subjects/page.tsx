/**
 * `/my/workspace/[id]/subjects` — subject browser (Phase C build).
 *
 * Replaces the Phase A "Coming Soon" placeholder with the full
 * filter + virtualised table + view-actions workhorse. This is the
 * tab where most filter-and-drill scientific workflow lands per the
 * MATLAB tutorial analysis — the implementation mirrors the
 * tutorial's flow:
 *
 *   1. Filter the roster (StrainName contains PR811 → 76 rows)
 *   2. Click a subject row → ViewActionsRail appears
 *   3. Launch an analysis with the subject id pre-filled
 *
 * The browser itself is a client component (URL state + table). The
 * page is a server component that supplies the dataset id and the
 * section header.
 */
import type { Metadata } from 'next';

import { SubjectsBrowser } from '@/components/workspace/SubjectsBrowser';
import { WorkspaceSectionHeader } from '@/components/workspace/WorkspaceSectionHeader';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Subjects',
  description:
    'Filter and drill into subjects; launch analyses from a selection.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceSubjectsPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <section className="mx-auto max-w-[1200px] px-7 py-10">
      <WorkspaceSectionHeader
        eyebrow="Subject roster"
        title="Filter, drill, launch"
        description="Filter the dataset's subjects by strain, species, or sex. Select a row to surface the analyses you can run scoped to that subject — Signal trace, Treatment timeline, Spike raster, Behavioural compare."
      />
      <SubjectsBrowser datasetId={id} />
    </section>
  );
}

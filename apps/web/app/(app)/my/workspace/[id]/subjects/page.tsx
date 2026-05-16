/**
 * `/my/workspace/[id]/subjects` — subject browser (Phase A scaffold).
 *
 * Phase C fills this with the filter + virtualised table + selection
 * state + per-row "view actions" rail that's the most important tab
 * of the redesign (where ~80% of workflow lands per the MATLAB
 * tutorial mental-model audit). Phase A points users at the existing
 * `/datasets/[id]/tables/subject` summary-tables surface, which is
 * the same backend data feed the Phase C tab will consume.
 */
import type { Metadata } from 'next';
import { Users2 } from 'lucide-react';

import { WorkspaceComingSoonPlaceholder } from '@/components/workspace/WorkspaceComingSoonPlaceholder';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Subjects',
  description: 'Filter and drill into subjects; launch analyses from a selection.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceSubjectsPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <WorkspaceComingSoonPlaceholder
      tabName="Subjects"
      icon={Users2}
      description="The Subjects tab will be the workhorse surface — filter the subject roster, drill into a single subject, and launch any of the chart panels with that subject's id pre-filled. Mirrors the filter-and-drill flow the MATLAB tutorials use."
      planned={[
        'Filter by strain, species, sex, treatment, age',
        'Virtualised paginated table for large rosters (Bhar 5,314 / Haley 1,656)',
        'URL-state-driven selection: shareable, deep-linkable',
        'View Actions rail — open Signal / Spike raster / Treatment timeline scoped to the selected subject',
      ]}
      alternative={{
        label: 'Subject table',
        href: `/datasets/${id}/tables/subject`,
        description:
          'The existing summary table for the subject class. Same row set the Phase C tab will consume — filter is client-side for now; analysis launch will be wired in Phase C.',
      }}
    />
  );
}

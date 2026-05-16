/**
 * `/my/workspace/[id]/sessions` — session/epoch browser (Phase A scaffold).
 *
 * Phase C ships the full implementation alongside the Subjects tab —
 * same filter + table + selection + view-actions shape, different
 * grain. Phase A points users at the existing element_epoch summary
 * table, which is the same backend data feed.
 */
import type { Metadata } from 'next';
import { Microscope } from 'lucide-react';

import { WorkspaceComingSoonPlaceholder } from '@/components/workspace/WorkspaceComingSoonPlaceholder';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Sessions',
  description:
    'Filter and drill into sessions / epochs; launch analyses from a selection.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceSessionsPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <WorkspaceComingSoonPlaceholder
      tabName="Sessions"
      icon={Microscope}
      description="The Sessions tab will be the session-and-epoch counterpart to Subjects — filter by time, probe type, subject; drill to a single session/epoch; launch Signal / PSTH / Electrode position scoped to that epoch."
      planned={[
        'Filter by time window (e.g. global_t0 contains Jun-2023)',
        'Filter by probe type, by subject, by approach',
        'Virtualised paginated table for large epoch rosters (Francesconi 4,887)',
        'View Actions rail — open Signal trace / PSTH / Electrode position scoped to the selected epoch',
      ]}
      alternative={{
        label: 'Epoch table',
        href: `/datasets/${id}/tables/element_epoch`,
        description:
          'The existing summary table for the element_epoch class. Same row set the Phase C tab will consume — filter is client-side for now; analysis launch will be wired in Phase C.',
      }}
    />
  );
}

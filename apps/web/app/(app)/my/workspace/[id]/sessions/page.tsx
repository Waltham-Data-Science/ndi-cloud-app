/**
 * `/my/workspace/[id]/sessions` — session/epoch browser (Phase C
 * build).
 *
 * Replaces the Phase A "Coming Soon" placeholder with the session-
 * grain counterpart to the Subjects tab. Filter by subject id, time
 * window (matches `global_t0 contains Jun-2023` from the tutorial),
 * or probe id; select an epoch; launch Signal trace / PSTH / Electrode
 * position scoped to that epoch.
 */
import type { Metadata } from 'next';

import { SessionsBrowser } from '@/components/workspace/SessionsBrowser';
import { WorkspaceSectionHeader } from '@/components/workspace/WorkspaceSectionHeader';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Sessions',
  description:
    'Filter and drill into sessions/epochs; launch analyses from a selection.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceSessionsPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <section className="mx-auto max-w-[1200px] px-7 py-10">
      <WorkspaceSectionHeader
        eyebrow="Recording sessions"
        title="Every element_epoch in this dataset"
        description="Filter by subject, time window, or probe. Select an epoch to launch a Signal trace, a PSTH around stimulus events, or the electrode position scoped to that recording."
      />
      <SessionsBrowser datasetId={id} />
    </section>
  );
}

/**
 * `/my/workspace/[id]/analyses` — chart + comparison panels.
 *
 * Phase A: render the six non-DatasetStructure panels as a vertical
 * stack (same content the pre-redesign `/my/workspace/[id]` showed
 * for the corresponding rows). DatasetStructure lives on the Overview
 * tab now; this tab is where the actual plotting + comparison work
 * happens.
 *
 * Panel order matches the pre-redesign workspace-client.tsx so the
 * stack reads in the same arc users are already familiar with:
 *   Signal → Spike → Behavioral compare → Treatment timeline →
 *   Electrode position → PSTH.
 *
 * Phase D will reorganise these into the grouped layout (Plots /
 * Comparisons / Provenance) per the redesign doc. For Phase A the
 * priority is route-shape stability + zero functional regression on
 * the existing panels; the visual reorganisation can come once the
 * data tabs (Phase B/C) prove the new IA works.
 *
 * The "Need something the panels don't cover" escalation footer
 * carries over from the pre-redesign page — pointer into the
 * Document Explorer + a note about Show-code.
 */
import type { Metadata } from 'next';
import Link from 'next/link';

import { BehavioralComparePanel } from '@/components/workspace/BehavioralComparePanel';
import { ElectrodePositionPanel } from '@/components/workspace/ElectrodePositionPanel';
import { PsthPanel } from '@/components/workspace/PsthPanel';
import { SignalViewerPanel } from '@/components/workspace/SignalViewerPanel';
import { SpikeActivityPanel } from '@/components/workspace/SpikeActivityPanel';
import { TreatmentTimelinePanel } from '@/components/workspace/TreatmentTimelinePanel';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Analyses',
  description:
    'Run plots, comparisons, and provenance walks against the dataset.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceAnalysesPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <section className="mx-auto max-w-[1200px] px-7 py-8">
      <div className="space-y-5">
        <SignalViewerPanel datasetId={id} />
        <SpikeActivityPanel datasetId={id} />
        <BehavioralComparePanel datasetId={id} />
        <TreatmentTimelinePanel datasetId={id} />
        <ElectrodePositionPanel datasetId={id} />
        <PsthPanel datasetId={id} />
      </div>

      {/* Escalation footer — carried over from the pre-redesign
          workspace. Points users at the Document Explorer for
          anything outside the panel coverage; reminds them that
          every panel's Show-code button gives them the equivalent
          Python / MATLAB snippet to extend themselves. */}
      <div className="mt-8 rounded-md border border-dashed border-border-subtle bg-bg-surface px-4 py-3 text-[13px] text-fg-secondary">
        Need something the panels don&rsquo;t cover yet? The full document
        tree, dependencies, and raw data are in the{' '}
        <Link
          href={`/datasets/${id}/documents`}
          className="text-brand-blue hover:underline"
        >
          Document Explorer
        </Link>
        , and every &ldquo;Show code&rdquo; button copies a runnable Python
        or MATLAB snippet you can extend in your own environment.
      </div>
    </section>
  );
}

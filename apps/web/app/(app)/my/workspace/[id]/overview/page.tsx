/**
 * `/my/workspace/[id]/overview` — landing tab (Phase B build).
 *
 * Three vertical sections, top-to-bottom:
 *
 *   1. **Stat tiles row** — six clickable count tiles (Subjects /
 *      Sessions / Probes / Epochs / Documents / Species). Each tile
 *      drills into the relevant tab or summary table.
 *   2. **Provenance band** — biology + methods context (brain
 *      regions, strains, sexes, probe types, paper DOIs). Fills in
 *      the experimental detail the cardinal stat tiles can't carry.
 *   3. **Starter views** — three auto-selected analysis cards, picked
 *      from the dataset's class counts so the recommendations match
 *      what the dataset actually contains. Numbered-row pattern from
 *      the marketing home page.
 *
 * Information architecture matches the redesign doc
 * (`apps/web/docs/design/2026-05-16-workspace-redesign.md`): the
 * landing experience answers "what's in this dataset?" before the
 * user has to pick a tool. Discover → drill → visualize is the
 * implicit shape; this tab is the Discover stage.
 *
 * All three sections are client components because they each hook
 * into TanStack Query (`useDataset`, `useDatasetSummary`,
 * `useClassCounts`). The page itself is a server component that
 * just composes them. Server-prefetching of these queries lives in
 * the layout once Phase D wires it in; for Phase B each section
 * fetches on mount.
 */
import type { Metadata } from 'next';

import { StarterViewsSection } from '@/components/workspace/StarterViewsSection';
import { StatTilesRow } from '@/components/workspace/StatTilesRow';
import { WorkspaceProvenanceBand } from '@/components/workspace/WorkspaceProvenanceBand';
import { WorkspaceSectionHeader } from '@/components/workspace/WorkspaceSectionHeader';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Overview',
  description:
    'See what is in this dataset — counts, biology, and recommended starter analyses.',
  robots: { index: false, follow: false },
};

export default async function WorkspaceOverviewPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <section className="mx-auto max-w-[1200px] px-7 py-10 space-y-12">
      {/* ── 1. Stat tiles row ───────────────────────────────────── */}
      <div>
        <WorkspaceSectionHeader
          eyebrow="What's in this dataset"
          title="At a glance"
          description="Six cardinal facts about the dataset's shape. Each tile drills into the corresponding tab or summary table."
        />
        <StatTilesRow datasetId={id} />
      </div>

      {/* ── 2. Provenance band ──────────────────────────────────── */}
      <div>
        <WorkspaceSectionHeader
          eyebrow="Experimental context"
          title="Biology, methods, and citation"
          description="Brain regions, strains, sexes, and probe types extracted from the dataset's curated documents. Click any ontology pill to view the underlying term in OLS."
        />
        <WorkspaceProvenanceBand datasetId={id} />
      </div>

      {/* ── 3. Starter views ────────────────────────────────────── */}
      <div>
        <WorkspaceSectionHeader
          eyebrow="Try these first"
          title="Recommended starter analyses"
          description="Auto-selected from this dataset's class counts. Each card opens the relevant panel on the Analyses tab — Show code copies the equivalent Python or MATLAB snippet."
        />
        <StarterViewsSection datasetId={id} />
      </div>
    </section>
  );
}

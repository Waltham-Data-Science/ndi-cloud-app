import type { Metadata } from 'next';

import { TutorialView } from '@/components/app/TutorialView';
import { hasTutorial } from '@/lib/data/tutorials';
import { Card, CardBody } from '@/components/ui/Card';

/**
 * Dataset detail Tutorials tab — `/datasets/[id]/tutorials`.
 *
 * Renders the iframe-rendered MATLAB / Python tutorial for the two
 * datasets that ship one (see `DATASETS_WITH_TUTORIALS` in
 * `lib/data/tutorials.ts`). The Tutorials tab in `DatasetTabs.tsx`
 * only appears for those datasets, so most users hitting this page
 * arrive via that tab and see the full TutorialView.
 *
 * Direct navigations to `/datasets/[other-id]/tutorials` (typed URL,
 * external link, etc.) hit the soft empty state below — friendlier
 * than a 404 since the URL is technically valid for the dataset, just
 * unpopulated.
 *
 * Static-shell route (no fetch, no prefetch) — the iframe content is
 * served from S3 by `<TutorialView>` itself, and the per-dataset gating
 * is a synchronous lookup against the allowlist. No `revalidate` needed
 * because there's nothing to revalidate; the page is functionally a
 * client-side router for the tutorial iframe.
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Tutorial',
    alternates: { canonical: `/datasets/${id}/tutorials` },
  };
}

export default async function DatasetTutorialsPage({ params }: PageProps) {
  const { id } = await params;
  if (!hasTutorial(id)) {
    return <NoTutorialState datasetId={id} />;
  }
  return <TutorialView datasetId={id} />;
}

/**
 * Soft empty state for direct navigations to tutorials URLs on
 * datasets without tutorials. Not a 404 — the user is on a valid
 * dataset, the tutorial just hasn't been authored. Points them at
 * the other tabs that DO have content.
 */
function NoTutorialState({ datasetId }: { datasetId: string }) {
  return (
    <Card>
      <CardBody>
        <h2 className="text-base font-bold text-fg-primary mb-2 m-0">
          No tutorial for this dataset
        </h2>
        <p className="text-sm text-fg-secondary mb-3 m-0">
          Tutorials are authored per-dataset. Two datasets currently have
          published walkthroughs; this one isn&rsquo;t one of them.
        </p>
        <p className="text-xs text-fg-muted m-0">
          Try the Overview tab for a synthesized summary, or the Document
          Explorer to browse the dataset&rsquo;s structured records.
        </p>
        <p className="text-[10.5px] text-fg-muted/70 mt-4 font-mono m-0">
          dataset id: {datasetId}
        </p>
      </CardBody>
    </Card>
  );
}

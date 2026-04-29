import type { Metadata } from 'next';

import { TutorialView } from '@/components/app/TutorialView';

/**
 * Dataset detail Tutorials tab — `/datasets/[id]/tutorials`.
 *
 * Renders the iframe-rendered MATLAB / Python tutorial. Per-dataset
 * gating is handled inside `<TutorialView>` via the
 * `useTutorialAvailability` HEAD-probe hook (see
 * `lib/data/tutorials.ts`):
 *
 *   - If the bucket holds a `tutorial_<id>.mlx` and/or
 *     `tutorial_<id>.ipynb` for this dataset, render the iframe with
 *     a language toggle.
 *   - If neither file exists, render a soft empty state. Most users
 *     never hit this branch because `DatasetTabs` hides the Tutorials
 *     tab when the same probe returns `hasAny: false`. Direct typed-
 *     URL navigations to `/datasets/[other-id]/tutorials` land here.
 *
 * Static-shell route (no fetch, no prefetch) — the iframe content is
 * served from S3 by `<TutorialView>` itself, and the per-dataset
 * gating is async and runs on the client. No `revalidate` needed
 * because there's nothing to revalidate; the page is functionally a
 * client-side router for the tutorial iframe.
 *
 * History note: PR #130 had this page do a synchronous allowlist
 * check and render its own `<NoTutorialState>`. The HEAD-probe
 * version is async-only, so the empty state moved into the client
 * component to keep the gating in one place.
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
  return <TutorialView datasetId={id} />;
}

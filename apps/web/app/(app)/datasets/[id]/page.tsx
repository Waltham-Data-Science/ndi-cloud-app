/**
 * `/datasets/[id]` — server redirect to `./overview`.
 *
 * Mirrors the data-browser SPA's `/datasets/:id` → `/datasets/:id/overview`
 * convention so legacy bookmarks land on the dataset's primary tab. The
 * data-browser used a client-side `<Navigate to="overview" replace />`;
 * here we use Next's server-side `redirect()` so:
 *   - The 308 happens before any HTML is rendered (no client roundtrip).
 *   - SEO crawlers follow the redirect to the canonical URL.
 *   - There's no flash of empty layout while client routing resolves.
 *
 * Phase 3b builds the dataset detail layout + tab bar. This file stays
 * minimal — its only job is the redirect.
 */
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DatasetIndexPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/datasets/${id}/overview`);
}

/**
 * `/my/workspace/[id]` — redirect to the Overview tab.
 *
 * Mirrors `/datasets/[id]/page.tsx` → `/datasets/[id]/overview`: the
 * bare id route is a redirect, never a render. Each tab is its own
 * page so deep links + share URLs always carry the tab in the path.
 *
 * Server-side redirect (Next.js `redirect()`) so the navigation
 * happens before any HTML is sent — no flash, no client-side
 * `router.replace`.
 */
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkspacePage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/my/workspace/${id}/overview`);
}

/**
 * Workspace layout — chrome for `/my/workspace/[id]/*` (Phase A).
 *
 * Mirrors `/datasets/[id]/layout.tsx`: thin server component, no
 * blocking awaits, wraps the children with a server-rendered hero +
 * client-rendered tab bar + client-side auth gate. The `loading.tsx`
 * Suspense fallback for each tab page paints the moment that page
 * starts to suspend, since the layout itself doesn't await any data.
 *
 * Why the auth gate wraps only `children` (not hero + tabbar):
 *   - The hero pulls public dataset metadata via `safeFetchDataset` —
 *     the same data `/datasets/[id]` already exposes publicly, so
 *     showing it briefly to an unauthenticated visitor is fine.
 *   - The tab bar is just navigation chrome; no protected data.
 *   - Wrapping just the children means the hero + tabs stay paintable
 *     during auth resolve (no flash-to-skeleton-then-back).
 *
 * Why `<div key={id}>` around the gate-wrapped children:
 *   - Some tabs (Analyses) host the 7 chart panels, each with its own
 *     form / mutation state. When the user navigates from
 *     `/my/workspace/A/analyses` to `/my/workspace/B/analyses` the
 *     URL params change but the layout (and therefore the page
 *     subtree) doesn't unmount by default — stale mutation state
 *     from dataset A would leak under dataset B's hero. Keying the
 *     wrapper by `id` forces a full subtree remount on cross-dataset
 *     navigation. Same pattern the pre-redesign `workspace-client.tsx`
 *     used; preserved here so the existing remount invariant holds.
 *
 * Hero is wrapped in `<Suspense>` so the tab bar + page can stream
 * independently — the hero awaits `safeFetchDataset` server-side but
 * doesn't block the rest of the layout.
 */
import { Suspense } from 'react';

import {
  WorkspaceShell,
  WorkspaceShellSkeleton,
} from '@/components/workspace/WorkspaceShell';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { WorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps) {
  const { id } = await params;

  return (
    <>
      <Suspense fallback={<WorkspaceShellSkeleton />}>
        <WorkspaceShell datasetId={id} />
      </Suspense>
      <WorkspaceTabs datasetId={id} />
      <div key={id}>
        <WorkspaceAuthGate datasetId={id}>{children}</WorkspaceAuthGate>
      </div>
    </>
  );
}

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

import { AskKeyboardShortcuts } from '@/components/ai/AskKeyboardShortcuts';
import { AskPanel } from '@/components/ai/AskPanel';
import { AskPanelTrigger } from '@/components/ai/AskPanelTrigger';
import { WorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';
import {
  WorkspaceShell,
  WorkspaceShellSkeleton,
} from '@/components/workspace/WorkspaceShell';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';
import { safeFetchDataset } from '@/lib/api/datasets-server';
import { cleanDatasetName } from '@/lib/format';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps) {
  const { id } = await params;

  // Pre-fetch the dataset name so AskPanel's context line ("Asking
  // about: <name>") renders correctly on first paint. The same fetch
  // is cached for WorkspaceShell's render below (same RSC request).
  const datasetForContext = await safeFetchDataset(id).catch(() => null);
  const datasetName = datasetForContext
    ? cleanDatasetName(datasetForContext.name)
    : undefined;

  return (
    <>
      <Suspense fallback={<WorkspaceShellSkeleton />}>
        <WorkspaceShell datasetId={id} />
      </Suspense>
      <WorkspaceTabs datasetId={id} />
      <div key={id}>
        <WorkspaceAuthGate datasetId={id}>{children}</WorkspaceAuthGate>
      </div>

      {/*
        AskPanel + Trigger + KeyboardShortcuts — workspace-level chat
        affordance (Phase D). All three call `useSearchParams()` via
        `useAskPanelState`, so they MUST live inside a `<Suspense>`
        boundary per the App Router's CSR-bailout rule for that hook.
        Rendering them in a single shared Suspense keeps them out of
        any potential bailout that would force the whole layout into
        client-side rendering.

        The Ask infra is mounted ONCE per workspace navigation (not
        per tab). The panel's open/mode state lives in URL params so
        navigating between tabs preserves the panel.
      */}
      <Suspense fallback={null}>
        <AskPanel
          context={
            datasetName ? { datasetId: id, datasetName } : { datasetId: id }
          }
        />
        <AskPanelTrigger />
        <AskKeyboardShortcuts />
      </Suspense>
    </>
  );
}

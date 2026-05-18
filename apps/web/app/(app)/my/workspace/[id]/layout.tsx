/**
 * Workspace layout — chrome for `/my/workspace/[id]` (Phase F redesign).
 *
 * Pre-redesign this layout wrapped a 5-tab IA (Overview / Structure /
 * Subjects / Sessions / Analyses). The Phase F redesign collapses
 * the tabs into a single canvas (rendered by `page.tsx`), so this
 * layout is now thinner — just the hero, the auth gate, and the
 * AskPanel + keyboard shortcuts.
 *
 * Why the auth gate wraps only `children` (not hero / AskPanel):
 *   - The hero pulls public dataset metadata (`safeFetchDataset`),
 *     the same data `/datasets/[id]` already serves anonymously.
 *     Showing it briefly to an unauthenticated visitor is fine.
 *   - The AskPanel is also workspace-level chrome that survives auth
 *     resolve — its empty state handles the not-yet-signed-in case.
 *   - The canvas (children) holds the workspace tables + analyses,
 *     which need auth; the gate sits over those alone.
 *
 * Why `<div key={id}>` around the gate-wrapped children: the canvas
 * holds 6 panels each with its own form/mutation state. When the
 * user navigates from `/my/workspace/A` → `/my/workspace/B` we want
 * a full subtree remount so stale mutation state from A doesn't
 * leak under B's hero. Keying the wrapper by `id` forces it.
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

  // Pre-fetch dataset name so AskPanel's context line ("Asking
  // about: <name>") renders correctly on first paint. Same fetch
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
      <div key={id}>
        <WorkspaceAuthGate datasetId={id}>{children}</WorkspaceAuthGate>
      </div>

      {/*
        AskPanel + Trigger + KeyboardShortcuts — workspace-level chat
        affordance. All three call `useSearchParams()` via
        `useAskPanelState`, so they MUST live inside a `<Suspense>`
        per the App Router's CSR-bailout rule for that hook. The
        single shared Suspense keeps them out of any potential
        bailout that would force the whole layout into client-side
        rendering.

        Phase F (W7 fix): AskPanel's `context` now carries selection
        bar state in addition to dataset id/name — see the AskShell
        refactor for how the chat request body picks this up.
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

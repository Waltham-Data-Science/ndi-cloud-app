/**
 * `/my/workspace/[id]` — the workspace canvas (Phase F redesign).
 *
 * Previously this was a server-side redirect to
 * `/my/workspace/[id]/overview`. The Phase F redesign collapses the
 * 5-tab IA into a single canvas, so the bare id route now renders
 * the canvas directly.
 *
 * The page is a thin server component — all the interactivity is in
 * `WorkspaceCanvasClient` which uses `useWorkspaceSelection`. We
 * resolve the `params` Promise here so the client receives a plain
 * id string and renders without server-side hooks.
 *
 * The hero + AskPanel + AskKeyboardShortcuts mount in `layout.tsx`,
 * not here — they're shared chrome that should survive intra-
 * workspace state changes.
 */
import { Suspense } from 'react';

import { WorkspaceCanvasClient } from '@/components/workspace/canvas/WorkspaceCanvasClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Suspense fallback for the canvas — picker rail + main area in a
 * coarse 2-column shape. The canvas's own components carry finer
 * skeletons for stats/provenance/picker rows, so this top-level
 * fallback only renders for the moment between route resolve and
 * the canvas client booting.
 */
function CanvasFallback() {
  return (
    <div className="mx-auto max-w-[1480px] lg:grid lg:grid-cols-[340px_1fr] min-h-[400px] bg-bg-canvas">
      <aside className="lg:border-r border-border-subtle p-4" aria-busy="true">
        <div className="h-4 w-full rounded bg-bg-muted animate-pulse" />
      </aside>
      <main className="p-6" aria-busy="true">
        <div className="h-6 w-1/3 rounded bg-bg-muted animate-pulse" />
      </main>
    </div>
  );
}

export default async function WorkspacePage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<CanvasFallback />}>
      <WorkspaceCanvasClient datasetId={id} />
    </Suspense>
  );
}

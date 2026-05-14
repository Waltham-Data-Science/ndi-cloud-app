/**
 * `/my/workspace/[id]` — rich data workspace for a single dataset.
 *
 * This is the Task-2 viewer GUI: the auth-gated working surface where
 * logged-in users can plot signals, run spike + behavioral analyses,
 * and copy out Python/MATLAB equivalents — all against either their
 * own datasets (published or in-review) or the public NDI catalog.
 *
 * Architecture:
 *
 *   ┌─ /my  (dataset picker — list view) ────────────────────┐
 *   │  Click a dataset card → /my/workspace/[id]             │
 *   └────────────────────────────────────────────────────────┘
 *                                ↓
 *   ┌─ /my/workspace/[id]  (this route)  ────────────────────┐
 *   │  Hero: dataset name + back-to-/my                      │
 *   │  Panels:                                               │
 *   │    1. Dataset Structure   (orientation, no chart)      │
 *   │    2. Signal Viewer       (SignalChart)                │
 *   │    3. Spike Activity      (SpikeRaster + IsiHistogram) │
 *   │    4. Behavioral Compare  (ViolinChart)                │
 *   │    5. Treatment Timeline  (GanttChart)                 │
 *   └────────────────────────────────────────────────────────┘
 *
 * Each panel calls the FastAPI proxy at /api/datasets/... directly
 * via `apiFetch` from the browser — cookies forward automatically so
 * auth-scoped private datasets work without any panel-specific auth
 * code. Same pattern the existing data-browser surfaces use.
 *
 * Auth gating: handled client-side in `workspace-client.tsx` via the
 * same `useSession() + router.replace('/login?...')` pattern that
 * `/my` and `/my-account` use. Anonymous visitors get redirected to
 * /login with a returnTo back to this URL so post-login the workspace
 * loads automatically.
 *
 * The route does NOT prefetch dataset data server-side — each panel
 * owns its own load. Keeping the server entry thin means cold-load
 * dataset pages don't block the workspace shell from painting.
 */
import type { Metadata } from 'next';

import { WorkspaceClient } from './workspace-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Per-page title; root layout's template wraps to "Workspace · NDI Cloud".
export const metadata: Metadata = {
  title: 'Workspace',
  description: 'Plot, compute, and explore a dataset interactively.',
  robots: { index: false, follow: false },
};

export default async function WorkspacePage({ params }: PageProps) {
  const { id } = await params;
  return <WorkspaceClient datasetId={id} />;
}

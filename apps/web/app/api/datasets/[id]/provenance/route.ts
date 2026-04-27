/**
 * Edge-cached proxy for `GET /api/datasets/[id]/provenance`.
 *
 * Anonymous-public derivation graph (Plan B B5). Same cache profile +
 * private-dataset semantics as `[id]/route.ts`.
 *
 * **Why this matters**: smoke-testing the post-Phase-6.7 deployment
 * found the provenance endpoint can take 60s+ on Railway for medium
 * datasets — the synthesizer fans out across `branchOf` / `branches`
 * resolution and the per-class `documentDependencies` aggregation,
 * neither of which is cached at the FastAPI layer. Without this
 * route handler, the request fell through `next.config.ts`'s catch-
 * all rewrite and hit Railway with no edge cache, so every viewer
 * paid the cold cost. apiFetch then aborted at its 15s read timeout
 * and TanStack Query retried (3×) — net effect: a card stuck in
 * the loading state for ~60-90s, then either eventually rendered
 * or fell into the typed error state. Edge caching collapses
 * this to "first viewer pays cold, next 6 minutes are warm."
 */
import { type NextRequest } from 'next/server';

import { CACHE_ITEM, cachedProxy } from '@/lib/api/proxy/cached-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response(JSON.stringify({ error: 'invalid_dataset_id' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
  return cachedProxy(`/api/datasets/${id}/provenance`, CACHE_ITEM);
}

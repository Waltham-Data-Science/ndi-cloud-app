/**
 * Edge-cached proxy for `GET /api/datasets/[id]/summary`.
 *
 * Anonymous-public synthesized summary (Plan B B1). Same cache
 * profile + private-dataset semantics as `[id]/route.ts`.
 *
 * **Why this matters**: the FastAPI summary path can take 90+ seconds
 * cold (per-class ndiquery + bulk_fetch fanout, see backend perf
 * trace). Without an edge cache, every viewer of a slow-summary
 * dataset waits the full 90s; with the cache, ONE viewer pays it
 * and the next 6 minutes serve from the edge.
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
  return cachedProxy(`/api/datasets/${id}/summary`, CACHE_ITEM);
}

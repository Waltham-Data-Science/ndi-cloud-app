/**
 * Edge-cached proxy for `GET /api/datasets/[id]/pivot/[grain]`.
 *
 * Anonymous-public grain-selectable pivot (Plan B B6e). Same cache
 * profile + private-dataset semantics as `[id]/route.ts`.
 *
 * **Why this matters**: pivot fetches join across multiple per-class
 * tables and can run 6-30s cold on Railway. Without this handler the
 * request fell through `next.config.ts`'s catch-all rewrite — every
 * tab visit paid the cold cost. The 503 (FEATURE_PIVOT_V1 disabled)
 * branch is `no-store`'d via cached-proxy's non-2xx fallback so a
 * disabled-feature response never poisons the cache.
 *
 * Path-traversal guard: `grain` is one of `subject`/`session`/`element`
 * (the v1 amendment-§4.B6e set). Reject anything else before the
 * upstream fetch fires.
 */
import { type NextRequest } from 'next/server';

import { CACHE_ITEM, cachedProxy } from '@/lib/api/proxy/cached-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string; grain: string }>;
}

const ALLOWED_GRAINS = new Set(['subject', 'session', 'element']);

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id, grain } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !ALLOWED_GRAINS.has(grain)) {
    return new Response(
      JSON.stringify({ error: 'invalid_dataset_id_or_grain' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
  return cachedProxy(`/api/datasets/${id}/pivot/${grain}`, CACHE_ITEM);
}

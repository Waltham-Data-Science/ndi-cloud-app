/**
 * Edge-cached proxy for `GET /api/datasets/[id]/tables/[className]`.
 *
 * Anonymous-public per-class summary tables (subject / element /
 * element_epoch / treatment / probe_location / openminds_subject /
 * combined / ontology). Same cache profile + private-dataset
 * semantics as `[id]/route.ts`.
 *
 * **Why this matters**: smoke-testing the post-Phase-6.7 deployment
 * found the tables endpoint takes 6-25s cold on Railway depending
 * on the class size + dataset size. Without this handler, the
 * request fell through `next.config.ts`'s catch-all rewrite and
 * hit Railway directly with no edge cache. After the cron warmup
 * fires (every 5 min on the top-N detail surfaces), every catalog
 * visitor lands on a warm edge cache for the most-trafficked
 * datasets.
 *
 * Path-traversal guard: `id` is bare alnum/underscore/dash (no
 * slashes). `className` is the canonical FastAPI class name —
 * same alnum/underscore charset. Anything else returns 400 before
 * the upstream fetch fires.
 */
import { type NextRequest } from 'next/server';

import { CACHE_ITEM, cachedProxy } from '@/lib/api/proxy/cached-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string; className: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id, className } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !/^[a-zA-Z0-9_-]+$/.test(className)) {
    return new Response(
      JSON.stringify({ error: 'invalid_dataset_id_or_class' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
  return cachedProxy(`/api/datasets/${id}/tables/${className}`, CACHE_ITEM);
}

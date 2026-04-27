/**
 * Edge-cached proxy for `GET /api/datasets/[id]` (dataset detail).
 *
 * Anonymous-public read for published datasets. The cloud returns
 * 401/404 for org-private datasets to anonymous viewers, so the
 * cached response for a private dataset id is the 401/404 — which is
 * `no-store`'d (see cached-proxy.ts) so a logged-in viewer doesn't
 * get a cached 401.
 *
 * Cache profile: `CACHE_ITEM` (60s fresh + 5 min SWR). Tighter than
 * the catalog because dataset records get edited mid-day (admin
 * updates abstract / publishes a new branch); we want the staleness
 * window to cover an admin editing session without forcing every
 * viewer to wait through the next request.
 *
 * **NB**: this proxy is the read-side only. Mutations (PATCH/PUT/
 * DELETE) on this URL fall through the catch-all `/api/*` rewrite in
 * `next.config.ts` and reach Railway with cookies + CSRF token
 * intact — middleware enforces Origin on those.
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
  // Path-traversal guard: dataset ids are bare Mongo `_id` strings
  // (24 hex chars). Reject anything with a slash so a crafted id
  // can't reach an unintended upstream path.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response(JSON.stringify({ error: 'invalid_dataset_id' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
  return cachedProxy(`/api/datasets/${id}`, CACHE_ITEM);
}

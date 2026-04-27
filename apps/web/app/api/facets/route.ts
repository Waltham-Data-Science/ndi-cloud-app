/**
 * Edge-cached proxy for `GET /api/facets`.
 *
 * Anonymous-public faceted aggregation. Identical response for every
 * viewer; changes only when datasets are published/unpublished
 * (rare). Same cache profile as `/api/datasets/published`.
 *
 * See `lib/api/proxy/cached-proxy.ts` for the cache-control rationale.
 */
import { CACHE_LIST, cachedProxy } from '@/lib/api/proxy/cached-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return cachedProxy('/api/facets', CACHE_LIST);
}

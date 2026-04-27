/**
 * Edge-cached proxy for `GET /api/datasets/published`.
 *
 * Without this handler, the catalog endpoint hit the catch-all
 * `next.config.ts` rewrite that goes straight to Railway with no
 * caching — every visitor paid the full backend cost (90+ seconds
 * worst case, due to the FastAPI per-row summary enricher). With
 * this handler, the response is cached at the Vercel edge for 60s
 * with 5min SWR, so one viewer pays the cold cost and every other
 * viewer for the next 60s gets a sub-50ms response from the edge
 * cache.
 *
 * See `lib/api/proxy/cached-proxy.ts` for the cache-control and
 * cookie-stripping rationale.
 */
import type { NextRequest } from 'next/server';

import { CACHE_LIST, cachedProxy } from '@/lib/api/proxy/cached-proxy';

export const runtime = 'nodejs';
// We're handling the response Cache-Control ourselves; mark dynamic
// so Next.js doesn't try to apply its own static-route caching on
// top.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.search; // includes leading "?" or empty
  // CACHE_LIST = 5 min fresh + 1 hour SWR. Combined with the
  // `/api/cron/warm-cache` cron pinging this endpoint every 5 min,
  // first-time viewers also get instant responses.
  return cachedProxy(`/api/datasets/published${search}`, CACHE_LIST);
}

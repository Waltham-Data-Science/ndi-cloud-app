/**
 * Edge-cached proxy for `GET /api/datasets/[id]/documents`.
 *
 * Anonymous-public paginated document list (consumed by the Document
 * Explorer tab via `useDocuments`). Query params (`page`, `pageSize`,
 * optional `class`) are forwarded as part of the URL so each (dataset,
 * page, class) tuple gets its own cache entry — identical pages share
 * the same cache key, while a different page or class filter doesn't
 * collide with another's response.
 *
 * **Why this matters**: smoke-testing post-Phase-6.7 found the
 * documents endpoint hitting Railway directly with no edge cache
 * (route handler missing — fell through `next.config.ts`'s catch-
 * all). The endpoint takes 6-15s cold even for moderate datasets,
 * so apiFetch's 15s read timeout was triggering on the first
 * attempt for many datasets. TanStack Query then retried (3×),
 * each retry hit cold, each timed out — net "stuck loading" for
 * 60-90s before the cache warmed up enough to succeed. With this
 * handler + the cron warmup, the first viewer's request populates
 * the edge cache and subsequent viewers within the SWR window get
 * the response from the edge.
 */
import { type NextRequest } from 'next/server';

import { CACHE_ITEM, cachedProxy } from '@/lib/api/proxy/cached-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
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
  // Forward the original query string so (page, pageSize, class) make
  // each pagination/filter slice its own cache key. Strip anything else
  // — only these three params affect the upstream response, and any
  // bonus params (analytics tracking, etc.) would needlessly fragment
  // the cache.
  const url = new URL(req.url);
  const params_q = new URLSearchParams();
  const page = url.searchParams.get('page');
  const pageSize = url.searchParams.get('pageSize');
  const cls = url.searchParams.get('class');
  if (page) params_q.set('page', page);
  if (pageSize) params_q.set('pageSize', pageSize);
  if (cls) params_q.set('class', cls);
  const qs = params_q.toString();
  const path = qs
    ? `/api/datasets/${id}/documents?${qs}`
    : `/api/datasets/${id}/documents`;
  return cachedProxy(path, CACHE_ITEM);
}

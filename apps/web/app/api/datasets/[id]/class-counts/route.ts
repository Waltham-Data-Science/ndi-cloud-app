/**
 * Edge-cached proxy for `GET /api/datasets/[id]/class-counts`.
 *
 * Anonymous-public per-class document counts. Same cache profile +
 * private-dataset semantics as `[id]/route.ts`.
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
  return cachedProxy(`/api/datasets/${id}/class-counts`, CACHE_ITEM);
}

/**
 * Vercel cron: keep the anonymous-public edge cache warm.
 *
 * # Why
 *
 * The catalog endpoint (`/api/datasets/published`) and facets
 * (`/api/facets`) sit behind Vercel's edge cache (5 min fresh + 1
 * hour stale-while-revalidate, see `lib/api/proxy/cached-proxy.ts`).
 * That shields every viewer EXCEPT the first one in each cache
 * generation — that viewer pays the full backend cost (currently 90+
 * seconds when the FastAPI summary N+1 hits a slow row).
 *
 * This cron pings the same edge URL every 5 minutes from a server-
 * side function. The ping warms (or re-warms) the cache, so during
 * any 5-minute window with cron activity, a real viewer always lands
 * on a warm cache and gets the response in <50ms.
 *
 * Effective cache lifetime with the cron: indefinite during business
 * hours. When the cron pauses (e.g., long Vercel outage), the
 * `stale-while-revalidate=3600` window covers another hour, then the
 * next viewer pays the cold cost.
 *
 * # Schedule
 *
 * Configured in `vercel.json` → `crons`. Vercel's hobby tier allows
 * up to 2 daily cron jobs; pro/enterprise allow per-minute. We use
 * the every-5-minutes schedule (cron expression in vercel.json)
 * which requires the pro tier — on hobby tier this would degrade
 * to once-per-day. Worst case on hobby: cold cache happens after
 * 65 minutes of zero traffic + zero cron, then we're back to
 * "first viewer pays, next 65 min are warm" semantics.
 *
 * # Auth
 *
 * Vercel signs cron requests with the `CRON_SECRET` env var — the
 * handler rejects requests missing that header so an attacker can't
 * trigger arbitrary fan-out. If `CRON_SECRET` is unset (preview
 * deploys without the env), the handler still runs but logs a
 * warning — keeps preview deploys functional during testing.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Endpoints to warm. Anonymous-public reads only; per-dataset
 * endpoints are deliberately excluded — there are too many to
 * meaningfully pre-warm and they're individually low-traffic. The
 * catalog + facets are the high-leverage targets: every catalog
 * visitor hits both.
 */
const WARM_TARGETS = [
  '/api/datasets/published?page=1&pageSize=20',
  '/api/facets',
] as const;

interface WarmResult {
  url: string;
  status: number;
  durationMs: number;
}

export async function GET(req: Request) {
  // Vercel cron auth: requests carry `Authorization: Bearer
  // ${CRON_SECRET}` when the env is set in the project. We check
  // both the typed env and the legacy x-vercel-cron header (older
  // signature scheme) for forward-compatibility.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (cronSecret) {
    if (
      authHeader !== `Bearer ${cronSecret}` &&
      !isVercelCron
    ) {
      return new NextResponse('unauthorized', { status: 401 });
    }
  }

  const origin = req.headers.get('host')
    ? `https://${req.headers.get('host')}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : null;
  if (!origin) {
    return NextResponse.json(
      { error: 'no-origin', detail: 'Cannot determine self-origin to warm.' },
      { status: 500 },
    );
  }

  // Fire all warm requests in parallel — they hit different upstream
  // endpoints so no contention.
  const results: WarmResult[] = await Promise.all(
    WARM_TARGETS.map(async (path): Promise<WarmResult> => {
      const url = `${origin}${path}`;
      const t0 = Date.now();
      try {
        const res = await fetch(url, {
          method: 'GET',
          // Critical: hit the EDGE-CACHED route, not bypass it.
          // Default cache 'no-store' would skip Vercel's edge cache;
          // we want the request to populate the cache.
          headers: { Accept: 'application/json' },
        });
        return { url: path, status: res.status, durationMs: Date.now() - t0 };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        // Log + record; don't throw (other warm targets shouldn't be
        // blocked by one failure).
        console.warn(`[warm-cache] ${path} failed: ${message}`);
        return { url: path, status: 0, durationMs: Date.now() - t0 };
      }
    }),
  );

  return NextResponse.json(
    {
      ok: results.every((r) => r.status >= 200 && r.status < 400),
      timestamp: new Date().toISOString(),
      results,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

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
 * Always-on global warm targets (anonymous-public, viewer-agnostic).
 * Every catalog visitor hits both, so warming them every 5 min keeps
 * the catalog sub-50ms during business hours.
 */
const GLOBAL_WARM_TARGETS = [
  '/api/datasets/published?page=1&pageSize=20',
  '/api/facets',
] as const;

/**
 * Per-dataset endpoints we warm for the **top-N** trafficked datasets.
 * The smoke-test pass after Phase 6.7 surfaced the per-dataset detail
 * endpoints (`/summary`, `/provenance`, `/class-counts`) as the
 * largest user-perceived hang: cold Railway responses can take 30-90s,
 * exceeding the client's apiFetch timeout and looking like a stuck
 * skeleton even after the request eventually returns.
 *
 * The 2026-04-28 live audit found a second hang surface: the per-class
 * summary tables (`/tables/subject`, `/tables/element`) on datasets
 * with thousands of subjects (e.g. C. elegans long-term-memory at
 * 5,314 subjects) timed out at >60s on cold cache and never returned
 * within the apiFetch ceiling. Subjects + elements are the two most-
 * common Tables tab landings (subject is the default sub-tab; element
 * carries probe / stimulus rows). Adding them to the warm list closes
 * the gap for first viewers.
 *
 * Strategy: every cron tick, fetch the catalog's first page, take its
 * top-N dataset ids, and ping each per-dataset endpoint. The catalog
 * already orders by traffic + recency, so the top-N approximation is
 * the correct attention budget. N=10 keeps total cron fan-out at
 * 2 + (10×5) = 52 requests per tick, well within the 5-minute budget
 * even if each takes ~5-15s warm.
 *
 * Each per-dataset endpoint goes through the corresponding edge-
 * cached route handler in `apps/web/app/api/datasets/[id]/...`. The
 * round-trip populates Vercel's edge cache for the next viewer.
 */
const TOP_N_DETAIL_WARMS = 10;
const PER_DATASET_SUFFIXES = [
  '/summary',
  '/provenance',
  '/class-counts',
  '/tables/subject',
  '/tables/element',
] as const;

interface WarmResult {
  url: string;
  status: number;
  durationMs: number;
}

interface CatalogShape {
  datasets?: Array<{ id?: unknown }>;
}

async function fetchTopDatasetIds(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/api/datasets/published?page=1&pageSize=${TOP_N_DETAIL_WARMS}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as CatalogShape;
    if (!body.datasets) return [];
    const ids: string[] = [];
    for (const d of body.datasets) {
      if (typeof d.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(d.id)) {
        ids.push(d.id);
      }
    }
    return ids.slice(0, TOP_N_DETAIL_WARMS);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.warn(`[warm-cache] top-N catalog probe failed: ${message}`);
    return [];
  }
}

async function warmEndpoint(origin: string, path: string): Promise<WarmResult> {
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

  // Phase 1: warm the global catalog + facets in parallel. These are
  // the always-on targets — every visitor hits them, regardless of
  // which dataset they're viewing.
  const globalResults = await Promise.all(
    GLOBAL_WARM_TARGETS.map((p) => warmEndpoint(origin, p)),
  );

  // Phase 2: take the top-N datasets from the warmed catalog and fan
  // out per-dataset endpoint warms. The catalog ordering is already
  // "most relevant first" so the top-N approximates traffic share.
  // We probe the catalog AFTER phase 1 so it lands on a freshly-warm
  // cache (sub-50ms instead of cold) — keeps the cron's own latency
  // bounded.
  const topIds = await fetchTopDatasetIds(origin);
  const detailPaths: string[] = [];
  for (const id of topIds) {
    for (const suffix of PER_DATASET_SUFFIXES) {
      detailPaths.push(`/api/datasets/${id}${suffix}`);
    }
  }
  const detailResults = await Promise.all(
    detailPaths.map((p) => warmEndpoint(origin, p)),
  );

  const results = [...globalResults, ...detailResults];

  return NextResponse.json(
    {
      ok: results.every((r) => r.status >= 200 && r.status < 400),
      timestamp: new Date().toISOString(),
      topIds,
      results,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

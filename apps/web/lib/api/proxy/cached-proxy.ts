/**
 * Edge-cached proxy for anonymous-public read endpoints.
 *
 * # Problem this solves
 *
 * The default `/api/*` rewrite in `next.config.ts` proxies straight to
 * the FastAPI on Railway with no edge caching. Every visitor pays the
 * full Railway round-trip — and on the catalog endpoint
 * (`/api/datasets/published`) that round-trip can be 90+ seconds when
 * Railway's per-summary N+1 enricher hits a slow row. The result is a
 * blank catalog for ~1 minute on every cold visit.
 *
 * # Fix
 *
 * Wrap each anonymous-public read endpoint in a Next.js route handler
 * that:
 *
 *   1. Forwards the GET to Railway server-side (same destination the
 *      rewrite would have hit).
 *   2. Streams the response body back to the caller.
 *   3. **Overrides the upstream Cache-Control** with edge-cacheable
 *      directives:
 *
 *        Cache-Control: public, s-maxage=60, stale-while-revalidate=300
 *
 *      Vercel's edge honors `s-maxage` (shared cache) and
 *      `stale-while-revalidate` semantics. After one viewer pays the
 *      cold cost, the next 60s of visitors get sub-50ms responses
 *      from the edge cache; for the 5 minutes after that, viewers
 *      get the stale response instantly while one background
 *      revalidation refreshes the cache. The backend is shielded
 *      from concurrent traffic.
 *
 * # Why a route handler, not edge middleware
 *
 * Middleware can rewrite + add response headers, but it can't
 * intercept and re-emit the upstream response with a different
 * Cache-Control. A route handler can — it's the right tool here.
 *
 * # Cookie / auth handling
 *
 * Anonymous-public endpoints stay anonymous: the proxy strips the
 * inbound `Cookie` and `Authorization` headers before forwarding so
 * Railway always sees the same anonymous request, and the cached
 * response is identical for every viewer regardless of their auth
 * state. (For per-dataset endpoints where a logged-in viewer might
 * see additional fields, this means a logged-in user gets the
 * anonymous-public projection — which is correct for the catalog +
 * summary surfaces, both of which are render-identical for all
 * viewers.)
 *
 * If a future endpoint *needs* per-user variation, route it through
 * the regular rewrite path (no caching). This helper is opt-in for
 * the anonymous-public surface only.
 *
 * # Failure mode
 *
 * Upstream 5xx / network error → returns 502 with a small JSON body.
 * Sets `Cache-Control: no-store` on errors so a transient failure
 * doesn't poison the cache for the rest of the revalidate window.
 */

const RAILWAY_FALLBACK = 'https://ndb-v2-production.up.railway.app';

/**
 * Per-endpoint cache windows. Two profiles:
 *
 *   - `LIST`: catalog-style endpoints that change only when admins
 *     publish/unpublish a dataset (rare). 5 min fresh + 1 hour SWR =
 *     65 min effective cache lifetime. Combined with the `/api/cron/
 *     warm-cache` cron pinging this endpoint every 5 min, the cache
 *     literally never goes cold during business hours, so first-time
 *     viewers also get instant responses.
 *
 *   - `ITEM`: per-dataset endpoints. 60s fresh + 5 min SWR = 6 min
 *     effective lifetime. Tighter window because datasets can be
 *     edited mid-day (admin updates abstract / publishes a new
 *     branch); we want the catalog stale window to cover an admin
 *     editing session without forcing every viewer to wait through
 *     the next request.
 */
export const CACHE_LIST = { sMaxAge: 300, swr: 3600 } as const;
export const CACHE_ITEM = { sMaxAge: 60, swr: 300 } as const;

export interface CacheWindow {
  /** s-maxage in seconds — the edge cache's hard freshness window. */
  readonly sMaxAge: number;
  /** stale-while-revalidate in seconds — see CACHE_LIST docstring. */
  readonly swr: number;
}

/**
 * Resolve the Railway upstream base URL.
 *
 * Resolution order:
 *   1. `INTERNAL_API_URL` — the same env var RSC server-side fetches
 *      use to bypass the Vercel edge → Railway double-hop.
 *   2. `UPSTREAM_API_URL` — the env var the `next.config.ts` rewrite
 *      consumes; same value in production.
 *   3. Hardcoded fallback — keeps preview deploys functional even
 *      when the env var isn't set, and avoids a confusing 500 when
 *      the only failure is "we forgot to set the var."
 */
function resolveUpstream(): string {
  // Read `process.env` directly here (CLAUDE.md exception). The
  // zod-validated `env` object in `lib/env.ts` parses at module-load
  // time and is frozen for the process lifetime; this helper is
  // called per-request AND is exercised by unit tests that mutate
  // `process.env.INTERNAL_API_URL` to assert URL composition. A
  // frozen `env` would lose the per-test override. Both env vars
  // ARE declared in the zod schema for documentation + the build-
  // time presence check, but the read at request time goes through
  // `process.env` for runtime-mutable semantics.
  return (
    process.env.INTERNAL_API_URL ||
    process.env.UPSTREAM_API_URL ||
    RAILWAY_FALLBACK
  ).replace(/\/$/, '');
}

/**
 * Forward a GET request to Railway and re-emit the response with
 * edge-cache directives. The path is appended to the resolved
 * upstream base URL verbatim (preserves query strings).
 *
 * @param path    Path + query string to forward, e.g.
 *                `/api/datasets/published?page=1&pageSize=20`.
 *                Must start with `/`.
 * @param window  Cache window — `CACHE_LIST` for catalog/facets,
 *                `CACHE_ITEM` for per-dataset endpoints. Defaults to
 *                `CACHE_ITEM` (the conservative choice).
 */
export async function cachedProxy(
  path: string,
  window: CacheWindow = CACHE_ITEM,
): Promise<Response> {
  const upstream = resolveUpstream();
  const url = `${upstream}${path}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(url, {
      method: 'GET',
      headers: {
        // Anonymous-public — no cookies, no auth. The whole point of
        // routing through this helper is that the response is identical
        // for every viewer; forwarding cookies would defeat the cache.
        Accept: 'application/json',
        // Identify the proxy hop in upstream logs.
        'User-Agent': 'ndi-cloud-app/edge-cached-proxy',
      },
      // Server-to-server fetch from Vercel function to Railway —
      // bypass Next.js's request-deduplication cache. Vercel's edge
      // cache (set by the response Cache-Control header below) is the
      // layer that absorbs concurrent traffic.
      cache: 'no-store',
    });
  } catch (err) {
    // Network blip — return a 502 with no-store so the failure
    // doesn't poison the cache. The next viewer triggers a fresh
    // attempt.
    const message = err instanceof Error ? err.message : 'upstream-error';
    return new Response(
      JSON.stringify({ error: 'upstream_unreachable', detail: message }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  // Pass non-2xx through with no-store so we don't cache 4xx/5xx.
  // Cache poisoning is the worst failure mode here — a single bad
  // upstream response cached for the window would lock every viewer
  // out.
  const cacheControl = upstreamRes.ok
    ? `public, s-maxage=${window.sMaxAge}, stale-while-revalidate=${window.swr}`
    : 'no-store';

  // Stream the body through. `Response` constructor accepts the
  // upstream body directly (a `ReadableStream`) — no JSON parse +
  // re-serialize, so the proxy adds zero CPU to the response path.
  const headers = new Headers();
  // Carry through content-type + content-encoding so the browser
  // decodes the body correctly.
  const contentType = upstreamRes.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const contentEncoding = upstreamRes.headers.get('content-encoding');
  if (contentEncoding) headers.set('Content-Encoding', contentEncoding);
  headers.set('Cache-Control', cacheControl);
  // Tell intermediaries that the response varies by Accept-Encoding
  // (gzip vs br) but NOT by cookie — every viewer gets the same
  // anonymous response.
  headers.set('Vary', 'Accept-Encoding');

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}

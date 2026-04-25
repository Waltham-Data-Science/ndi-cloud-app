/**
 * Cache-headers spec — locks in the audit-2026-04-23 #50 fix.
 *
 * The data-browser PR #76 shipped `Cache-Control` + `Vary: Cookie,
 * Accept-Encoding` on FastAPI responses to prevent stale per-user
 * payloads from being served to other viewers via shared edge caches.
 * The unification preserves that behavior end-to-end:
 *   - Direct API responses (when running against a preview URL with
 *     UPSTREAM_API_URL wired): Cache-Control + Vary on every response.
 *   - The `/datasets` catalog (RSC + ISR) carries `Cache-Control`
 *     emitted by Next's ISR layer + the rewrite preserves the
 *     upstream's Vary on /api/* responses.
 *
 * The non-preview half of this spec runs against `next dev` and just
 * verifies that the catalog page returns a 200 (no header assertions
 * — `next dev` doesn't emit ISR headers; the prod build does).
 */
import { expect, test } from '@playwright/test';

const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;

test('catalog /datasets responds with 200 (smoke)', async ({ request }) => {
  const baseUrl = PREVIEW_URL ?? 'http://localhost:3000';
  const res = await request.get(`${baseUrl}/datasets`);
  expect(res.ok()).toBe(true);
});

test.describe('cache headers (preview URL)', () => {
  test.skip(
    !PREVIEW_URL,
    'Cache-header assertions run against a real Vercel preview deploy.',
  );

  test('catalog /datasets carries an x-vercel-cache state header from the ISR layer', async ({
    request,
  }) => {
    // Warm up.
    await request.get(`${PREVIEW_URL}/datasets`);
    // Second request — should expose a cache state header.
    const res = await request.get(`${PREVIEW_URL}/datasets`);
    const headers = res.headers();
    // Next 16 emits cache state via `x-vercel-cache` (replaces older
    // Next versions' `x-nextjs-cache`). All four of these are valid
    // ISR states for the catalog:
    //   - HIT:         served from warm cache
    //   - STALE:       served from cache, background revalidation in flight
    //   - REVALIDATED: revalidation just completed inline
    //   - MISS:        cold cache (acceptable on first hit; the warm-up
    //                  request above doesn't always make the second hit
    //                  HIT because regional edge caches are independent)
    // Fail only on absence of the header or a value outside this set.
    const xVercelCache = headers['x-vercel-cache'];
    expect(
      xVercelCache,
      'x-vercel-cache header should be present',
    ).toBeDefined();
    expect(['HIT', 'STALE', 'MISS', 'REVALIDATED']).toContain(xVercelCache);
    // Belt and suspenders — the prerender flag from Next confirms ISR
    // path was used (vs. on-demand server render).
    expect(headers['x-nextjs-prerender']).toBe('1');
  });

  test('/api/* responses carry Vary: Cookie, Accept-Encoding', async ({
    request,
  }) => {
    const res = await request.get(`${PREVIEW_URL}/api/health/ready`);
    const vary = res.headers()['vary'] ?? '';
    expect(vary).toContain('Cookie');
    expect(vary).toContain('Accept-Encoding');
  });

  test('catalog /datasets is NOT vary-cookie (anonymous-public)', async ({
    request,
  }) => {
    const res = await request.get(`${PREVIEW_URL}/datasets`);
    const vary = res.headers()['vary'] ?? '';
    // The middleware matcher excludes /datasets specifically so ISR
    // doesn't get vary'd by Cookie. If this assertion fires, someone
    // accidentally added /datasets to the matcher.
    expect(vary).not.toContain('Cookie');
  });
});

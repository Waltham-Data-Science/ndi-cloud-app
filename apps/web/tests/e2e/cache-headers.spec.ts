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

  test('catalog /datasets carries x-nextjs-cache HIT|MISS on warm requests', async ({
    request,
  }) => {
    // Warm up.
    await request.get(`${PREVIEW_URL}/datasets`);
    // Second request — should be served from edge cache.
    const res = await request.get(`${PREVIEW_URL}/datasets`);
    const xCache = res.headers()['x-nextjs-cache'];
    // Either HIT (warm) or STALE / REVALIDATED (during revalidation
    // window). MISS indicates ISR isn't actually caching.
    expect(['HIT', 'STALE', 'REVALIDATED'], xCache).toContain(xCache);
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

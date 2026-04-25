/**
 * CSP middleware production verification — Phase 6.
 *
 * The middleware-emitted CSP nonce is the audit-2026-04-23 #58 fix.
 * Locally CI runs middleware tests against the request handler in
 * isolation; this spec asserts the nonce actually lands on responses
 * served by Vercel edge.
 *
 * **Gated on `PLAYWRIGHT_PREVIEW_URL`** — CI skips because `next dev`
 * doesn't run middleware on every response in the same way Vercel
 * edge does (the matcher behavior matches but the dev shell differs).
 */
import { expect, test } from '@playwright/test';

const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;

test.describe('CSP middleware (production)', () => {
  test.skip(
    !PREVIEW_URL,
    'CSP middleware verification runs against a Vercel preview URL ' +
      '(not `next dev`).',
  );

  test('emits Content-Security-Policy-Report-Only on /api/* responses', async ({
    request,
  }) => {
    const res = await request.get(`${PREVIEW_URL}/api/health/ready`);
    const csp = res.headers()['content-security-policy-report-only'];
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/nonce-/);
    expect(csp).toMatch(/'strict-dynamic'/);
  });

  test('uses a fresh nonce on consecutive requests', async ({ request }) => {
    const r1 = await request.get(`${PREVIEW_URL}/api/health/ready`);
    const r2 = await request.get(`${PREVIEW_URL}/api/health/ready`);
    const m1 = (r1.headers()['content-security-policy-report-only'] ?? '').match(
      /nonce-([^']+)'/,
    );
    const m2 = (r2.headers()['content-security-policy-report-only'] ?? '').match(
      /nonce-([^']+)'/,
    );
    expect(m1).not.toBeNull();
    expect(m2).not.toBeNull();
    expect(m1![1]).not.toBe(m2![1]);
  });

  test('returns 403 on POST /api/* with bad Origin', async ({ request }) => {
    const res = await request.post(
      `${PREVIEW_URL}/api/datasets/foo/bookmark`,
      {
        headers: { origin: 'https://evil.com' },
      },
    );
    expect(res.status()).toBe(403);
  });

  test('static security headers from vercel.json present on every response', async ({
    request,
  }) => {
    const res = await request.get(PREVIEW_URL!);
    const h = res.headers();
    expect(h['strict-transport-security']).toMatch(/max-age=63072000/);
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toMatch(/camera=\(\)/);
  });
});

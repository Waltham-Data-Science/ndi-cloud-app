/**
 * CSP proxy production verification.
 *
 * History:
 *   - The original audit-2026-04-23 #58 fix shipped a nonce-based CSP
 *     with `strict-dynamic`. That carried through Phase 5.
 *   - Phase 6.7 B2 simplified to a static CSP (`'self'` + a small
 *     allowlist of analytics/Railway/S3 hosts), no per-request nonce.
 *   - Phase 7 cutover (2026-04-29) flipped the header from
 *     `Content-Security-Policy-Report-Only` to `Content-Security-Policy`
 *     (enforced) after the soak ran clean.
 *
 * These tests pin the post-cutover contract: enforced header, static
 * shape, no nonce.
 *
 * **Gated on `PLAYWRIGHT_PREVIEW_URL`** — CI skips because `next dev`
 * doesn't run middleware on every response in the same way Vercel
 * edge does (the matcher behavior matches but the dev shell differs).
 */
import { expect, test } from '@playwright/test';

const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;

test.describe('CSP proxy (production)', () => {
  test.skip(
    !PREVIEW_URL,
    'CSP proxy verification runs against a Vercel preview URL ' +
      '(not `next dev`).',
  );

  test('emits enforced Content-Security-Policy on /api/* responses', async ({
    request,
  }) => {
    const res = await request.get(`${PREVIEW_URL}/api/health/ready`);
    const csp = res.headers()['content-security-policy'];
    expect(csp).toBeTruthy();
    // B2 dropped per-request nonce + strict-dynamic — static shape only.
    expect(csp).not.toMatch(/nonce-/);
    expect(csp).not.toMatch(/'strict-dynamic'/);
  });

  test('does NOT emit Report-Only header (Phase 7 flipped to enforced)', async ({
    request,
  }) => {
    const res = await request.get(`${PREVIEW_URL}/api/health/ready`);
    expect(
      res.headers()['content-security-policy-report-only'],
    ).toBeUndefined();
  });

  test('CSP includes the canonical script-src allowlist (self + GTM/GA)', async ({
    request,
  }) => {
    const res = await request.get(`${PREVIEW_URL}/api/health/ready`);
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/googletagmanager\.com/);
    expect(csp).toMatch(/google-analytics\.com/);
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

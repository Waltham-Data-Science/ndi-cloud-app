/**
 * Cookie roundtrip — Phase 4 manual verification gate.
 *
 * Runs against a real Vercel preview URL where the FastAPI proxy is
 * wired (`UPSTREAM_API_URL` set). The CI playwright job uses
 * `next dev` which has no upstream, so this spec auto-skips unless
 * `PLAYWRIGHT_PREVIEW_URL` is exported in the env.
 *
 * Verifies the Phase 4 cookie contract end-to-end:
 *   - POST /api/auth/login → server sets the session cookie
 *   - Cookie has `Domain=.ndi-cloud.com` (apex) so subsequent
 *     `/api/*` calls from any subdomain carry it
 *   - Cookie is `HttpOnly: true` (JS can't read it; only the server
 *     uses it for session validation)
 *   - Cookie is `Secure: true` (transmitted only over HTTPS)
 *
 * Phase 7 swap depends on these three cookie attributes — without
 * `Domain=.ndi-cloud.com` the legacy `app.ndi-cloud.com` cookie path
 * doesn't apply to the new apex, and users would be silently logged
 * out at swap time.
 */
import { test, expect } from '@playwright/test';

const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;
const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL;
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD;

test.describe('cookie roundtrip (Phase 4 manual gate)', () => {
  test.skip(
    !PREVIEW_URL || !TEST_EMAIL || !TEST_PASSWORD,
    'Cookie-roundtrip spec only runs against a real preview deploy. ' +
      'Set PLAYWRIGHT_PREVIEW_URL + PLAYWRIGHT_TEST_EMAIL + ' +
      'PLAYWRIGHT_TEST_PASSWORD in env to enable.',
  );

  test('login sets a Domain=.ndi-cloud.com HttpOnly Secure session cookie', async ({
    page,
    context,
  }) => {
    await page.goto(`${PREVIEW_URL}/login`);
    await page.getByLabel(/email/i).fill(TEST_EMAIL!);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD!);
    await page.getByRole('button', { name: /log in/i }).click();

    // Wait for the post-login redirect to /my (or /my-account).
    await page.waitForURL(/\/(my|my-account)/);

    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === 'session');
    expect(session, 'session cookie should be set after login').toBeDefined();
    expect(session?.domain).toBe('.ndi-cloud.com');
    expect(session?.httpOnly).toBe(true);
    expect(session?.secure).toBe(true);
  });

  test('subsequent /api/* call carries the session cookie via the rewrite', async ({
    page,
  }) => {
    await page.goto(`${PREVIEW_URL}/login`);
    await page.getByLabel(/email/i).fill(TEST_EMAIL!);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD!);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(/\/(my|my-account)/);

    // Hit /api/auth/me through the Vercel rewrite — should return 200
    // with the user payload. If the cookie's Domain attribute is wrong,
    // the browser won't include it on the API request → 401.
    const meResponse = await page.request.get(`${PREVIEW_URL}/api/auth/me`);
    expect(meResponse.ok()).toBe(true);
    const me = await meResponse.json();
    expect(me.email).toBe(TEST_EMAIL);
  });
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config.
 *
 * Two run modes:
 *
 *   1. **Local / CI default** — no `PLAYWRIGHT_PREVIEW_URL` env var. Boots
 *      `pnpm start` (production build of the Next server) on
 *      127.0.0.1:3000 and points the suite at it. Specs gated on
 *      `PLAYWRIGHT_PREVIEW_URL` (cookie-roundtrip, csp-headers,
 *      cache-headers) auto-skip in this mode because they rely on
 *      real Vercel infrastructure.
 *
 *   2. **Preview / production verification** — `PLAYWRIGHT_PREVIEW_URL`
 *      points at a live Vercel deploy URL. Specs target that URL via
 *      `baseURL` (for `page.goto('/')` style relative nav) AND via
 *      `process.env.PLAYWRIGHT_PREVIEW_URL` reads inside the gated
 *      specs (which use `request.get(PREVIEW_URL!)` directly). The
 *      local webServer is skipped — there's no point in booting a
 *      local server when the suite targets a remote URL.
 *
 * The `webServer.command` runs the production-build server (`pnpm
 * start`), not `pnpm dev`, so even local runs exercise the production
 * code path including ISR, middleware, and the build-time RSC
 * dehydrate / hydrate handoff.
 */
const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: PREVIEW_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  // Only boot a local server when no preview URL is set. Against a
  // preview URL, booting a local server is dead weight (port collision
  // risk + 2-min timeout if `pnpm start` fails because no .next/ build).
  ...(PREVIEW_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm start',
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});

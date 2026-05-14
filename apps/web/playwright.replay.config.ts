import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the /ask replay harness.
 *
 * Distinct from `playwright.config.ts` (the e2e suite) because:
 *
 *   1. Replay specs make direct HTTP POSTs via fetch() — no browser,
 *      no page navigation, no need for chromium/firefox projects.
 *   2. Replay specs target a LIVE preview deploy via REPLAY_TARGET_URL.
 *      There's no local Next.js server to boot.
 *   3. We pin `workers: 1` because the /api/ask rate-limiter is per-IP
 *      and a Vercel preview behind the same edge sees all our requests
 *      as one client. Two parallel prompts would 429 the second.
 *   4. Per-prompt timeout is 60s (matches /api/ask's `maxDuration`)
 *      vs the e2e default of 30s.
 *
 * Run via `pnpm test:replay` after exporting REPLAY_TARGET_URL.
 * Tests skip cleanly when REPLAY_TARGET_URL is unset — keeping local
 * `pnpm test:replay --list` viable without an Anthropic key.
 */
export default defineConfig({
  testDir: './tests/replay',
  // Sequential, deterministic — see header comment.
  fullyParallel: false,
  workers: 1,
  // 60s per test, matches the upstream /api/ask maxDuration cap.
  timeout: 60_000,
  // Replay specs are inherently flaky against a live LLM (rare 529s
  // from Anthropic). One retry buys us robustness without inflating
  // cost much.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-replay-report', open: 'never' }]]
    : 'list',
  // No browser projects — replay tests use Node's global fetch only.
  // (Playwright still drives the test runner, just without a browser.)
  projects: [
    {
      name: 'replay',
    },
  ],
});

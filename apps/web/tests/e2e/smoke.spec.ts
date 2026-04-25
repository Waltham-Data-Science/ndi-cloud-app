import { test, expect } from '@playwright/test';

/**
 * Phase 1 placeholder smoke test. Proves the Next.js production server
 * boots and serves the marketing home route. Phase 6 ports 10 real specs
 * from ndi-data-browser-v2/frontend/tests-e2e/.
 */
test('marketing home loads with display heading', async ({ page }) => {
  await page.goto('/');
  // Match a stable substring of the display heading; Phase 6 will add
  // tighter Lighthouse + content snapshot tests.
  await expect(page.locator('h1')).toContainText('Neuroscience datasets');
});

test('data browser catalog (RSC) loads with the published-datasets heading', async ({
  page,
}) => {
  await page.goto('/datasets');
  // Phase 3a turned this from a placeholder into RSC + ISR with a real
  // hero heading. Match the substring rather than the full string so a
  // future copy revision (e.g. "Open neuroscience datasets") doesn't
  // immediately fail this gate.
  await expect(page.locator('h1')).toContainText(
    /Published neuroscience datasets/i,
  );
});

test('404 route renders not-found page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
  // The redesigned 404 puts "404 · Page not found" in an eyebrow div above
  // the h1 — h1 carries the friendly heading. Both should be visible.
  // Page source uses a curly apostrophe (`’`); avoid the apostrophe
  // edge-case in the assertion by matching the substring around it.
  await expect(page.locator('h1')).toContainText('find that page');
  await expect(page.getByText('404 · Page not found')).toBeVisible();
});

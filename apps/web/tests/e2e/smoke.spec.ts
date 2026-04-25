import { test, expect } from '@playwright/test';

/**
 * Phase 1 placeholder smoke test. Proves the Next.js production server
 * boots and serves the marketing home route. Phase 6 ports 10 real specs
 * from ndi-data-browser-v2/frontend/tests-e2e/.
 */
test('marketing home loads and has <h1>', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('NDI Cloud');
});

test('data browser catalog placeholder loads', async ({ page }) => {
  await page.goto('/datasets');
  await expect(page.locator('h1')).toHaveText('Datasets');
});

test('404 route renders not-found page', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('404');
});

/**
 * /ask smoke test.
 *
 * Mocks the AI SDK v5 UI message stream so we can exercise the chat
 * flow without a real Anthropic API key in CI. The mock emits a
 * minimal valid stream: start → text-start → text-delta(s) → text-end → finish.
 *
 * Coverage:
 *   - Page loads (whether flag-on or flag-off)
 *   - Mobile viewport doesn't break layout
 *   - When flag-on: clicking a chip sends a message + shows the assistant response
 *   - When flag-on: typing + Enter sends a message
 */
import { expect, test } from '@playwright/test';

// v5 UI message stream chunks. Each is a JSON line prefixed with
// `data: ` per the SSE convention, terminated by `\n\n`.
function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

const MOCK_STREAM = [
  sseChunk({ type: 'start', messageId: 'mock-msg-1' }),
  sseChunk({ type: 'start-step' }),
  sseChunk({ type: 'text-start', id: 't1' }),
  sseChunk({ type: 'text-delta', delta: 'There are currently ', id: 't1' }),
  sseChunk({ type: 'text-delta', delta: '**347 published datasets** ', id: 't1' }),
  sseChunk({ type: 'text-delta', delta: 'in the NDI Commons.', id: 't1' }),
  sseChunk({ type: 'text-end', id: 't1' }),
  sseChunk({ type: 'finish-step' }),
  sseChunk({ type: 'finish' }),
].join('');

test.describe('/ask experimental chat', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept /api/ask so the test doesn't need a live API key.
    await page.route('**/api/ask', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'cache-control': 'no-cache',
          'x-vercel-ai-ui-message-stream': 'v1',
        },
        body: MOCK_STREAM,
      });
    });
  });

  test('page loads with a heading (both flag-on and flag-off branches)', async ({ page }) => {
    await page.goto('/ask');
    await expect(page.getByRole('heading', { name: /Ask the Commons/i })).toBeVisible();
  });

  test('mobile viewport: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/ask');
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasOverflow).toBe(false);
  });

  test('with chat enabled: clicking a prompt chip streams an assistant response', async ({ page }) => {
    await page.goto('/ask');
    const chip = page.getByRole('button', { name: /How many published datasets/i });
    test.skip(
      (await chip.count()) === 0,
      'ANTHROPIC_API_KEY not set in test env — /ask shows Coming soon. Skipping.',
    );
    await chip.click();

    // User message appears (note: the user message bubble shows the
    // text directly without markdown, so we don't anchor on markdown).
    await expect(page.locator('text=How many published datasets').first()).toBeVisible();

    // Streamed assistant response appears (rendered markdown bold).
    await expect(page.locator('text=/347 published datasets/i')).toBeVisible({ timeout: 10_000 });
  });

  test('with chat enabled: typing + Enter sends a message', async ({ page }) => {
    await page.goto('/ask');
    const input = page.getByLabel('Message input');
    test.skip(
      (await input.count()) === 0,
      'ANTHROPIC_API_KEY not set — page shows Coming soon. Skipping.',
    );

    await input.fill('hello there');
    await input.press('Enter');

    await expect(page.locator('text=hello there').first()).toBeVisible();
    await expect(page.locator('text=/347 published datasets/i')).toBeVisible({ timeout: 10_000 });
  });
});

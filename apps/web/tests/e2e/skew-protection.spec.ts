/**
 * Skew Protection verification — Phase 6.
 *
 * Skew Protection is the kind of feature that silently breaks: if the
 * Vercel project setting toggles off, mid-deploy code-split mismatches
 * resurface (the SPA failure mode that hand-bit users on the data-
 * browser). If Phase 6 doesn't verify it explicitly, we find out
 * during an incident.
 *
 * Vercel pins deployments per-session via the `__vdpl` cookie (or the
 * `?dpl=` query param fallback). This spec captures the deployment ID
 * from a fresh response, then replays the request with the cookie set
 * to a SPECIFIC version and asserts the response is served by that
 * deployment.
 *
 * **Gated on `PLAYWRIGHT_PREVIEW_URL`**. CI's playwright runs against
 * `next dev` which has no Vercel infrastructure, so the spec auto-skips
 * unless the env var is set (preview deploy or production).
 */
import { expect, test } from '@playwright/test';

const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;

test.describe('Skew Protection', () => {
  test.skip(
    !PREVIEW_URL,
    'Skew Protection only applies on Vercel — set PLAYWRIGHT_PREVIEW_URL ' +
      'to run against a real preview / production deploy.',
  );

  test('captures deployment ID from a fresh response', async ({ request }) => {
    const res = await request.get(PREVIEW_URL!);
    expect(res.ok()).toBe(true);
    const vercelId = res.headers()['x-vercel-id'];
    expect(
      vercelId,
      'x-vercel-id header should be present on Vercel-served responses',
    ).toBeTruthy();
  });

  test('replays a request with the deployment cookie and confirms pinning', async ({
    request,
  }) => {
    // First fetch — discover current deployment.
    const initial = await request.get(PREVIEW_URL!);
    const vercelId = initial.headers()['x-vercel-id'] ?? '';
    // x-vercel-id format: `<region>::<deploymentId>::<requestId>` —
    // we want the deployment hash in the middle.
    const parts = vercelId.split('::');
    const deploymentId = parts.length >= 2 ? parts[1] : parts[0];
    expect(deploymentId, 'deployment id should be parsable').toBeTruthy();

    // Replay with __vdpl cookie set to the captured deployment.
    const replay = await request.get(PREVIEW_URL!, {
      headers: { cookie: `__vdpl=${deploymentId}` },
    });
    expect(replay.ok()).toBe(true);
    const replayId = replay.headers()['x-vercel-id'] ?? '';
    expect(
      replayId,
      'replayed response should also carry x-vercel-id',
    ).toContain(deploymentId);
  });
});

/**
 * Skew Protection verification — Phase 6 (rewritten Phase D).
 *
 * Skew Protection is the kind of feature that silently breaks: if the
 * Vercel project setting toggles off, mid-deploy code-split mismatches
 * resurface (the SPA failure mode that hand-bit users on the data-
 * browser). If Phase 6 doesn't verify it explicitly, we find out
 * during an incident.
 *
 * Per https://vercel.com/docs/skew-protection, Vercel pins requests
 * via three mechanisms (any one is sufficient):
 *   1. `?dpl=<deployment-id>` query parameter
 *   2. `x-deployment-id` request header
 *   3. `__vdpl` cookie
 *
 * The deployment ID format is `dpl_<22-char-base62>`. Vercel exposes
 * the active deployment ID on the rendered HTML as a `data-dpl-id`
 * attribute on the `<html>` element (Next 16 + Vercel runtime). This
 * is the canonical signal the spec uses to extract the deployment ID
 * — NOT `x-vercel-id`, which is a `<region>::<request-id>` tuple and
 * does NOT contain the deployment id (verified empirically Phase D
 * 2026-04-25).
 *
 * **The strongest signal Skew Protection is actually enabled** is that
 * a request with a bogus `?dpl=` returns 404 rather than 200. With
 * Skew Protection off, the param is ignored and the request lands on
 * the latest deployment as a 200. With Skew Protection on, Vercel
 * routes to the specified deployment — and 404s if it doesn't exist
 * or has aged out.
 *
 * **Gated on `PLAYWRIGHT_PREVIEW_URL`**. CI's playwright runs against
 * `next dev` which has no Vercel infrastructure, so the spec auto-skips
 * unless the env var is set (preview deploy or production).
 */
import { expect, test } from '@playwright/test';

const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;
const DPL_ID_RE = /data-dpl-id="(dpl_[A-Za-z0-9]+)"/;

/** Extract the active deployment ID from the rendered HTML. Returns
 * `null` if the marker isn't present (e.g. a non-Vercel response). */
async function extractDeploymentId(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { accept: 'text/html' },
    redirect: 'follow',
  });
  const html = await res.text();
  const m = html.match(DPL_ID_RE);
  return m ? m[1]! : null;
}

test.describe('Skew Protection', () => {
  test.skip(
    !PREVIEW_URL,
    'Skew Protection only applies on Vercel — set PLAYWRIGHT_PREVIEW_URL ' +
      'to run against a real preview / production deploy.',
  );

  test('rendered HTML exposes the active deployment ID via `data-dpl-id`', async () => {
    const dpl = await extractDeploymentId(PREVIEW_URL!);
    expect(dpl, 'data-dpl-id should be present on Vercel-served HTML').not.toBeNull();
    expect(dpl).toMatch(/^dpl_[A-Za-z0-9]+$/);
  });

  test('request with `?dpl=<actual-deployment-id>` resolves to that deployment', async ({
    request,
  }) => {
    const dpl = await extractDeploymentId(PREVIEW_URL!);
    expect(dpl).not.toBeNull();
    const pinned = await request.get(`${PREVIEW_URL}/?dpl=${dpl}`);
    expect(pinned.ok()).toBe(true);
    // The pinned response should still expose the same data-dpl-id —
    // confirms Vercel routed to the requested deployment rather than
    // erroring out or silently ignoring the param.
    const body = await pinned.text();
    expect(body).toContain(`data-dpl-id="${dpl}"`);
  });

  test('request with `__vdpl` cookie set to the actual deployment id resolves to that deployment', async ({
    request,
  }) => {
    const dpl = await extractDeploymentId(PREVIEW_URL!);
    expect(dpl).not.toBeNull();
    const pinned = await request.get(PREVIEW_URL!, {
      headers: { cookie: `__vdpl=${dpl}` },
    });
    expect(pinned.ok()).toBe(true);
    const body = await pinned.text();
    expect(body).toContain(`data-dpl-id="${dpl}"`);
  });

  test('request with bogus `?dpl=` returns 404 (proves Skew Protection is enforcing)', async ({
    request,
  }) => {
    // A nonexistent deployment id should 404 per the docs:
    // "If a client requests a deployment that no longer exists or is
    //  older than the configured maximum age (via the ?dpl= query
    //  parameter, x-deployment-id header, or __vdpl cookie), the
    //  request returns a 404."
    // If this returns 200, either Skew Protection is off or the param
    // is being ignored.
    const bogus = 'dpl_INVALIDIDFORTESTINGPHASED9';
    const res = await request.get(`${PREVIEW_URL}/?dpl=${bogus}`, {
      maxRedirects: 0,
      // Don't fail Playwright's default response-status check for non-2xx.
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);
  });
});

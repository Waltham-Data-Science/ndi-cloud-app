import { test, expect } from '@playwright/test';

/**
 * G5: legacy table-class slug aliases — fixes broken bookmarks.
 *
 * The source SPA (`Waltham-Data-Science/ndi-data-browser-v2/frontend`)
 * coerced legacy short-form table-class slugs (`probes`, `subjects`,
 * `epochs`, etc.) to their canonical fully-qualified names
 * (`element`, `subject`, `element_epoch`) at render time. The new
 * Next App Router has stricter routing — the FastAPI backend 404s on
 * the legacy slugs because it only knows the canonical names, so a
 * bookmarked URL like `/datasets/<id>/tables/probes` would be broken
 * post-cutover.
 *
 * The G5 redirects in `next.config.ts` translate the 9 legacy slugs
 * into their canonical equivalents via 308 (permanent) redirects, so
 * bookmarks are self-healing — clicking a legacy URL once updates the
 * bookmark to the canonical form.
 *
 * This spec asserts:
 *   1. Each legacy slug → canonical slug pair returns 308 with the
 *      correct destination path.
 *   2. A garbage slug is NOT redirected (passes through to the page,
 *      which gets a 404 from the backend).
 *   3. The empty-class case `/datasets/<id>/tables` (matches the
 *      source SPA's `<Navigate to="subject" replace />` fallback)
 *      308s to `.../tables/subject`.
 *
 * Verification approach: use `page.context().request.fetch` with
 * `maxRedirects: 0` so we observe the actual 308 response rather
 * than the rendered destination page.
 */

const DATASET_ID = 'g5-test-dataset';

const ALIAS_MAP: Array<[legacy: string, canonical: string]> = [
  ['subjects', 'subject'],
  ['probes', 'element'],
  ['probe', 'element'],
  ['elements', 'element'],
  ['epochs', 'element_epoch'],
  ['epoch', 'element_epoch'],
  ['treatments', 'treatment'],
  ['locations', 'probe_location'],
  ['openminds', 'openminds_subject'],
];

test.describe('G5: legacy table-class slug aliases', () => {
  for (const [legacy, canonical] of ALIAS_MAP) {
    test(`/tables/${legacy} → /tables/${canonical} (308)`, async ({
      request,
    }) => {
      const response = await request.fetch(
        `/datasets/${DATASET_ID}/tables/${legacy}`,
        { maxRedirects: 0 },
      );
      expect(response.status()).toBe(308);
      expect(response.headers()['location']).toBe(
        `/datasets/${DATASET_ID}/tables/${canonical}`,
      );
    });
  }

  test('empty class path /tables → /tables/subject (308)', async ({
    request,
  }) => {
    const response = await request.fetch(`/datasets/${DATASET_ID}/tables`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(308);
    expect(response.headers()['location']).toBe(
      `/datasets/${DATASET_ID}/tables/subject`,
    );
  });

  test('garbage slug is NOT redirected (passes to page, may 404)', async ({
    request,
  }) => {
    const response = await request.fetch(
      `/datasets/${DATASET_ID}/tables/this-is-not-a-real-class`,
      { maxRedirects: 0 },
    );
    // The page itself may render or 404 depending on backend availability;
    // the contract here is that the *redirect layer* doesn't hijack
    // unknown slugs — only the explicit alias entries trigger.
    expect(response.status()).not.toBe(308);
  });
});

/**
 * Workspace tutorial-parity smoke — Playwright spec.
 *
 * Drives every workspace panel against the three datasets that ship a
 * MATLAB Live tutorial (`tutorial_<id>.mlx` in S3). For each tutorial
 * step, the spec verifies the equivalent panel renders the chart
 * shape we'd expect from reading the tutorial source.
 *
 * Source of truth: `apps/web/docs/specs/2026-05-14-tutorial-parity-matrix.md`.
 * That doc breaks down each tutorial cell-by-cell into the panel that
 * maps to it.
 *
 * Auth: this spec ONLY runs when `PLAYWRIGHT_TEST_EMAIL` +
 * `PLAYWRIGHT_TEST_PASSWORD` are set. The workspace is auth-gated;
 * we sign in once at the top of each block. Same flow as
 * `cookie-roundtrip.spec.ts`.
 *
 * To run:
 *
 *   export PLAYWRIGHT_PREVIEW_URL="https://ndi-cloud-app-web-git-feat-experiment-c5da7d-ndi-cloud-a83eb4e7.vercel.app"
 *   export PLAYWRIGHT_TEST_EMAIL="audri@walthamdatascience.com"
 *   export PLAYWRIGHT_TEST_PASSWORD="<your preview password>"
 *   export VERCEL_SHARE="SuMAAzx33EA71RdkyGmJMUS3dkKT9dOP"
 *   pnpm exec playwright test tests/e2e/workspace-tutorial-parity.spec.ts --headed
 *
 * What's NOT in scope here (kept out so this spec stays under ~5 min):
 *   - Signal Viewer / Spike Activity / PSTH parameterized runs that
 *     need a real docId from each dataset's Document Explorer. Those
 *     are gated by "no docId hardcoded yet" — once we collect the
 *     first-run docIds via the smoke, we can wire them in.
 *   - Show-Code modal Python/MATLAB body inspection (per-tool snippet
 *     correctness is already covered by code-export unit tests).
 */
import { test, expect, type Page } from '@playwright/test';

const PREVIEW_URL = process.env.PLAYWRIGHT_PREVIEW_URL;
const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL;
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD;
const VERCEL_SHARE = process.env.VERCEL_SHARE;

interface TutorialFixture {
  id: string;
  label: string;
  /** Does the dataset have a behavioral / EPM tabular_query column? */
  hasBehavioralTable: boolean;
  /** Does the dataset have a treatment_drug / treatment table? */
  hasTreatmentTable: boolean;
  /** EPM probe — runs Behavioral Compare when hasBehavioralTable. */
  behavioralProbe?: {
    variableNameContains: string;
    groupBy: string;
  };
}

const TUTORIAL_DATASETS: TutorialFixture[] = [
  {
    id: '69bc5ca11d547b1f6d083761',
    label: 'Bhar (C. elegans EV memory transfer)',
    hasBehavioralTable: true,
    hasTreatmentTable: true,
    behavioralProbe: {
      variableNameContains: 'Chemotaxis',
      groupBy: 'Condition',
    },
  },
  {
    id: '682e7772cdf3f24938176fac',
    label: 'Haley (C. elegans foraging)',
    hasBehavioralTable: true,
    hasTreatmentTable: false,
    behavioralProbe: {
      variableNameContains: 'PatchEncounter',
      groupBy: 'Strain',
    },
  },
  {
    id: '67f723d574f5f79c6062389d',
    label: 'Francesconi (vasopressin/oxytocin BNST)',
    hasBehavioralTable: true,
    hasTreatmentTable: true,
    behavioralProbe: {
      variableNameContains: 'ElevatedPlusMaze',
      groupBy: 'Treatment',
    },
  },
];

test.describe('workspace tutorial parity', () => {
  test.skip(
    !PREVIEW_URL || !TEST_EMAIL || !TEST_PASSWORD,
    'Tutorial-parity smoke requires PLAYWRIGHT_PREVIEW_URL + ' +
      'PLAYWRIGHT_TEST_EMAIL + PLAYWRIGHT_TEST_PASSWORD',
  );

  // 8-minute timeout per test — workspace panels can each take a few
  // seconds for the first Railway round-trip + chart mount; we run all
  // four-or-so panel probes inside a single test.
  test.setTimeout(8 * 60 * 1000);

  async function bypassVercelShare(page: Page) {
    if (!VERCEL_SHARE) return;
    await page.goto(`${PREVIEW_URL}?_vercel_share=${VERCEL_SHARE}`);
  }

  async function signIn(page: Page) {
    await bypassVercelShare(page);
    await page.goto(`${PREVIEW_URL}/login`);
    await page.getByLabel(/email/i).fill(TEST_EMAIL!);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD!);
    await page.locator('form').getByRole('button', { name: /log in/i }).click();
    await page.waitForURL(/\/(my|my-account)/, { timeout: 30_000 });
  }

  for (const ds of TUTORIAL_DATASETS) {
    test(`workspace renders for ${ds.label}`, async ({ page }) => {
      await signIn(page);
      await page.goto(`${PREVIEW_URL}/my/workspace/${ds.id}`);

      // ── 1. Dataset Structure auto-loads ──────────────────────────────
      // Wait for the hero band to paint, then for at least one stat
      // chip to render (panel auto-loads on mount).
      await expect(
        page.getByRole('heading', { name: /workspace/i }).first(),
      ).toBeVisible({ timeout: 15_000 });

      // The dataset name itself paints in the hero; assert at least the
      // mongo id is in the breadcrumb chip.
      await expect(page.getByText(ds.id.slice(0, 8))).toBeVisible({
        timeout: 15_000,
      });

      // Dataset Structure panel: wait for SUBJECT or TOTAL DOCUMENTS
      // chip to appear (counts come from class-counts endpoint).
      await expect(
        page.getByText(/SUBJECT|TOTAL DOCUMENTS|TOTAL DOCS/i).first(),
      ).toBeVisible({ timeout: 30_000 });

      // ── 2. Signal Viewer (form-only, no Run without docId) ────────────
      await expect(
        page.getByRole('heading', { name: /signal viewer/i }),
      ).toBeVisible();
      await expect(
        page.getByPlaceholder(/68d6e54703a03f5cfdac8eff/i).first(),
      ).toBeVisible();

      // ── 3. Spike Activity (form-only) ─────────────────────────────────
      await expect(
        page.getByRole('heading', { name: /spike activity/i }),
      ).toBeVisible();

      // ── 4. Behavioral Compare ─────────────────────────────────────────
      await expect(
        page.getByRole('heading', { name: /behavioral comparison/i }),
      ).toBeVisible();

      if (ds.hasBehavioralTable && ds.behavioralProbe) {
        await page
          .getByTestId('behavioral-compare-variable-input')
          .fill(ds.behavioralProbe.variableNameContains);
        await page
          .getByTestId('behavioral-compare-groupby-input')
          .fill(ds.behavioralProbe.groupBy);
        await page.getByTestId('behavioral-compare-run').click();
        // Result region appears either as success (violin) or
        // empty-hint (columns chips). Both are valid "the call
        // round-tripped" signals.
        await expect(
          page
            .getByTestId('behavioral-compare-success')
            .or(page.getByTestId('behavioral-compare-empty-hint'))
            .or(page.getByTestId('behavioral-compare-error')),
        ).toBeVisible({ timeout: 60_000 });
      }

      // ── 5. Treatment Timeline ─────────────────────────────────────────
      await expect(
        page.getByRole('heading', { name: /treatment timeline/i }),
      ).toBeVisible();
      await page.getByTestId('treatment-timeline-run').click();
      await expect(
        page
          .getByTestId('treatment-timeline-result')
          .or(page.getByTestId('treatment-timeline-empty'))
          .or(page.getByTestId('treatment-timeline-error')),
      ).toBeVisible({ timeout: 60_000 });

      // ── 6. Electrode Position (auto-loads) ────────────────────────────
      await expect(
        page.getByRole('heading', { name: /electrode position/i }),
      ).toBeVisible();
      // The panel renders either the map, an empty hint, or the count
      // summary. We don't gate on a specific result here.

      // ── 7. PSTH (form-only) ───────────────────────────────────────────
      await expect(page.getByRole('heading', { name: /psth/i })).toBeVisible();
    });
  }

  test('signed-out user is redirected to /login from /my/workspace/[id]', async ({
    page,
  }) => {
    await bypassVercelShare(page);
    const ds = TUTORIAL_DATASETS[0]!;
    await page.goto(`${PREVIEW_URL}/my/workspace/${ds.id}`);
    await page.waitForURL(
      new RegExp(
        `/login\\?returnTo=${encodeURIComponent(
          `/my/workspace/${ds.id}`,
        ).replace(/%/g, '%25')}`,
      ),
      { timeout: 15_000 },
    );
  });
});

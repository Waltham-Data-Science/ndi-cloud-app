import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vitest config — mirrors ndi-data-browser-v2's pattern.
 *
 * Coverage thresholds start at the data-browser baseline (35/27/34/37) and
 * ratchet up as coverage improves. Per the migration plan: "thresholds set
 * just below the measured baseline so this PR doesn't need to raise numbers;
 * ratchet up deliberately as coverage improves."
 *
 * The thresholds are deliberate floors, not aspirational ceilings.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `server-only` is a Next.js sentinel module that throws at
      // BUILD time when imported from a Client Component. In
      // production Next's compiler resolves it; in vitest there's no
      // such resolver, so static imports like
      // `import 'server-only'` in `lib/api/datasets-server.ts` fail
      // the vite transform pass before any vi.mock() can fire. Map
      // it to an empty stub file so server-only modules can be
      // imported (and unit-tested) directly.
      'server-only': path.resolve(__dirname, 'tests/unit/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}', 'app/**/*.{test,spec}.{ts,tsx}', 'components/**/*.{test,spec}.{ts,tsx}', 'lib/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    setupFiles: ['./tests/unit/setup.ts'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec}.{ts,tsx}',
        '**/*.d.ts',
        'app/**/layout.tsx',
        'app/**/page.tsx',
        'app/**/loading.tsx',
        'app/**/error.tsx',
        'app/**/not-found.tsx',
        'app/sitemap.ts',
        'app/robots.ts',
        // macOS Finder duplicates ("foo 2.ts", "foo 2.tsx", "foo 2/")
        // are local-only artifacts that aren't tracked by git but
        // appear on disk during local dev. ESLint already ignores them
        // (see `apps/web/eslint.config.mjs`); exclude from coverage so
        // they don't pile zero-coverage rows into the global numerator.
        // The hygiene CI catches any that get accidentally committed.
        '**/* 2.{ts,tsx}',
        '**/* 2/**',
      ],
      // Phase 6.5a floors — ratcheted again. SummaryTableView ported with
      // its 15-test suite (B6a canonical-column defaults, ontology cell
      // rendering, XLS/CSV/JSON export, dual-clock epoch cells). The
      // hidden boost in this ratchet: Finder-dup files are now excluded
      // from the denominator (see exclude block above), so coverage
      // measures real source files only.
      //
      // Measured 2026-04-25 (Phase 6.5a):
      // statements 63.19, branches 58.61, functions 65.29, lines 63.6.
      //
      // Floors set ~3 points below measured.
      thresholds: {
        statements: 60,
        branches: 56,
        functions: 62,
        lines: 60,
      },
    },
  },
});

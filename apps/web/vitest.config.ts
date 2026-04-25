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
      ],
      // Phase 3b floors — ratcheted again from Phase 3a's 43/45/48/43
      // baseline. The 11 tab-a11y tests + 5 hero tests + 14 shell tests
      // pulled coverage up across all four metrics.
      //
      // Measured 2026-04-25 (Phase 3b, after detail layout + tab bar):
      // statements 49.63, branches 52.79, functions 55.17, lines 49.54.
      //
      // Floors set ~2 points below measured so routine churn within a
      // sub-phase doesn't trip the gate; Phase 3c's MyDatasets
      // virtualization adds tests for #64 close.
      thresholds: {
        statements: 47,
        branches: 50,
        functions: 53,
        lines: 47,
      },
    },
  },
});

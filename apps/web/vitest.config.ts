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
      // Phase 3a floors — ratcheted up from Phase 2b's 35/33/45/35
      // baseline as `lib/api/*` + `components/ui/*` ports landed with
      // their tests carried over from data-browser plus new hook /
      // primitive smoke tests written in this PR.
      //
      // Measured 2026-04-25 (Phase 3a, after datasets + ui + hooks):
      // statements 45.30, branches 47.47, functions 50.94, lines 45.00.
      //
      // Floors set ~2 points below measured so routine churn within a
      // sub-phase doesn't trip the gate; the next sub-phase ratchets
      // again as Phase 3b–3e ports + audit fixes (#65, #64, #66) land
      // with their full data-browser test suites.
      thresholds: {
        statements: 43,
        branches: 45,
        functions: 48,
        lines: 43,
      },
    },
  },
});

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
      // Phase 3d floors — ratcheted again. OntologyPopover rewritten
      // on FloatingPanel (audit #66 close) + ontology-utils + lib/api/
      // ontology landed with their full test suites.
      //
      // Measured 2026-04-25 (Phase 3d, after OntologyPopover):
      // statements 56.20, branches 56.53, functions 60.28, lines 55.85.
      //
      // Floors set ~2 points below measured.
      thresholds: {
        statements: 54,
        branches: 54,
        functions: 58,
        lines: 53,
      },
    },
  },
});

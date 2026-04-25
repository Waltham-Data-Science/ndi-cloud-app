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
      // Phase 2b baseline floors. The 9 auth pages added in 2b are
      // mostly client-side form code (handlers + state + API call); the
      // /login form has a unit-test pattern at
      // tests/unit/(marketing)/login.test.tsx that the other 8 forms
      // follow. Comprehensive auth-form coverage lands in Phase 6
      // (Playwright e2e against a real preview deploy with a real
      // backend) — that's the authoritative test level for these.
      //
      // For this PR the thresholds drop to just below the measured
      // baseline (so routine refactor doesn't trip the gate); Phase 3a
      // ratchets back up as `lib/api/*` + `components/ui/*` ports land
      // with their full test suites carried over from data-browser.
      // Values are deliberate floors, not aspirational ceilings.
      //
      // Measured 2026-04-25 (Phase 2b, after login-form test added):
      // statements 37.66, branches 35.98, functions 47.05, lines 36.63.
      thresholds: {
        statements: 35,
        branches: 33,
        functions: 45,
        lines: 35,
      },
    },
  },
});

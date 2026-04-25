/**
 * Vitest unit-test setup. Loads jest-dom matchers (toBeInTheDocument, etc.)
 * and mocks Next.js font modules that don't load cleanly in jsdom.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Reset the DOM between tests so test isolation is guaranteed.
afterEach(() => {
  cleanup();
});

// `geist/font/*` internally imports `next/font/local`, which is resolved by
// the Next.js webpack/turbopack pipeline at build time but is NOT a
// loadable ESM module under jsdom. Stub the exports with shapes that match
// what real GeistSans/GeistMono provide (variable, className).
vi.mock('geist/font/sans', () => ({
  GeistSans: {
    variable: '__variable_mock_geist_sans',
    className: '__className_mock_geist_sans',
    style: { fontFamily: 'mock-geist-sans' },
  },
}));

vi.mock('geist/font/mono', () => ({
  GeistMono: {
    variable: '__variable_mock_geist_mono',
    className: '__className_mock_geist_mono',
    style: { fontFamily: 'mock-geist-mono' },
  },
}));

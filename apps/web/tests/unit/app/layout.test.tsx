/**
 * Phase 1 TDD gate.
 *
 * Asserts that RootLayout renders <html> with lang="en" + the GeistSans +
 * GeistMono font variable classes, and that children render inside <body>.
 *
 * Rendering note: RootLayout returns <html><body>...</body></html>. RTL's
 * default container (a <div> appended to document.body) would nest these
 * inside a <div>, which React 19 flags as invalid and warns about in the
 * console. We instead pass `container: document.documentElement` to RTL so
 * React 19's html-hoisting merges RootLayout's html attributes onto the
 * existing <html> element — the same behavior Next.js relies on at render
 * time. No hydration warning, and the assertions remain against the real
 * document root.
 *
 * Phase 2a will add metadata coverage (title, description, canonical) and
 * Phase 5 will add nonce propagation coverage for CSP.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLayout from '@/app/layout';

describe('RootLayout', () => {
  beforeEach(() => {
    // Reset the documentElement attributes between tests so assertions
    // don't see stale attributes from prior renders.
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('class');
  });

  it('sets lang="en" and Geist font variable classes on the root <html>', () => {
    render(<RootLayout>{null}</RootLayout>, {
      container: document.documentElement,
    });

    const html = document.documentElement;
    expect(html.getAttribute('lang')).toBe('en');
    // Geist exposes GeistSans.variable + GeistMono.variable as CSS-var
    // class names. Real values are package-managed (e.g. `__variable_xxx`);
    // the vitest setup mocks geist with `__variable_mock_geist_*` so the
    // class content is deterministic in tests.
    expect(html.className).toContain('mock_geist_sans');
    expect(html.className).toContain('mock_geist_mono');
  });

  it('renders children passed in', () => {
    render(
      <RootLayout>
        <div data-testid="child">hello</div>
      </RootLayout>,
      { container: document.documentElement },
    );
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });
});

/**
 * Phase 1 TDD gate.
 *
 * Asserts that RootLayout renders <html> with the GeistSans + GeistMono
 * font variable classes applied. This is the minimum production contract:
 * the design tokens system in Phase 2a depends on the Geist font variables
 * being on the root <html>, and Lighthouse SEO checks expect a `lang`
 * attribute.
 *
 * This test is intentionally minimal — Phase 2a will add metadata
 * coverage (title, description, canonical) and Phase 5 will add nonce
 * propagation coverage.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLayout from '@/app/layout';

describe('RootLayout', () => {
  it('sets lang="en" and Geist font variable classes on document.documentElement', () => {
    // React 19 hoists `<html>` attribute rendering onto the existing
    // `document.documentElement` rather than creating a nested html node
    // inside RTL's container. So we assert against the document root.
    render(<RootLayout>{null}</RootLayout>);
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
    );
    // `screen` queries the entire `document`, which is correct here because
    // React 19 hoists html/body content into the document during render. The
    // child div lands in the document tree even though the html/body tags
    // wrapping it are nested inside RTL's container.
    expect(screen.getByTestId('child').textContent).toBe('hello');
  });
});

/**
 * Phase 1 TDD gate.
 *
 * Asserts that RootLayout renders <html> with lang="en" + the GeistSans +
 * GeistMono font variable classes, and that children render inside <body>.
 *
 * Rendering strategy: `renderToStaticMarkup` from react-dom/server produces
 * the exact HTML string that Next.js would emit for this layout in
 * production (it's a Server Component, returns JSX, gets rendered to HTML
 * server-side). Running it through SSR avoids the React 19 jsdom warnings
 * that DOM-mounting <html><body>...</body></html> produces (whether nested
 * inside a <div> or merged into document.documentElement). Assertions read
 * the static HTML directly — same contract, zero hydration noise.
 *
 * Phase 2a will add metadata coverage (title, description, canonical) and
 * Phase 5 will add nonce propagation coverage for CSP.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout from '@/app/layout';

function render(children: React.ReactNode = null) {
  return renderToStaticMarkup(<RootLayout>{children}</RootLayout>);
}

describe('RootLayout', () => {
  it('emits <html lang="en"> with the Geist font variable classes', () => {
    const html = render();
    // lang attribute on <html>
    expect(html).toMatch(/<html\b[^>]*\blang="en"/);
    // Geist exposes GeistSans.variable + GeistMono.variable as CSS-var
    // class names. Real values are package-managed (e.g. `__variable_xxx`);
    // the vitest setup mocks geist with `__variable_mock_geist_*` so the
    // class content is deterministic in tests.
    expect(html).toContain('mock_geist_sans');
    expect(html).toContain('mock_geist_mono');
  });

  it('renders <body> with antialiased class', () => {
    const html = render();
    expect(html).toMatch(/<body\b[^>]*\bclass="[^"]*antialiased/);
  });

  it('renders children passed in inside the body', () => {
    const html = render(<div data-testid="child">hello</div>);
    // Child appears inside the body. We assert via a forgiving regex
    // that allows any attributes between `<body` and the child marker.
    expect(html).toMatch(/<body[^>]*>[\s\S]*data-testid="child"[\s\S]*<\/body>/);
    expect(html).toContain('hello');
  });

  it('renders the skip-to-content link as the first focusable element (WCAG 2.4.1)', () => {
    // The skip link MUST appear before any other interactive content in
    // the body so that the very first Tab keypress lands on it. The
    // route-group layouts wire `id="main-content"` onto their <main>
    // anchors so this href targets a real element.
    const html = render(<div data-testid="child">hello</div>);
    // Anchor exists with the right href + visible text
    expect(html).toMatch(/<a\b[^>]*href="#main-content"[^>]*>[\s\S]*?Skip to main content[\s\S]*?<\/a>/);
    // And it sits before the children — first focusable in body order
    const skipIdx = html.indexOf('Skip to main content');
    const childIdx = html.indexOf('data-testid="child"');
    expect(skipIdx).toBeGreaterThan(-1);
    expect(childIdx).toBeGreaterThan(-1);
    expect(skipIdx).toBeLessThan(childIdx);
  });
});

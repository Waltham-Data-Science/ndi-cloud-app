/**
 * For Labs (`/products/private-cloud`) Coming Soon banner — visual-
 * sweep hotfix 2026-04-28.
 *
 * The page is correctly hidden from header/footer nav (the product is
 * pre-release) and the homepage's BridgeRow #02 already advertises it
 * as COMING SOON. But direct hits on `/products/private-cloud` (search
 * results, shared links, the canonical URL in the page metadata) were
 * landing on a feature-rich pitch with NO indication that the product
 * isn't shipped yet. This test pins the in-page banner so a future
 * refactor that drops it would fail loudly in CI.
 *
 * The banner itself is a small standalone component; this test renders
 * it directly rather than the whole page, both to keep the test fast
 * and to avoid pulling the entire marketing image pipeline / Next.js
 * font modules through jsdom.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ComingSoonBanner } from '@/app/(marketing)/products/private-cloud/page';

describe('For Labs — ComingSoonBanner', () => {
  it('renders the pre-release notice copy', () => {
    render(<ComingSoonBanner />);
    // The user-visible copy. Pinning the exact "Coming soon —"
    // prefix and the "in development" / "Nansen" landmarks. If a
    // future copy edit drops any of these, the user will end up
    // staring at an unchanged hero with no signal — same bug class
    // that prompted this hotfix in the first place.
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
    expect(screen.getByText(/in development/i)).toBeInTheDocument();
    expect(screen.getByText(/Nansen/i)).toBeInTheDocument();
  });

  it('exposes the banner with role="note" and an aria-label', () => {
    render(<ComingSoonBanner />);
    // role="note" + an aria-label (rather than role="alert" /
    // aria-live="assertive") because the banner is informational, not
    // an interrupting alert. Screen readers announce it on focus /
    // navigation, not as a popup.
    expect(
      screen.getByRole('note', { name: /Pre-release notice/i }),
    ).toBeInTheDocument();
  });

  it('renders a link to Nansen for the published flow', () => {
    render(<ComingSoonBanner />);
    const link = screen.getByRole('link', { name: /Nansen/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href');
    // Cross-domain link — open in a new tab with the safe-rel pair so
    // the destination can't reach back to window.opener.
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link.getAttribute('rel')).toMatch(/noreferrer/);
  });
});

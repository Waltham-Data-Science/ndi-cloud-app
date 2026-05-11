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
  it('renders the pre-release "Coming soon" landmark', () => {
    // Relaxed in the 2026-04-29 test-suite audit. Pre-fix this
    // asserted three exact-copy substrings ("Coming soon", "in
    // development", "Nansen"). Each is the kind of marketing copy
    // that gets revised every review round; the load-bearing
    // contract is "the banner exists and signals pre-release
    // state." The `role="note"` + aria-label test below pins the
    // component-identity gate that prevents the original audit-#15
    // bug (a banner disappearing without a copy revision).
    render(<ComingSoonBanner />);
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
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

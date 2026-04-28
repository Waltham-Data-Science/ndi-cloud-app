/**
 * Dataset detail loading.tsx — smoke test for audit #1 fix.
 *
 * 2026-04-28 — body-only contract. Pre-fix this loading.tsx rendered
 * its own hero + tab bar + section wrapper, which on tab-switches
 * DUPLICATED the layout's already-mounted chrome (visible in user-
 * reported screenshot: real hero + tabs at top, then a nested
 * skeleton hero + tabs below). The duplicate-render bug came from
 * the test pinning the loading state to "show real tab labels" — a
 * sensible-looking contract that papered over the architectural
 * duplication. With the chrome rendered exclusively by the layout's
 * `<DatasetDetailChromeGate>` and loading.tsx scoped to body content
 * only, the per-leaf loading.tsx files (tables/documents/overview)
 * also get to render shape-matching skeletons without colliding
 * with the parent. This test now asserts the body-only contract.
 *
 * Asserted invariants:
 *   1. `aria-busy="true"` on the body region so SR users hear "loading"
 *   2. Skeleton atoms render so the body slot isn't blank during the
 *      Suspense window
 *   3. NO hero / tab / section wrapper — those come from the layout
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import DatasetDetailLoading from '@/app/(app)/datasets/[id]/loading';

describe('app/(app)/datasets/[id]/loading.tsx', () => {
  it('marks the body region as aria-busy so SR users get the loading hint', () => {
    render(<DatasetDetailLoading />);
    // Query by aria-label rather than role=region — `<section>` only
    // maps to the `region` role conditionally on having an accessible
    // name, and jsdom's role mapping for sectioning content is
    // historically flaky. The label query is just as semantic and
    // doesn't depend on the role-mapping shim.
    const body = screen.getByLabelText(/loading dataset overview/i);
    expect(body).toHaveAttribute('aria-busy', 'true');
  });

  it('renders body skeletons so the body region is not blank', () => {
    const { container } = render(<DatasetDetailLoading />);
    // `.skeleton` is the shimmer class from globals.css; we don't
    // care about exact count, just that several are present so the
    // body region has visible loading affordance.
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it('does NOT render its own hero / tab bar / section chrome', () => {
    // The duplicate-chrome regression. The layout's
    // `<DatasetDetailChromeGate>` already renders the dataset hero +
    // `<DatasetTabs>` + the constrained `<section>` wrapper around
    // children — loading.tsx must stay scoped to the body slot.
    // Tab labels would be the loudest visual telltale of duplication
    // (the user-reported screenshot showed a nested skeleton tab nav
    // saying "Documents" while the real nav said "Document explorer").
    render(<DatasetDetailLoading />);
    expect(screen.queryByText(/Overview/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Summary tables/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Document explorer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Documents$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Back to Data Commons/i)).not.toBeInTheDocument();
  });
});

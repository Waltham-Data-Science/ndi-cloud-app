/**
 * Dataset detail loading.tsx — smoke test for audit #1 fix.
 *
 * Asserts the contract that lets the loading state replace the 5-s
 * "frozen click" with a paint-within-one-frame placeholder:
 *
 *   1. Renders an `aria-busy="true"` hero region so screen readers
 *      announce the route is loading (not just visually shimmering).
 *   2. Surfaces the real tab labels (Overview / Summary tables /
 *      Documents) — these are URL-routed and data-independent, so
 *      showing them up-front tells the user "the page is here, the
 *      content is loading" rather than "everything is loading."
 *   3. Renders skeleton primitives for the body so the eye has
 *      something concrete to hold while the layout's prefetch
 *      resolves.
 *
 * This is the smoke contract — visual fidelity (gradient, padding,
 * max-width matching the real chrome) is verified by Playwright at
 * the route level, not here.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import DatasetDetailLoading from '@/app/(app)/datasets/[id]/loading';

describe('app/(app)/datasets/[id]/loading.tsx', () => {
  it('marks the hero region as aria-busy so SR users get the loading hint', () => {
    render(<DatasetDetailLoading />);
    // Query by aria-label rather than role=region — `<section>` only
    // maps to the `region` role conditionally on having an accessible
    // name, and jsdom's role mapping for sectioning content is
    // historically flaky. The label query is just as semantic and
    // doesn't depend on the role-mapping shim.
    const hero = screen.getByLabelText(/loading dataset/i);
    expect(hero).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the three real tab labels so the page is recognizable mid-load', () => {
    render(<DatasetDetailLoading />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Summary tables')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('renders body skeletons so the region below the tab bar is not blank', () => {
    const { container } = render(<DatasetDetailLoading />);
    // `.skeleton` is the shimmer class from globals.css; we don't
    // care about exact count, just that several are present so the
    // body region has visible loading affordance.
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });
});

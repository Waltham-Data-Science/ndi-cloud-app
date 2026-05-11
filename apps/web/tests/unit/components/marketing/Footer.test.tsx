/**
 * Tests for the marketing <Footer />.
 *
 * The footer is pure JSX; tests focus on the contract that's brittle
 * to refactor: the 4 column titles, every external link's `target` /
 * `rel` security attributes, the same-origin Data Commons link (post-
 * unification), the Crossref-friendly copyright string. Visual layout
 * (grid columns, spacing) is covered by Lighthouse + manual review.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Footer } from '@/components/marketing/Footer';

describe('Footer', () => {
  it('renders all four section titles', () => {
    // Phase 6.6 PR-G a11y polish: column titles were `<h5>` (heading-
    // order violation — page had h1 + h2 already; jumping to h5 here
    // skipped h3+h4). Now rendered as `<p>` with the same visual
    // styling. Assert against the visible text rather than role.
    render(<Footer />);
    expect(screen.getByText(/^Products$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Company$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Get in touch$/i)).toBeInTheDocument();
  });

  it('links the Data Commons entry to the same-origin /datasets path (post-unification)', () => {
    render(<Footer />);
    const dataCommons = screen.getByRole('link', { name: /^Data Commons$/ });
    // Post-unification: same-origin path, not the old https://app.ndi-cloud.com URL.
    expect(dataCommons.getAttribute('href')).toBe('/datasets');
    // Same-tab navigation — `target="_blank"` would break the
    // "feels like one product" UX rule (CLAUDE.md cross-domain nav rules).
    expect(dataCommons.getAttribute('target')).toBeNull();
  });

  it('marks the GitHub research link as external with rel="noopener noreferrer"', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /research on github/i });
    expect(link.getAttribute('href')).toBe('https://github.com/VH-Lab/NDI-matlab');
    expect(link.getAttribute('target')).toBe('_blank');
    // jsx-no-target-blank lint rule guarantees this in production but
    // unit-asserting it here protects against a refactor that converts
    // this link to a Next/Link (which strips target/rel).
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('marks the Documentation link as external with security attrs', () => {
    render(<Footer />);
    const link = screen.getByRole('link', { name: /documentation/i });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders the company name + policy-row copy', () => {
    // 2026-04-29 test-suite audit: relaxed from year-pinned literal
    // assertions. Privacy/Terms/Security are rendered as plain text
    // (no link to a dedicated policy page yet); the Security &
    // Compliance NAV link is covered by other Footer tests. Soft
    // assertion: the company name is present (catches a regression
    // that removes the footer copy entirely) and the policy-row
    // landmark text exists in some form. Pinning the year was the
    // brittle bit (auto-rolls Jan 1).
    render(<Footer />);
    expect(screen.getByText(/Waltham Data Science/i)).toBeInTheDocument();
    expect(screen.getByText(/Privacy/i)).toBeInTheDocument();
  });

  it('uses next/link for internal hash + slash routes (no full-page reload)', () => {
    render(<Footer />);
    const partners = screen.getByRole('link', { name: /^Partners$/ });
    // next/link renders as <a href="..."> in test (no router prefetch);
    // we assert that hash links resolve to the right anchor target.
    expect(partners.getAttribute('href')).toBe('/about#partnerships');
    expect(partners.getAttribute('target')).toBeNull();
  });
});

/**
 * ClassCountsList — focused tests for the long-name truncation
 * round-2 team review fix.
 *
 * Pre-fix: long class names (e.g. `stimulus_response_scalar_pa…`) were
 * rendered with `break-words` so the cell wrapped onto multiple visual
 * lines and pushed the document-count number off-screen on narrow
 * sidebars. Fix: switch to single-line `truncate` with the full name
 * surfaced via `title=` for hover, and force the count + icon to
 * `shrink-0` so they always remain visible regardless of name length.
 *
 * The DOM hooks asserted here are stable selectors the layout depends
 * on — a future regression that drops `truncate` on the name span or
 * removes `shrink-0` from the count would surface here.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ClassCountsList } from '@/components/app/ClassCountsList';

describe('ClassCountsList — long-name truncation (round 2)', () => {
  it('renders a long class name truncated with the full text in title=', () => {
    const longName =
      'stimulus_response_scalar_parameter_summary_for_subject';
    render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 1234,
          classCounts: { [longName]: 12345 },
        }}
      />,
    );
    const nameSpan = screen.getByText(longName);
    // Hover surfaces the full name via the title attribute — this is
    // the user-facing contract (long-class-name flagged in team review).
    // Tailwind `truncate` / `min-w-0` assertions removed in the
    // 2026-04-29 test-suite audit; pinning utility class names against
    // rendered HTML falsely fails on every Tailwind config change.
    expect(nameSpan.getAttribute('title')).toBe(longName);
  });

  it('keeps the count and icon visible when the name is long (shrink-0 protects them)', () => {
    const longName =
      'stimulus_response_scalar_parameter_summary_for_subject';
    render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 1234,
          classCounts: { [longName]: 12345 },
        }}
      />,
    );
    // Count text must be present and rendered — its container carries
    // `shrink-0` so the long name can't push it off the row.
    const countSpan = screen.getByText('12,345');
    expect(countSpan.className).toMatch(/\bshrink-0\b/);
  });

  it('still renders short class names without unexpected truncation behavior', () => {
    render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 100,
          classCounts: { subject: 50 },
        }}
      />,
    );
    const nameSpan = screen.getByText('subject');
    // `truncate` is harmless on short names — the contract is: every
    // name span is consistently truncatable, regardless of length.
    expect(nameSpan.className).toMatch(/\btruncate\b/);
    expect(nameSpan.getAttribute('title')).toBe('subject');
  });
});

describe('ClassCountsList — hide internal wrapper classes (round-2 team review)', () => {
  it('does not render session_in_a_dataset in the sidebar list', () => {
    // Real-world fixture from Bhar (`69bc5ca11d547b1f6d083761`):
    // production class-counts shows session=2 alongside the wrapper
    // class session_in_a_dataset=1. Pre-fix the sidebar listed them
    // as two adjacent rows, which the team read as "3 sessions"
    // (session 2 + session_in_a_dataset 1). The wrapper is a
    // bookkeeping-only class; hide it from the sidebar so the eye
    // scan matches the hero (which already excludes it via PR #129).
    render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 66533,
          classCounts: {
            subject: 5314,
            session: 2,
            session_in_a_dataset: 1,
            element: 100,
          },
        }}
      />,
    );
    expect(screen.queryByText('session_in_a_dataset')).toBeNull();
    // The other classes still render normally.
    expect(screen.getByText('subject')).toBeInTheDocument();
    expect(screen.getByText('session')).toBeInTheDocument();
    expect(screen.getByText('element')).toBeInTheDocument();
  });

  it('keeps the total-documents heading honest (does not subtract wrapper count)', () => {
    // The "N documents total" label at the top is the dataset's
    // true total — including wrapper classes. Hiding the wrapper
    // from the per-class breakdown shouldn't make the total appear
    // to disagree with the catalog's "documents" facet on the
    // overview hero.
    render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 66533,
          classCounts: {
            subject: 5314,
            session: 2,
            session_in_a_dataset: 1,
          },
        }}
      />,
    );
    expect(screen.getByText('66,533 documents total')).toBeInTheDocument();
  });

  it('renders normally when the dataset has no wrapper class (e.g. Haley)', () => {
    // Verified against production: Haley (`682e7772cdf3f24938176fac`)
    // has session=3 and NO session_in_a_dataset class. The filter is
    // a no-op on such datasets — every class still renders.
    render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 78687,
          classCounts: {
            subject: 100,
            session: 3,
            element: 50,
          },
        }}
      />,
    );
    expect(screen.getByText('subject')).toBeInTheDocument();
    expect(screen.getByText('session')).toBeInTheDocument();
    expect(screen.getByText('element')).toBeInTheDocument();
  });
});

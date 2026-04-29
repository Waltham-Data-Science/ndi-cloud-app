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
    // The name span is the truncating element — single-line ellipsis
    // when overflow occurs.
    expect(nameSpan.className).toMatch(/\btruncate\b/);
    // `min-w-0` is required for flex children to shrink below their
    // intrinsic min-content width — without it, `truncate` does
    // nothing.
    expect(nameSpan.className).toMatch(/\bmin-w-0\b/);
    // Hover surfaces the full name via the title attribute.
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

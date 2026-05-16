/**
 * StatTile — primitive used by the Overview tab's stat-tiles row.
 *
 * Light coverage of the three render variants: plain (non-clickable),
 * clickable (renders as a `<Link>`), and loading (renders the chrome
 * with a placeholder value to prevent layout shift on resolve). The
 * sub-label + icon are optional and tested when present.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Users2 } from 'lucide-react';

import { StatTile } from '@/components/workspace/StatTile';

describe('StatTile', () => {
  it('renders label and formatted value', () => {
    render(<StatTile label="Subjects" value="5,314" />);
    expect(screen.getByText('Subjects')).toBeInTheDocument();
    expect(screen.getByText('5,314')).toBeInTheDocument();
  });

  it('renders as a Link when href is provided', () => {
    render(
      <StatTile
        label="Subjects"
        value="5,314"
        href="/my/workspace/abc/subjects"
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/my/workspace/abc/subjects');
    expect(link.textContent).toContain('Subjects');
    expect(link.textContent).toContain('5,314');
  });

  it('renders as a plain div when href is omitted (no hover affordance)', () => {
    render(<StatTile label="Species" value="1" />);
    // No link should be rendered — the tile is not interactive.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders the optional sub-label when provided', () => {
    render(
      <StatTile
        label="Subjects"
        value="5,314"
        subLabel="C. elegans (N2)"
      />,
    );
    expect(screen.getByText('C. elegans (N2)')).toBeInTheDocument();
  });

  it('renders an icon when provided', () => {
    const { container } = render(
      <StatTile label="Subjects" value="5,314" icon={Users2} />,
    );
    // Lucide icons render as SVG; just verify one exists in the tile.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('hides the value visually when isLoading is true (layout preserved)', () => {
    const { container } = render(
      <StatTile label="Subjects" value="5,314" isLoading />,
    );
    const valueEl = container.querySelector('[class*="opacity-0"]');
    expect(valueEl).not.toBeNull();
  });
});

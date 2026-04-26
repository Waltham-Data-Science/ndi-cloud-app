/**
 * FacetSidebar — Phase 6.6 REBUILD-5.
 *
 * Pure rendering + interaction tests for the catalog filter sidebar.
 * URL-state integration is exercised in `(app)/catalog-filters.test.tsx`.
 *
 * Source: `ndi-data-browser-v2/frontend/src/pages/DatasetsPage.tsx:446-589`
 * (the inline `FacetSidebar` + `FacetGroup` closures).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FacetSidebar } from '@/components/datasets/FacetSidebar';

const baseProps = {
  species: ['Mus musculus', 'Rattus norvegicus'],
  regions: ['hippocampus', 'visual cortex'],
  licenses: ['CC-BY-4.0', 'CC0-1.0'],
  activeSpecies: [] as string[],
  activeRegions: [] as string[],
  activeLicenses: [] as string[],
  onToggleSpecies: vi.fn(),
  onToggleRegion: vi.fn(),
  onToggleLicense: vi.fn(),
  loading: false,
};

beforeEach(() => {
  baseProps.onToggleSpecies.mockReset();
  baseProps.onToggleRegion.mockReset();
  baseProps.onToggleLicense.mockReset();
});

describe('FacetSidebar — Phase 6.6 REBUILD-5', () => {
  it('renders three facet groups with their options', () => {
    render(<FacetSidebar {...baseProps} />);
    expect(screen.getByText(/Species/i)).toBeInTheDocument();
    expect(screen.getByText('Mus musculus')).toBeInTheDocument();
    expect(screen.getByText(/Brain region/i)).toBeInTheDocument();
    expect(screen.getByText('hippocampus')).toBeInTheDocument();
    expect(screen.getByText(/License/i)).toBeInTheDocument();
    expect(screen.getByText('CC-BY-4.0')).toBeInTheDocument();
  });

  it('clicking a species checkbox calls onToggleSpecies with the value', () => {
    render(<FacetSidebar {...baseProps} />);
    const cb = screen.getByLabelText('Mus musculus');
    fireEvent.click(cb);
    expect(baseProps.onToggleSpecies).toHaveBeenCalledWith('Mus musculus');
  });

  it('marks active species as checked', () => {
    render(
      <FacetSidebar
        {...baseProps}
        activeSpecies={['Mus musculus']}
      />,
    );
    const cb = screen.getByLabelText('Mus musculus') as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it('renders a loading skeleton when loading=true (species only — license group never loads)', () => {
    const { container } = render(
      <FacetSidebar
        {...baseProps}
        species={[]}
        regions={[]}
        loading
      />,
    );
    // The animate-pulse rows are the visible loading proxy.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(
      0,
    );
  });

  it('shows an empty hint when not loading and no options', () => {
    render(
      <FacetSidebar
        {...baseProps}
        species={[]}
        regions={[]}
        licenses={[]}
        loading={false}
      />,
    );
    expect(
      screen.getByText(/Facets will appear here once the first datasets index/i),
    ).toBeInTheDocument();
  });

  it('truncates a 30-option list to 24 visible rows + a "+ N more" footer', () => {
    const big = Array.from({ length: 30 }, (_, i) => `species-${i}`);
    render(<FacetSidebar {...baseProps} species={big} />);
    // Source caps display at 24 — see DatasetsPage.tsx:557-583.
    expect(screen.getByLabelText('species-0')).toBeInTheDocument();
    expect(screen.getByLabelText('species-23')).toBeInTheDocument();
    expect(screen.queryByLabelText('species-24')).toBeNull();
    expect(screen.getByText(/\+ 6 more/i)).toBeInTheDocument();
  });

  it('mobile toggle button shows/hides the aside', () => {
    render(<FacetSidebar {...baseProps} />);
    const toggle = screen.getByRole('button', { name: /Show filters/i });
    expect(toggle).toBeInTheDocument();
    // Aside is rendered with `md:block` + conditional `block`/`hidden`;
    // `md` is desktop. We just assert the button label flips.
    fireEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: /Hide filters/i }),
    ).toBeInTheDocument();
  });
});

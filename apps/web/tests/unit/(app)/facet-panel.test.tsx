/**
 * FacetPanel — Phase 6.5d port.
 *
 * The data-browser source had no test file; this suite locks in the
 * rendering contract:
 *
 *   - Loading state renders the "Loading facets…" message
 *   - Error state surfaces a banner (warns of stale counts when cached
 *     data is still visible)
 *   - Each facet kind renders a section with one chip per term
 *   - Empty kinds collapse (no empty `<h3>`)
 *   - Chip click invokes the right callback with the right argument
 *     shape — kind + term for ontology kinds, raw string for probe
 *     types
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api/client';
import { FacetPanel } from '@/components/app/FacetPanel';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FacetPanel — loading / error states', () => {
  it('shows "Loading facets…" while the request is in flight', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <FacetPanel onSelectOntologyFacet={vi.fn()} onSelectProbeType={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/Loading facets/i)).toBeInTheDocument();
  });

  it('renders the could-not-load banner when no data is available and an error occurs', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <FacetPanel onSelectOntologyFacet={vi.fn()} onSelectProbeType={vi.fn()} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn.t load research facets/i),
      ).toBeInTheDocument();
    });
  });
});

describe('FacetPanel — chip rendering and callbacks', () => {
  const facetsResponse = {
    species: [
      { ontologyId: 'NCBITaxon:6239', label: 'Caenorhabditis elegans' },
      { ontologyId: 'NCBITaxon:10090', label: 'Mus musculus' },
    ],
    brainRegions: [{ ontologyId: 'UBERON:0001880', label: 'BNST' }],
    strains: [],
    sexes: [{ ontologyId: 'PATO:0000384', label: 'male' }],
    probeTypes: ['patch-Vm', 'silicon-electrode'],
    datasetCount: 17,
    computedAt: new Date().toISOString(),
    schemaVersion: 'facets:v1' as const,
  };

  it('renders the dataset count next to the section title', async () => {
    mockedApiFetch.mockResolvedValueOnce(facetsResponse);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <FacetPanel onSelectOntologyFacet={vi.fn()} onSelectProbeType={vi.fn()} />
      </Wrapper>,
    );
    await waitFor(() => {
      // "(17 datasets)" appended to the section title.
      expect(screen.getByText(/\(17 datasets\)/)).toBeInTheDocument();
    });
  });

  it('renders one button per term across each facet kind', async () => {
    mockedApiFetch.mockResolvedValueOnce(facetsResponse);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <FacetPanel onSelectOntologyFacet={vi.fn()} onSelectProbeType={vi.fn()} />
      </Wrapper>,
    );
    await waitFor(() => {
      // Species (2) + BrainRegions (1) + Sex (1) + ProbeTypes (2) = 6 chips.
      // Strains is empty → collapsed (no chips, no header).
      const chips = screen.getAllByRole('button');
      expect(chips.length).toBe(6);
    });
  });

  it('hides facet sections that have zero terms', async () => {
    mockedApiFetch.mockResolvedValueOnce(facetsResponse);
    const Wrapper = withClient();
    render(
      <Wrapper>
        <FacetPanel onSelectOntologyFacet={vi.fn()} onSelectProbeType={vi.fn()} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Species')).toBeInTheDocument();
    });
    // Strains list is empty in the fixture — header should not render.
    expect(screen.queryByText('Strains')).toBeNull();
  });

  it('invokes onSelectOntologyFacet with the kind + term shape on chip click', async () => {
    mockedApiFetch.mockResolvedValueOnce(facetsResponse);
    const onSelectOntology = vi.fn();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <FacetPanel
          onSelectOntologyFacet={onSelectOntology}
          onSelectProbeType={vi.fn()}
        />
      </Wrapper>,
    );
    let speciesChip: HTMLElement | null = null;
    await waitFor(() => {
      speciesChip = screen.getByRole('button', {
        name: /Filter by species: Caenorhabditis elegans/i,
      });
    });
    speciesChip!.click();
    expect(onSelectOntology).toHaveBeenCalledTimes(1);
    expect(onSelectOntology).toHaveBeenCalledWith('species', {
      ontologyId: 'NCBITaxon:6239',
      label: 'Caenorhabditis elegans',
    });
  });

  it('invokes onSelectProbeType with the bare string on chip click', async () => {
    mockedApiFetch.mockResolvedValueOnce(facetsResponse);
    const onSelectProbe = vi.fn();
    const Wrapper = withClient();
    render(
      <Wrapper>
        <FacetPanel
          onSelectOntologyFacet={vi.fn()}
          onSelectProbeType={onSelectProbe}
        />
      </Wrapper>,
    );
    let probeChip: HTMLElement | null = null;
    await waitFor(() => {
      probeChip = screen.getByRole('button', {
        name: /Filter by probe type: patch-Vm/i,
      });
    });
    probeChip!.click();
    expect(onSelectProbe).toHaveBeenCalledTimes(1);
    expect(onSelectProbe).toHaveBeenCalledWith('patch-Vm');
  });

  it('renders chips inside the right facet section (within accessor confirms grouping)', async () => {
    mockedApiFetch.mockResolvedValueOnce(facetsResponse);
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <FacetPanel onSelectOntologyFacet={vi.fn()} onSelectProbeType={vi.fn()} />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Species')).toBeInTheDocument();
    });
    // Walk DOM siblings of the "Species" h3 to confirm BNST is NOT in
    // the species block (would indicate cross-section bleed).
    const speciesH3 = within(container).getByText('Species');
    const speciesBlock = speciesH3.parentElement!;
    expect(within(speciesBlock).queryByText('BNST')).toBeNull();
  });
});

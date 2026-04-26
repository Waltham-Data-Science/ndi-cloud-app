/**
 * Catalog filter integration — Phase 6.6 REBUILD-5.
 *
 * Pins the URL-state contract for `/datasets`:
 *   - `?q=` text search
 *   - `?species=` / `?regions=` / `?license=` comma-separated multi-select
 *   - `?sort=` sort mode
 *   - `?page=` pagination
 *
 * The catalog client island reads these params, filters the prefetched
 * `usePublishedDatasets(1, 20)` result via `matchesFilters` + `compareBy`,
 * and pushes URL updates on facet toggle / chip remove / sort change /
 * pagination.
 *
 * Phase 6.5d shipped the wrong sidebar (research-vocabulary chip cloud)
 * on `/datasets`; the source design has the checkbox FacetSidebar there.
 * This test pins the corrected behavior so a regression to the chip
 * cloud is caught by CI.
 */
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

const routerPushMock = vi.fn();
let CURRENT_URL = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(CURRENT_URL),
  usePathname: () => '/datasets',
}));

import { DatasetsListClient } from '@/app/(app)/datasets/datasets-client';
import type {
  DatasetListResponse,
  DatasetRecord,
} from '@/lib/api/datasets';
import type { FacetsResponse } from '@/lib/types/facets';

function makeRecord(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'd1',
    name: 'Default name',
    license: 'CC-BY-4.0',
    species: 'Mus musculus',
    brainRegions: 'visual cortex',
    ...overrides,
  };
}

function withCache(
  datasets: DatasetRecord[],
  facets: Partial<FacetsResponse> = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  qc.setQueryData<DatasetListResponse>(
    ['datasets', 'published', 1, 20],
    {
      datasets,
      totalNumber: datasets.length,
    } as DatasetListResponse,
  );
  qc.setQueryData<FacetsResponse>(['facets'], {
    species: [
      { label: 'Mus musculus', ontologyId: 'NCBITaxon:10090' },
      { label: 'Rattus norvegicus', ontologyId: 'NCBITaxon:10116' },
    ],
    brainRegions: [
      { label: 'visual cortex', ontologyId: 'UBERON:0002436' },
    ],
    strains: [],
    sexes: [],
    probeTypes: [],
    datasetCount: datasets.length,
    computedAt: '2025-01-01T00:00:00Z',
    schemaVersion: 'facets:v1',
    ...facets,
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

beforeEach(() => {
  routerPushMock.mockReset();
  CURRENT_URL = '';
});

describe('Catalog filter integration — Phase 6.6 REBUILD-5', () => {
  it('renders the FacetSidebar (not the chip-cloud FacetPanel)', () => {
    const Wrapper = withCache([makeRecord()]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    // Source sidebar headers — Species / Brain region / License — are
    // distinctive vs. the chip cloud's "Research vocabulary" header.
    expect(
      screen.getByRole('complementary', { name: /Dataset filters/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Research vocabulary/i),
    ).not.toBeInTheDocument();
  });

  it('toggling a species checkbox pushes ?species= to the URL', () => {
    const Wrapper = withCache([makeRecord()]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Mus musculus'));
    expect(routerPushMock).toHaveBeenCalledWith(
      '/datasets?species=Mus+musculus',
    );
  });

  it('filters visible datasets when ?species= is present', () => {
    CURRENT_URL = 'species=Mus+musculus';
    const Wrapper = withCache([
      makeRecord({ id: 'a', name: 'Mouse dataset', species: 'Mus musculus' }),
      makeRecord({ id: 'b', name: 'Rat dataset', species: 'Rattus norvegicus' }),
    ]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    expect(screen.getByText('Mouse dataset')).toBeInTheDocument();
    expect(screen.queryByText('Rat dataset')).not.toBeInTheDocument();
  });

  it('renders applied-filter chips for active filters', () => {
    CURRENT_URL = 'species=Mus+musculus&q=tuning';
    const Wrapper = withCache([makeRecord()]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    expect(
      screen.getByRole('button', { name: /Remove filter Mus musculus/i }),
    ).toBeInTheDocument();
    // q chip is decorated with curly quotes: "tuning"
    expect(
      screen.getByRole('button', { name: /Remove filter .*tuning/i }),
    ).toBeInTheDocument();
  });

  it('clicking a chip X removes that filter from URL', () => {
    CURRENT_URL = 'species=Mus+musculus,Rattus+norvegicus';
    const Wrapper = withCache([makeRecord()]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Remove filter Mus musculus/i }),
    );
    expect(routerPushMock).toHaveBeenCalledWith(
      '/datasets?species=Rattus+norvegicus',
    );
  });

  it('"Clear all" wipes every filter param', () => {
    CURRENT_URL =
      'q=tuning&species=Mus+musculus&regions=visual+cortex&license=CC-BY-4.0&sort=newest';
    const Wrapper = withCache([makeRecord()]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear all/i }));
    // Sort param survives — it's not a "filter," it's a presentation
    // toggle. Source preserves it (`['species', 'regions', 'license', 'q']`
    // are the only four cleared).
    expect(routerPushMock).toHaveBeenCalledWith('/datasets?sort=newest');
  });

  it('changing the sort dropdown pushes ?sort=', () => {
    const Wrapper = withCache([makeRecord()]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    const select = screen.getByRole('combobox', { name: /Sort/i });
    fireEvent.change(select, { target: { value: 'newest' } });
    expect(routerPushMock).toHaveBeenCalledWith('/datasets?sort=newest');
  });

  it('shows "no datasets match" empty state when filters are over-restrictive', () => {
    CURRENT_URL = 'species=Drosophila';
    const Wrapper = withCache([
      makeRecord({ species: 'Mus musculus' }),
    ]);
    render(
      <Wrapper>
        <DatasetsListClient page={1} pageSize={20} />
      </Wrapper>,
    );
    expect(
      screen.getByText(/No datasets match the current filters/i),
    ).toBeInTheDocument();
  });
});

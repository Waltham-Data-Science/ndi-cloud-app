/**
 * DatasetStructurePanel — auto-loading orientation panel.
 *
 * Pinned behaviors:
 *   - Loading: renders a skeleton (no data needed to render the form)
 *   - Error: renders a friendly inline error block
 *   - Success: renders dataset name, count chips with deeplinks, and
 *     species/brainRegions/strains pills
 *   - The footer's Show-Code button is wired with toolName
 *     `get_dataset_summary` + the dataset id as args
 *
 * No charts → no rendering deps to mock. We DO mock the data hooks so
 * the test is hermetic against the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useDatasetMock = vi.fn();
const useDatasetSummaryMock = vi.fn();
const useClassCountsMock = vi.fn();

vi.mock('@/lib/api/datasets', () => ({
  useDataset: () => useDatasetMock(),
  useDatasetSummary: () => useDatasetSummaryMock(),
  useClassCounts: () => useClassCountsMock(),
}));

// Mock the inner CodeExportButton — DatasetStructurePanel only needs
// to wire it; we cover snippet generation separately.
vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: ({ toolCalls }: { toolCalls: { toolName: string }[] }) => (
    <div data-testid="code-export-mock" data-tool={toolCalls[0]?.toolName} />
  ),
}));

import { DatasetStructurePanel } from '@/components/workspace/DatasetStructurePanel';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useDatasetMock.mockReset();
  useDatasetSummaryMock.mockReset();
  useClassCountsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DatasetStructurePanel', () => {
  it('renders the loading skeleton while any of the three queries are pending', () => {
    useDatasetMock.mockReturnValue({ data: null, isLoading: true, isError: false });
    useDatasetSummaryMock.mockReturnValue({ data: null, isLoading: true, isError: false });
    useClassCountsMock.mockReturnValue({ data: null, isLoading: true, isError: false });

    const { container } = render(
      <Wrapper>
        <DatasetStructurePanel datasetId="ds1" />
      </Wrapper>,
    );

    // Skeleton from `@/components/ui/Skeleton` renders an `aria-hidden`
    // div with the `skeleton` class. We assert at least one renders.
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders an inline error block when any of the three queries fail', () => {
    useDatasetMock.mockReturnValue({ data: null, isLoading: false, isError: true });
    useDatasetSummaryMock.mockReturnValue({ data: null, isLoading: false, isError: false });
    useClassCountsMock.mockReturnValue({ data: null, isLoading: false, isError: false });

    render(
      <Wrapper>
        <DatasetStructurePanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn.t load the dataset structure/i)).toBeInTheDocument();
  });

  it('renders dataset name, count chips, and biology pills on success', () => {
    useDatasetMock.mockReturnValue({
      data: { id: 'ds1', name: 'BNST patch-clamp electrophysiology', license: 'CC-BY-4.0', doi: '10.1234/abcd' },
      isLoading: false,
      isError: false,
    });
    useDatasetSummaryMock.mockReturnValue({
      data: {
        datasetId: 'ds1',
        counts: { sessions: 1, subjects: 215, probes: 3, elements: 606, epochs: 1200, totalDocuments: 5314 },
        species: [{ label: 'Rattus norvegicus', ontologyId: 'NCBITaxon:10116' }],
        brainRegions: [
          { label: 'BNST', ontologyId: 'UBERON:0001880' },
          { label: 'PVH', ontologyId: 'UBERON:0001930' },
        ],
        strains: [{ label: 'wild-type', ontologyId: null }],
      },
      isLoading: false,
      isError: false,
    });
    useClassCountsMock.mockReturnValue({
      data: {
        datasetId: 'ds1',
        totalDocuments: 5314,
        classCounts: {
          subject: 215,
          element: 606,
          element_epoch: 1200,
          vmspikesummary: 800,
          treatment: 400,
          probe: 0,
        },
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DatasetStructurePanel datasetId="ds1" />
      </Wrapper>,
    );

    // Dataset name renders.
    expect(screen.getByText(/BNST patch-clamp electrophysiology/i)).toBeInTheDocument();
    // Count chips render — assert via `getAllByText` because some
    // numbers (215, 606) also appear inside the collapsible "All
    // document classes" list at the bottom of the card.
    expect(screen.getAllByText('215').length).toBeGreaterThan(0);
    expect(screen.getAllByText('606').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1,200').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5,314').length).toBeGreaterThan(0);
    // Biology pills render the labels.
    expect(screen.getByText('Rattus norvegicus')).toBeInTheDocument();
    expect(screen.getByText('BNST')).toBeInTheDocument();
    expect(screen.getByText('wild-type')).toBeInTheDocument();
    // Subject count chip deeplinks into the existing summary tables
    // tab — find the chip-level link (the "All classes" list also
    // contains a `subject` link, distinguished by label text).
    const subjectsLabel = screen.getByText(/^subjects$/i);
    const subjectsChipLink = subjectsLabel.closest('a');
    expect(subjectsChipLink?.getAttribute('href')).toBe('/datasets/ds1/tables/subject');
  });

  it('handles null biology arrays without crashing', () => {
    useDatasetMock.mockReturnValue({
      data: { id: 'ds1', name: 'Empty dataset' },
      isLoading: false,
      isError: false,
    });
    useDatasetSummaryMock.mockReturnValue({
      data: {
        datasetId: 'ds1',
        counts: { sessions: 0, subjects: 0, probes: 0, elements: 0, epochs: 0, totalDocuments: 0 },
        species: null,
        brainRegions: null,
        strains: null,
      },
      isLoading: false,
      isError: false,
    });
    useClassCountsMock.mockReturnValue({
      data: { datasetId: 'ds1', totalDocuments: 0, classCounts: {} },
      isLoading: false,
      isError: false,
    });

    expect(() =>
      render(
        <Wrapper>
          <DatasetStructurePanel datasetId="ds1" />
        </Wrapper>,
      ),
    ).not.toThrow();
    expect(screen.getByText('Empty dataset')).toBeInTheDocument();
  });

  it('wires the Show Code button with toolName=get_dataset_summary', () => {
    useDatasetMock.mockReturnValue({
      data: { id: 'ds1', name: 'X' },
      isLoading: false,
      isError: false,
    });
    useDatasetSummaryMock.mockReturnValue({
      data: {
        datasetId: 'ds1',
        counts: { sessions: 0, subjects: 0, probes: 0, elements: 0, epochs: 0, totalDocuments: 0 },
        species: [],
        brainRegions: [],
        strains: [],
      },
      isLoading: false,
      isError: false,
    });
    useClassCountsMock.mockReturnValue({
      data: { datasetId: 'ds1', totalDocuments: 0, classCounts: {} },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <DatasetStructurePanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByTestId('code-export-mock')).toHaveAttribute(
      'data-tool',
      'get_dataset_summary',
    );
  });
});

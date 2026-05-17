/**
 * ElectrodePositionPanel — auto-loading spatial scatter of probe
 * locations. Coordinate extraction is the load-bearing logic; the
 * tests pin all three doc shapes (nested coordinates, flat x/y/z,
 * stereotaxic ml/ap/dv) and the two empty-state branches (no docs
 * at all, vs docs that lack coordinates).
 *
 * Pattern follows DatasetStructurePanel.test.tsx: hooks + child
 * chart + CodeExportButton are mocked so the test exercises panel
 * logic without dragging Plotly / snippet generators in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const useDocumentsMock = vi.fn();

vi.mock('@/lib/api/documents', () => ({
  useDocuments: (...args: unknown[]) => useDocumentsMock(...args),
}));

vi.mock('@/components/ndi/charts/ElectrodeMapChart', () => ({
  ElectrodeMapChart: (props: {
    datasetId: string;
    title?: string;
    points: Array<{ label: string; x: number; y: number; z?: number; brainRegion?: string }>;
  }) => (
    <div
      data-testid="electrode-map-mock"
      data-dataset={props.datasetId}
      data-title={props.title ?? ''}
      data-points={JSON.stringify(props.points)}
      data-point-count={String(props.points.length)}
    />
  ),
}));

vi.mock('@/components/ai/CodeExportButton', () => ({
  CodeExportButton: ({ toolCalls }: { toolCalls: { toolName: string; args: unknown }[] }) => (
    <div
      data-testid="code-export-mock"
      data-tool={toolCalls[0]?.toolName}
      data-args={JSON.stringify(toolCalls[0]?.args)}
    />
  ),
}));

import { ElectrodePositionPanel } from '@/components/workspace/ElectrodePositionPanel';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  useDocumentsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ElectrodePositionPanel', () => {
  it('auto-loads on mount with class=probe_location, page=1, size=200 (backend cap)', () => {
    useDocumentsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    // The hook is invoked once on mount with the documented args.
    expect(useDocumentsMock).toHaveBeenCalledWith('ds1', 'probe_location', 1, 200);
  });

  it('renders the loading skeleton while the documents query is pending', () => {
    useDocumentsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container } = render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    // Skeleton renders an aria-hidden div with the `skeleton` class.
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
    // Chart should not be mounted while loading.
    expect(screen.queryByTestId('electrode-map-mock')).not.toBeInTheDocument();
  });

  it('renders the no-docs empty state when the documents query fails', () => {
    // 2026-05-14: changed from a red-alert "couldn't load" message to
    // the educational EmptyState. The query failing is almost always
    // "this dataset has no probe_location class" (a 404 from the
    // tables endpoint), not a network / auth fault — we reached this
    // panel through the auth gate on a valid dataset id. The old
    // "may not exist or you may not have access" copy was alarming
    // + misleading.
    useDocumentsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(
      screen.getByText(/this dataset has no probe location data/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('electrode-map-mock')).not.toBeInTheDocument();
    // No red alert anymore — the empty state is a soft `role="status"`.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the no-docs empty state when the dataset has zero probe_location documents', () => {
    useDocumentsMock.mockReturnValue({
      data: { total: 0, page: 1, pageSize: 200, documents: [] },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    expect(screen.getByText(/no probe location data/i)).toBeInTheDocument();
    // Empty-state copy explains WHAT'S needed, not just "no data".
    // `probe_location` appears in multiple <code> spans, so assert
    // via getAllByText.
    expect(screen.getAllByText(/probe_location/).length).toBeGreaterThan(0);
    // Outbound Document Explorer link removed in the one-canvas
    // redesign (2026-05-16) — the single escape lives in the picker
    // rail footer now. Assert it's GONE.
    expect(screen.queryByText(/Open Document Explorer/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('electrode-map-mock')).not.toBeInTheDocument();
    // Show Code button is hidden when there's nothing to export.
    expect(screen.queryByTestId('code-export-mock')).not.toBeInTheDocument();
  });

  it('renders the no-coords empty state when docs exist but none carry coordinates', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        total: 2,
        page: 1,
        pageSize: 200,
        documents: [
          { id: 'doc1', name: 'probe A', data: { probe_location: { name: 'A' } } },
          { id: 'doc2', name: 'probe B', data: { probe_location: { region: 'Cortex' } } },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    // The no-coords copy mentions the document count we found.
    expect(screen.getByText(/Found 2/)).toBeInTheDocument();
    expect(screen.getByText(/extractable coordinate fields/i)).toBeInTheDocument();
    expect(screen.queryByTestId('electrode-map-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-export-mock')).not.toBeInTheDocument();
  });

  it('extracts points from the canonical nested coordinates shape', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        total: 2,
        page: 1,
        pageSize: 200,
        documents: [
          {
            id: 'doc1',
            name: 'probe 1',
            data: {
              probe_location: {
                coordinates: { x: 2400, y: -1800, z: 1500 },
                brain_region: 'BNST',
              },
            },
          },
          {
            id: 'doc2',
            name: 'probe 2',
            data: {
              probe_location: {
                coordinates: { x: -1200, y: 800 },
              },
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    const chart = screen.getByTestId('electrode-map-mock');
    expect(chart).toHaveAttribute('data-dataset', 'ds1');
    expect(chart).toHaveAttribute('data-point-count', '2');
    const points = JSON.parse(chart.getAttribute('data-points') ?? '[]');
    expect(points[0]).toMatchObject({
      label: 'probe 1',
      x: 2400,
      y: -1800,
      z: 1500,
      brainRegion: 'BNST',
    });
    // Second point has no z / no brainRegion → both keys absent.
    expect(points[1]).toMatchObject({ label: 'probe 2', x: -1200, y: 800 });
    expect(points[1].z).toBeUndefined();
    expect(points[1].brainRegion).toBeUndefined();
  });

  it('extracts points from the flat x/y/z fallback shape', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        total: 1,
        page: 1,
        pageSize: 200,
        documents: [
          {
            id: 'doc1',
            name: 'flat probe',
            data: {
              probe_location: { x: 500, y: 600, z: 200, ontology_term: 'UBERON:0001870' },
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    const chart = screen.getByTestId('electrode-map-mock');
    const points = JSON.parse(chart.getAttribute('data-points') ?? '[]');
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      label: 'flat probe',
      x: 500,
      y: 600,
      z: 200,
      brainRegion: 'UBERON:0001870',
    });
  });

  it('extracts points from the stereotaxic ml/ap/dv alias shape', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        total: 1,
        page: 1,
        pageSize: 200,
        documents: [
          {
            id: 'doc1',
            data: {
              probe_location: { ml: 1.5, ap: -2.3, dv: 4.0 },
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    const chart = screen.getByTestId('electrode-map-mock');
    const points = JSON.parse(chart.getAttribute('data-points') ?? '[]');
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ x: 1.5, y: -2.3, z: 4.0 });
    // Missing name → label falls back to truncated id.
    expect(points[0].label).toContain('doc1');
  });

  it('renders a chart title with the probe + subject counts when subjects are derivable', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        total: 2,
        page: 1,
        pageSize: 200,
        documents: [
          {
            id: 'doc1',
            data: {
              probe_location: { coordinates: { x: 1, y: 2 } },
              depends_on: [{ name: 'subject_id', value: 'subj-A' }],
            },
          },
          {
            id: 'doc2',
            data: {
              probe_location: { coordinates: { x: 3, y: 4 } },
              depends_on: [{ name: 'subject_id', value: 'subj-B' }],
            },
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    const chart = screen.getByTestId('electrode-map-mock');
    expect(chart.getAttribute('data-title')).toBe(
      'Electrode positions — 2 probes across 2 subjects',
    );
  });

  it('drops docs that fail every coordinate shape and only renders extractable points', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        total: 3,
        page: 1,
        pageSize: 200,
        documents: [
          // Good: nested coordinates.
          {
            id: 'doc1',
            data: { probe_location: { coordinates: { x: 1, y: 2 } } },
          },
          // Bad: no coordinate fields at all.
          { id: 'doc2', data: { probe_location: { name: 'orphan' } } },
          // Good: flat x/y.
          { id: 'doc3', data: { probe_location: { x: 5, y: 6 } } },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    const chart = screen.getByTestId('electrode-map-mock');
    expect(chart).toHaveAttribute('data-point-count', '2');
  });

  it('wires the Show Code button with toolName=query_documents after data loads', () => {
    useDocumentsMock.mockReturnValue({
      data: {
        total: 1,
        page: 1,
        pageSize: 200,
        documents: [
          { id: 'doc1', data: { probe_location: { coordinates: { x: 1, y: 2 } } } },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(
      <Wrapper>
        <ElectrodePositionPanel datasetId="ds1" />
      </Wrapper>,
    );

    const exportBtn = screen.getByTestId('code-export-mock');
    expect(exportBtn).toHaveAttribute('data-tool', 'query_documents');
    const args = JSON.parse(exportBtn.getAttribute('data-args') ?? '{}');
    expect(args).toEqual({
      datasetId: 'ds1',
      className: 'probe_location',
      limit: 200,
    });
  });
});

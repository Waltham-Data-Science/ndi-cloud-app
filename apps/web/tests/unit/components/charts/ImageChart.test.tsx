/**
 * ImageChart — verifies the fetch + state surface (loading, error,
 * empty, soft-error, success). The actual Plotly rendering is owned
 * by `PlotlyMount` (covered indirectly via ViolinChart/SignalChart);
 * we mock it here so we don't drag Plotly's DOM dependencies into the
 * ImageChart test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Mock PlotlyMount so ImageChart's wrapper logic is the unit under
// test, not the Plotly rendering. The mock surfaces a marker node we
// can assertion on, plus echoes a summary of the data it received so
// we can verify the fetch result is wired through.
vi.mock('@/components/ndi/charts/PlotlyMount', () => ({
  PlotlyMount: ({
    data,
  }: {
    data: Array<{ z: number[][]; type: string }>;
  }) => (
    <div data-testid="plotly-mount" data-trace-type={data[0]?.type}>
      rows={data[0]?.z?.length ?? 0}
    </div>
  ),
}));

// Mock apiFetch so we can drive the query state from each test.
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { ImageChart } from '@/components/ndi/charts/ImageChart';
import { apiFetch } from '@/lib/api/client';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Provider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Provider;
}

const baseImageResponse = {
  width: 8,
  height: 4,
  data: [
    [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0],
    [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
    [2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0],
    [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
  ],
  min: 0.0,
  max: 10.0,
  format: 'tiff',
  downsampled: false,
  source: {
    dataset_id: 'ds1',
    document_id: 'doc1',
    doc_class: 'image',
    doc_name: 'Patch encounter map S1',
    filename: 'cell_image.tiff',
  },
};

describe('ImageChart', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading state while the fetch is in flight', () => {
    mockedApiFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(
      <ImageChart datasetId="ds1" docId="doc1" title="Test image" />,
      { wrapper: withClient() },
    );
    expect(screen.getByText(/Loading image/i)).toBeInTheDocument();
  });

  it('hits the image endpoint with the right URL + frame param', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseImageResponse);
    render(
      <ImageChart datasetId="ds1" docId="doc1" frame={3} title="Test image" />,
      { wrapper: withClient() },
    );
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/datasets/ds1/documents/doc1/image?'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    const url = mockedApiFetch.mock.calls[0]![0] as string;
    expect(url).toContain('frame=3');
  });

  it('defaults to frame=0 when not provided', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseImageResponse);
    render(
      <ImageChart datasetId="ds1" docId="doc1" />,
      { wrapper: withClient() },
    );
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    const url = mockedApiFetch.mock.calls[0]![0] as string;
    expect(url).toContain('frame=0');
  });

  it('mounts PlotlyMount with the fetched data on success', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseImageResponse);
    render(
      <ImageChart datasetId="ds1" docId="doc1" title="Test image" />,
      { wrapper: withClient() },
    );
    await waitFor(() =>
      expect(screen.getByTestId('plotly-mount')).toBeInTheDocument(),
    );
    const mount = screen.getByTestId('plotly-mount');
    expect(mount.getAttribute('data-trace-type')).toBe('heatmap');
    // 4 rows in the fixture array.
    expect(mount).toHaveTextContent('rows=4');
  });

  it('shows the explicit title from props in the caption', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseImageResponse);
    render(
      <ImageChart datasetId="ds1" docId="doc1" title="Cell image — slice 5" />,
      { wrapper: withClient() },
    );
    await waitFor(() =>
      expect(screen.getByText('Cell image — slice 5')).toBeInTheDocument(),
    );
  });

  it("falls back to source.doc_name when title prop isn't provided", async () => {
    mockedApiFetch.mockResolvedValueOnce(baseImageResponse);
    render(<ImageChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText('Patch encounter map S1')).toBeInTheDocument(),
    );
  });

  it('shows the soft-error message when backend returns a decoder error', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      error: 'Image format not recognized by Pillow',
      errorKind: 'unsupported',
    });
    render(<ImageChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText(/format not recognized/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('plotly-mount')).not.toBeInTheDocument();
  });

  it('shows the network-error state when apiFetch throws', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('Network down'));
    render(<ImageChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText(/Network down/i)).toBeInTheDocument(),
    );
  });

  it('renders a "View source document" link to the Document Explorer', async () => {
    mockedApiFetch.mockResolvedValueOnce(baseImageResponse);
    render(<ImageChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() => screen.getByText(/View source document/));
    const link = screen.getByText(/View source document/) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/datasets/ds1/documents/doc1');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows the dimensions + downsampling note in the footer', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...baseImageResponse,
      width: 512,
      height: 384,
      downsampled: true,
    });
    render(<ImageChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText(/512×384.*downsampled/i)).toBeInTheDocument(),
    );
  });

  it('renders the format badge from the response', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...baseImageResponse,
      format: 'png',
    });
    render(<ImageChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() => expect(screen.getByText('png')).toBeInTheDocument());
  });

  it('shows "No image data" when the response is empty (defensive)', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...baseImageResponse,
      data: [],
      width: 0,
      height: 0,
    });
    render(<ImageChart datasetId="ds1" docId="doc1" />, {
      wrapper: withClient(),
    });
    await waitFor(() =>
      expect(screen.getByText(/No image data/i)).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('plotly-mount')).not.toBeInTheDocument();
  });
});

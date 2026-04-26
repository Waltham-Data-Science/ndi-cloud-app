/**
 * DataPanel — Phase 6.6 REBUILD-10.
 *
 * The unified binary-data viewer dispatches on the `useBinaryKind`
 * response (`timeseries` | `image` | `video` | `fitcurve` | `unknown`)
 * and renders the matching child viewer. This test pins the
 * dispatch contract — the deeper viewer-internals tests
 * (uPlot setup, image frame stepper, video controls) live in
 * separate per-viewer specs as those land.
 *
 * uPlot is imported synchronously by `TimeseriesChart`; we mock the
 * uPlot module here so jsdom doesn't have to deal with canvas
 * measurement. Same approach as the source data-browser's test setup
 * (which runs jsdom too).
 */
import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type {
  BinaryKind,
  TimeseriesData,
  ImageData,
  VideoData,
  FitcurveData,
} from '@/lib/api/binary';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// Stub uPlot — the constructor would crash in jsdom on first
// `getContext('2d')`. Replace with a no-op so TimeseriesChart can mount
// and we can assert on the surrounding card chrome / loading branches.
vi.mock('uplot', () => ({
  default: vi.fn().mockImplementation(function () {
    return { destroy: vi.fn(), setSize: vi.fn() };
  }),
}));
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

import { DataPanel } from '@/components/app/DataPanel';

function withClient(seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (seed) seed(qc);
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('DataPanel — Phase 6.6 REBUILD-10', () => {
  it('renders a skeleton while the kind detection is pending', () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    // Skeleton ships the `.skeleton` class.
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('renders nothing when kind is "unknown"', () => {
    const Wrapper = withClient((qc) => {
      qc.setQueryData<{ kind: BinaryKind }>(
        ['binary-kind', 'd1', 'doc-1'],
        { kind: 'unknown' },
      );
    });
    const { container } = render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    // No card chrome should render — only the wrapper div.
    expect(container.querySelector('[class*="card"]')).toBeNull();
    expect(screen.queryByText(/timeseries/i)).toBeNull();
  });

  it('renders the Image card when kind is "image"', () => {
    const Wrapper = withClient((qc) => {
      qc.setQueryData<{ kind: BinaryKind }>(
        ['binary-kind', 'd1', 'doc-1'],
        { kind: 'image' },
      );
      qc.setQueryData<ImageData>(
        ['binary', 'image', 'd1', 'doc-1'],
        {
          dataUri: 'data:image/png;base64,abc',
          width: 100,
          height: 100,
          format: 'png',
        },
      );
    });
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    expect(screen.getByText(/^Image$/)).toBeInTheDocument();
  });

  it('renders the Video card when kind is "video"', () => {
    const Wrapper = withClient((qc) => {
      qc.setQueryData<{ kind: BinaryKind }>(
        ['binary-kind', 'd1', 'doc-1'],
        { kind: 'video' },
      );
      qc.setQueryData<VideoData>(
        ['binary', 'video', 'd1', 'doc-1'],
        { url: '/some.mp4', contentType: 'video/mp4' } as VideoData,
      );
    });
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    expect(screen.getByText(/^Video$/)).toBeInTheDocument();
  });

  it('renders the Fit curve card when kind is "fitcurve"', () => {
    const Wrapper = withClient((qc) => {
      qc.setQueryData<{ kind: BinaryKind }>(
        ['binary-kind', 'd1', 'doc-1'],
        { kind: 'fitcurve' },
      );
      qc.setQueryData<FitcurveData>(
        ['binary', 'fitcurve', 'd1', 'doc-1'],
        {
          form: 'gaussian',
          parameters: [1, 2, 3],
          x: [0, 1, 2],
          y: [0, 0.5, 1],
        },
      );
    });
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    expect(screen.getByText(/Fit curve/i)).toBeInTheDocument();
  });

  it('renders the Timeseries card label including the format suffix', () => {
    const Wrapper = withClient((qc) => {
      qc.setQueryData<{ kind: BinaryKind }>(
        ['binary-kind', 'd1', 'doc-1'],
        { kind: 'timeseries' },
      );
      qc.setQueryData<TimeseriesData>(
        ['binary', 'timeseries', 'd1', 'doc-1'],
        {
          channels: { '0': [1, 2, 3] },
          timestamps: [0, 0.001, 0.002],
          sample_count: 3,
          format: 'mda',
        },
      );
    });
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    // Source: `Timeseries${format ? ` (${FORMAT.toUpperCase()})` : ''}`.
    expect(screen.getByText(/Timeseries \(MDA\)/i)).toBeInTheDocument();
  });
});

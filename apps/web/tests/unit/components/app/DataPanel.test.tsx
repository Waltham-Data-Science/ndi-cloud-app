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
const apiFetchBinaryMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiFetchBinary: (...args: unknown[]) => apiFetchBinaryMock(...args),
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
  apiFetchBinaryMock.mockReset();
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

  it('renders a friendly empty state when /data/image returns BINARY_DECODE_FAILED', async () => {
    // Pre-fix DataPanel rendered `null` in the body when the binary
    // fetch failed, leaving an empty Image card under the header.
    // Visible on production 2026-04-28 on Bhar's C. elegans
    // imageStacks where PIL can't decode the dataset's raw uint8
    // frame stacks. Now the body shows "Inline preview not supported
    // for this image's file format. The raw file is still downloadable
    // from the Files section above."
    const { ApiError } = await import('@/lib/api/errors');
    const decodeErr = new ApiError(502, {
      code: 'BINARY_DECODE_FAILED',
      message: 'Could not read the binary data for this document.',
      recovery: 'contact_support',
      requestId: 'test-rid-123',
    });

    // Branch on URL: kind detection resolves, image fetch rejects.
    // Lets TanStack Query take its normal error path so the test
    // exercises the real isError/error wiring (vs hand-seeding a
    // QueryState which TanStack 5 doesn't expose for write).
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/data/type')) {
        return Promise.resolve({ kind: 'image' });
      }
      if (url.endsWith('/data/image')) {
        return Promise.reject(decodeErr);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    // Friendly factual copy, not a red alarm.
    expect(await screen.findByText(/preview not supported/i)).toBeInTheDocument();
    expect(screen.getByText(/Files section above/i)).toBeInTheDocument();
  });

  it('renders a generic error when a binary fetch fails with a non-decode error', async () => {
    // Anything other than BINARY_DECODE_FAILED → generic "Couldn't
    // load" inline alert with the requestId so support tickets carry
    // the diagnostic detail.
    const { ApiError } = await import('@/lib/api/errors');
    const oopsErr = new ApiError(500, {
      code: 'INTERNAL',
      message: 'Something exploded.',
      recovery: 'retry',
      requestId: 'test-rid-456',
    });

    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/data/type')) {
        return Promise.resolve({ kind: 'timeseries' });
      }
      if (url.endsWith('/data/timeseries')) {
        return Promise.reject(oopsErr);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );
    expect(await screen.findByText(/Couldn.t load the timeseries preview/i)).toBeInTheDocument();
    expect(screen.getByText(/Something exploded\./)).toBeInTheDocument();
    expect(screen.getByText(/test-rid-456/)).toBeInTheDocument();
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

  // -------------------------------------------------------------------------
  // imageStack format-aware dispatch (Step 3 of the viewer rework)
  // -------------------------------------------------------------------------
  //
  // Dispatch matrix (post format-aware-viewer rework):
  //
  //   formatOntology         | renderMode  | viewer
  //   -----------------------+-------------+--------------------------
  //   NCIT:C190180 (MP4)     | video       | ImageStackVideoViewer
  //   NCIT:C70631  (image)   | pil         | ImageViewer (existing)
  //   NCIT:C85437  (mask)    | pil         | ImageViewer (existing)
  //   undefined / unknown    | pil         | ImageViewer (existing)
  //   raw-bytes ontology +   | canvas      | ImageStackCanvasViewer
  //   data_type=uint8        |             |   (default-deny today;
  //                          |             |    no production data
  //                          |             |    routes here)
  //
  // The cases below pin the production-observed cells of that matrix.

  it('routes imageStack docs with formatOntology=NCIT:C190180 (MP4 / Bhar) through the <video> viewer', async () => {
    // Inline imageStack_parameters block with format ontology MP4 →
    // ImageStackVideoViewer mounts; canvas decode is gated off; PIL
    // /data/image is never fired.
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/data/type')) {
        return Promise.resolve({ kind: 'image' });
      }
      if (url === '/api/datasets/d1/documents/doc-1') {
        return Promise.resolve({
          id: 'doc-1',
          ndiId: 'ndi:imagestack:abc',
          className: 'imageStack',
          data: {
            imageStack: { formatOntology: 'NCIT:C190180' },
            imageStack_parameters: {
              dimension_size: [480, 640, 100],
              dimension_order: 'YXT',
              data_type: 'uint8',
              data_limits: [0, 255],
            },
          },
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );

    // <video> mounts with src=/data/raw.
    const video = (await screen.findByTestId(
      'imagestack-video',
    )) as HTMLVideoElement;
    expect(video.tagName).toBe('VIDEO');
    expect(video.getAttribute('src')).toBe(
      '/api/datasets/d1/documents/doc-1/data/raw',
    );

    // Neither the canvas nor the PIL `<img>` are in the DOM.
    expect(screen.queryByTestId('imagestack-canvas')).toBeNull();
    expect(document.querySelector('img[alt="NDI image data"]')).toBeNull();

    // PIL /data/image was NOT called — the partner-class lookup was
    // also skipped because we resolved inline.
    const imageUrls = apiFetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.endsWith('/data/image'));
    expect(imageUrls).toHaveLength(0);
    const partnerUrls = apiFetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('class=imageStack_parameters'));
    expect(partnerUrls).toHaveLength(0);
    // Raw binary endpoint isn't hit by DataPanel itself for video —
    // the `<video>` element streams it directly via its `src`.
    expect(apiFetchBinaryMock).not.toHaveBeenCalled();
  });

  it('routes imageStack docs with formatOntology=NCIT:C85437 (PNG mask / Haley) through the PIL /data/image path', async () => {
    // Inline imageStack_parameters with format ontology = mask image
    // → PIL pipeline; canvas decode is gated off; <video> not used.
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/data/type')) {
        return Promise.resolve({ kind: 'image' });
      }
      if (url === '/api/datasets/d1/documents/doc-1') {
        return Promise.resolve({
          id: 'doc-1',
          ndiId: 'ndi:imagestack:abc',
          className: 'imageStack',
          data: {
            imageStack: { formatOntology: 'NCIT:C85437' },
            imageStack_parameters: {
              dimension_size: [256, 256],
              dimension_order: 'YX',
              data_type: 'uint8',
              data_limits: [0, 255],
            },
          },
        });
      }
      if (url.endsWith('/data/image')) {
        return Promise.resolve({
          dataUri: 'data:image/jpeg;base64,abc',
          width: 256,
          height: 256,
          format: 'png',
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );

    // PIL <img> renders with alt="NDI image data".
    const img = await screen.findByAltText(/NDI image data/i);
    expect(img.tagName).toBe('IMG');
    // No canvas, no video.
    expect(screen.queryByTestId('imagestack-canvas')).toBeNull();
    expect(screen.queryByTestId('imagestack-video')).toBeNull();
    // Raw binary endpoint was NOT hit (canvas path stayed off).
    expect(apiFetchBinaryMock).not.toHaveBeenCalled();
  });

  it('falls back to the partner-class query when the doc has no inline imageStack_parameters', async () => {
    // Hypothetical future dataset that ships sibling
    // `imageStack_parameters` docs. Not observed in production today,
    // but the partner-doc resolver is preserved as the fallback.
    // Without a matching format ontology, this still routes to PIL.
    const docs = {
      total: 1,
      page: 1,
      pageSize: 500,
      documents: [
        {
          id: 'partner-1',
          ndiId: 'ndi:imagestack_parameters:1',
          className: 'imageStack_parameters',
          data: {
            depends_on: [
              { name: 'imageStack_id', value: 'ndi:imagestack:abc' },
            ],
            imageStack_parameters: {
              dimension_size: [4, 4, 3, 1, 1],
              dimension_order: 'YXCZT',
              data_type: 'uint8',
              data_limits: [0, 255],
            },
          },
        },
      ],
    };

    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/data/type')) {
        return Promise.resolve({ kind: 'image' });
      }
      if (url === '/api/datasets/d1/documents/doc-1') {
        return Promise.resolve({
          id: 'doc-1',
          ndiId: 'ndi:imagestack:abc',
          className: 'imageStack',
          // No inline imageStack_parameters → falls back to the
          // partner-class query.
          data: {},
        });
      }
      if (url.includes('class=imageStack_parameters')) {
        return Promise.resolve(docs);
      }
      if (url.endsWith('/data/image')) {
        return Promise.resolve({
          dataUri: 'data:image/jpeg;base64,abc',
          width: 4,
          height: 4,
          format: 'png',
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <DataPanel datasetId="d1" documentId="doc-1" />
      </Wrapper>,
    );

    // The partner-class endpoint was hit because no inline params.
    await screen.findByAltText(/NDI image data/i);
    const partnerUrls = apiFetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('class=imageStack_parameters'));
    expect(partnerUrls.length).toBeGreaterThan(0);
    // PIL renders (no formatOntology on the doc → default routing).
    expect(screen.queryByTestId('imagestack-canvas')).toBeNull();
    expect(screen.queryByTestId('imagestack-video')).toBeNull();
  });
});

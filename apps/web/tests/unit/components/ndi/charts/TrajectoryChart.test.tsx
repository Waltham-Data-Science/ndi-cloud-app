/**
 * TrajectoryChart — XY position track with time-coloring.
 *
 * Pinned behaviors:
 *   - pickXYChannels heuristic (explicit / literal-x-y / first-two)
 *   - loading state renders the right placeholder
 *   - error state surfaces the message via role="alert"
 *   - backend soft-error envelope (data.error) renders as a status hint
 *   - <2 valid channels → "No XY trajectory" empty state
 *   - 2 valid channels → SVG with start + end markers and N-1 segments
 *   - decimation kicks in for very long tracks (segments capped)
 *   - null + non-finite x/y values are filtered out
 *
 * The component owns its own TanStack Query call; we mock `apiFetch`
 * at the module boundary so the tests aren't coupled to the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { TimeseriesData } from '@/lib/api/binary';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiFetch: (url: string, opts?: unknown) => apiFetchMock(url, opts),
  // Defensive — apiFetchBinary lives in the same module; the body
  // doesn't call it but the import side-effect graph might. Stubbed
  // to a rejecting placeholder so any accidental call fails loudly.
  apiFetchBinary: vi.fn(() => Promise.reject(new Error('not implemented in test'))),
  ApiError: class extends Error {},
}));

import { TrajectoryChart, pickXYChannels } from '@/components/ndi/charts/TrajectoryChart';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function buildResponse(channels: Record<string, Array<number | null>>): TimeseriesData {
  const counts = Object.values(channels).map((c) => c.length);
  return {
    channels,
    sample_count: counts[0] ?? 0,
    format: 'test',
    timestamps: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('pickXYChannels', () => {
  it('returns null when fewer than 2 channels available', () => {
    expect(pickXYChannels([])).toBeNull();
    expect(pickXYChannels(['x'])).toBeNull();
  });

  it('honors explicit x/y hints when both exist in the channel list', () => {
    expect(pickXYChannels(['a', 'b', 'c'], 'a', 'c')).toEqual({ x: 'a', y: 'c' });
  });

  it('falls back to heuristic when only one hint resolves', () => {
    // 'a' is valid but 'zzz' isn't — heuristic kicks in.
    const r = pickXYChannels(['a', 'b'], 'a', 'zzz');
    // First-two-in-document-order: x=a, y=b.
    expect(r).toEqual({ x: 'a', y: 'b' });
  });

  it('prefers literal "x" / "y" channel names case-insensitively', () => {
    expect(pickXYChannels(['z', 'X', 'Y', 'extra'])).toEqual({ x: 'X', y: 'Y' });
    expect(pickXYChannels(['pos_y', 'pos_x'])).toEqual({ x: 'pos_x', y: 'pos_y' });
  });

  it('falls back to first two channels in document order when no x/y names match', () => {
    expect(pickXYChannels(['ch0', 'ch1', 'ch2'])).toEqual({ x: 'ch0', y: 'ch1' });
  });
});

describe('TrajectoryChart rendering', () => {
  it('renders a loading placeholder while fetching', () => {
    // Keep the promise pending so isLoading stays true.
    apiFetchMock.mockReturnValue(new Promise(() => {}));

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" />
      </Wrapper>,
    );

    expect(screen.getByText(/loading trajectory/i)).toBeInTheDocument();
  });

  it('renders an error alert when the fetch rejects', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });

  it('renders the backend soft-error envelope as a status hint', async () => {
    apiFetchMock.mockResolvedValue({
      ...buildResponse({}),
      error: 'Decoder unavailable for this format',
    });

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText(/decoder unavailable/i)).toBeInTheDocument();
    });
  });

  it('renders an "empty" hint when the document has fewer than 2 channels', async () => {
    apiFetchMock.mockResolvedValue(buildResponse({ x: [0, 1, 2] }));

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('trajectory-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/no xy trajectory/i)).toBeInTheDocument();
  });

  it('renders the SVG with start + end markers + segments for valid XY data', async () => {
    apiFetchMock.mockResolvedValue(
      buildResponse({
        x: [0, 1, 2, 3, 4],
        y: [0, 1, 0, 1, 0],
      }),
    );

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" title="Plate 1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('trajectory-svg')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trajectory-start')).toBeInTheDocument();
    expect(screen.getByTestId('trajectory-end')).toBeInTheDocument();
    // 5 points → 4 segments
    const segments = screen
      .getByTestId('trajectory-segments')
      .querySelectorAll('line');
    expect(segments).toHaveLength(4);
  });

  it('filters out null and non-finite samples before rendering', async () => {
    apiFetchMock.mockResolvedValue(
      buildResponse({
        x: [0, null, 1, 2, 3, 4],
        y: [0, 1, null, 1, 0, 1],
      }),
    );

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('trajectory-svg')).toBeInTheDocument();
    });
    // Original 6 paired samples; two have nulls in either x or y →
    // 4 valid pairs → 3 segments.
    const segments = screen
      .getByTestId('trajectory-segments')
      .querySelectorAll('line');
    expect(segments).toHaveLength(3);
  });

  it('renders the empty hint when nulls leave <2 valid pairs', async () => {
    apiFetchMock.mockResolvedValue(
      buildResponse({
        x: [null, 1],
        y: [0, null],
      }),
    );

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('trajectory-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/only 0 valid samples/i)).toBeInTheDocument();
  });

  it('shows the decimated hint when sample count exceeds the render cap', async () => {
    // Build > MAX_RENDER_POINTS (=2000) samples; ensure the hint surfaces
    // and the segment count is bounded.
    const n = 5000;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      xs.push(i);
      ys.push(Math.sin(i / 50) * 10);
    }
    apiFetchMock.mockResolvedValue(buildResponse({ x: xs, y: ys }));

    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="doc1" />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('trajectory-svg')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trajectory-decimated-hint')).toBeInTheDocument();
    const segments = screen
      .getByTestId('trajectory-segments')
      .querySelectorAll('line');
    // Cap is MAX_RENDER_POINTS = 2000; the rendered segment count
    // must be <= 2000 (decimation may add the final point on top, so
    // up to MAX + 1 points → MAX segments).
    expect(segments.length).toBeLessThanOrEqual(2000);
  });

  it('passes downsample / t0 / t1 / file through to the signal URL', async () => {
    apiFetchMock.mockResolvedValue(
      buildResponse({ x: [0, 1], y: [0, 1] }),
    );

    render(
      <Wrapper>
        <TrajectoryChart
          datasetId="ds1"
          docId="doc1"
          downsample={1500}
          t0={2}
          t1={30}
          file="position.nbf"
        />
      </Wrapper>,
    );

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const [url] = apiFetchMock.mock.calls[0]!;
    expect(url).toContain('/api/datasets/ds1/documents/doc1/signal');
    expect(url).toContain('downsample=1500');
    expect(url).toContain('t0=2');
    expect(url).toContain('t1=30');
    expect(url).toContain('file=position.nbf');
  });
});


/*
 * 2026-05-19 (post-handoff) — pair-mode tests. When `yDocId` is set
 * the chart fetches TWO documents (one for X, one for Y) and stitches
 * the first channel of each into a synthetic 2-channel response.
 * Unblocks Haley-style datasets that store X and Y in separate
 * single-channel element_epoch documents.
 */
describe('TrajectoryChart — pair mode (yDocId set)', () => {
  it('fetches both x and y docs and renders an SVG', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/X_DOC/')) return buildResponse({ ch0: [0, 1, 2, 3] });
      if (url.includes('/Y_DOC/')) return buildResponse({ ch0: [4, 5, 6, 7] });
      throw new Error(`unexpected url ${url}`);
    });
    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="X_DOC" yDocId="Y_DOC" />
      </Wrapper>,
    );
    await waitFor(() => {
      // both queries fired
      expect(
        apiFetchMock.mock.calls.some(([u]) => (u as string).includes('/X_DOC/')),
      ).toBe(true);
      expect(
        apiFetchMock.mock.calls.some(([u]) => (u as string).includes('/Y_DOC/')),
      ).toBe(true);
    });
    const fig = await screen.findByTestId('trajectory-chart');
    expect(fig.getAttribute('data-pair-mode')).toBe('true');
    // Should render at least one polyline (path) for the 4-sample trajectory
    expect(fig.querySelectorAll('polyline,line').length).toBeGreaterThan(0);
  });

  it('disambiguates channel names when both source docs name their channel ch0', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/X_DOC/')) return buildResponse({ ch0: [0, 1] });
      if (url.includes('/Y_DOC/')) return buildResponse({ ch0: [2, 3] });
      throw new Error(`unexpected url ${url}`);
    });
    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="X_DOC" yDocId="Y_DOC" />
      </Wrapper>,
    );
    // Wait for render — if disambiguation didn't work, the chart would
    // render the empty state (only 1 channel after dict merge).
    await waitFor(() => {
      const fig = screen.queryByTestId('trajectory-chart');
      expect(fig).not.toBeNull();
      expect(fig!.getAttribute('data-pair-mode')).toBe('true');
    });
    // Empty state shouldn't show in pair mode for valid 1+1 channels.
    expect(screen.queryByTestId('trajectory-empty')).toBeNull();
  });

  it('shows pair badge in figcaption + footer note', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/X_DOC/')) return buildResponse({ ch0: [0, 1] });
      return buildResponse({ ch0: [2, 3] });
    });
    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="X_DOC" yDocId="Y_DOC" />
      </Wrapper>,
    );
    await waitFor(() => {
      // Both the figcaption badge ("pair") and the footer text
      // ("Paired: 2 source documents") should render.
      const fig = screen.getByTestId('trajectory-chart');
      expect(fig.querySelector('figcaption')?.textContent).toMatch(/pair/i);
      expect(screen.getByText(/Paired: 2 source documents/i)).toBeInTheDocument();
    });
  });

  it('single mode (yDocId unset) keeps the legacy single-fetch path', async () => {
    apiFetchMock.mockResolvedValue(buildResponse({ x: [0, 1], y: [2, 3] }));
    render(
      <Wrapper>
        <TrajectoryChart datasetId="ds1" docId="X_DOC" />
      </Wrapper>,
    );
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    // Only ONE fetch in single mode.
    const xCalls = apiFetchMock.mock.calls.filter(([u]) =>
      (u as string).includes('/X_DOC/'),
    );
    expect(xCalls.length).toBe(1);
    const fig = await screen.findByTestId('trajectory-chart');
    expect(fig.getAttribute('data-pair-mode')).toBe('false');
  });
});

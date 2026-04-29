/**
 * QuickPlot — column-first redesign (2026-04-29). Tests pin the new
 * contract:
 *
 *   - Empty state when there are no plottable columns at all.
 *   - When the table has plottable columns, expanding the card auto-
 *     applies the primary suggestion (no blank-dropdown state).
 *   - Switching Y/X re-infers plotType; the chip row highlights match.
 *   - Clicking a chip overrides the inferred type within the
 *     compatible family.
 *   - Clicking a secondary suggestion chip re-seeds Y/X/plotType.
 *   - Copy-Python emits the right matplotlib snippet for the current
 *     view to the clipboard.
 *   - Copy-PNG triggers the html-to-image dynamic import + clipboard
 *     write.
 *
 * uPlot and html-to-image are mocked because jsdom can't drive a
 * canvas. The distribution endpoint is mocked at the apiFetch layer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { TableResponse } from '@/lib/api/tables';

const apiFetchMock = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('uplot', () => ({
  default: vi.fn().mockImplementation(function () {
    return { destroy: vi.fn(), setSize: vi.fn() };
  }),
}));
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

const htmlToImageBlob = vi.fn();
vi.mock('html-to-image', () => ({
  toBlob: (...args: unknown[]) => htmlToImageBlob(...args),
}));

import { QuickPlot } from '@/components/app/QuickPlot';

function withClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

const TABLE: TableResponse = {
  columns: [
    { key: 'subject', label: 'subject' },
    { key: 'firingRate', label: 'firing rate (Hz)' },
    { key: 'spikeCount', label: 'spike count' },
    { key: 'region', label: 'region' },
    { key: 'time', label: 'time (s)' },
  ],
  rows: [
    { subject: 'm1', firingRate: 12.4, spikeCount: 4513, region: 'V1', time: 0.1 },
    { subject: 'm1', firingRate: 8.7, spikeCount: 3001, region: 'V1', time: 0.2 },
    { subject: 'm2', firingRate: 15.1, spikeCount: 5092, region: 'V2', time: 0.3 },
    { subject: 'm2', firingRate: 11.3, spikeCount: 4117, region: 'V2', time: 0.4 },
    { subject: 'm3', firingRate: 9.8, spikeCount: 3623, region: 'A1', time: 0.5 },
  ],
};

const GROUPED_RESPONSE = {
  groups: [
    {
      name: 'V1',
      values: [12.4, 8.7],
      count: 2,
      mean: 10.55,
      median: 10.55,
      std: 1.85,
      min: 8.7,
      max: 12.4,
      q1: 9.6,
      q3: 11.5,
    },
    {
      name: 'V2',
      values: [15.1, 11.3, 14.0, 13.5, 12.0],
      count: 5,
      mean: 13.18,
      median: 13.5,
      std: 1.4,
      min: 11.3,
      max: 15.1,
      q1: 12.0,
      q3: 14.0,
    },
    {
      name: 'A1',
      values: [9.8],
      count: 1,
      mean: 9.8,
      median: 9.8,
      std: 0,
      min: 9.8,
      max: 9.8,
      q1: 9.8,
      q3: 9.8,
    },
  ],
};

const EMPTY_TABLE: TableResponse = {
  columns: [{ key: 'note', label: 'note' }],
  rows: Array.from({ length: 25 }, (_, i) => ({ note: `unique-${i}` })),
};

beforeEach(() => {
  apiFetchMock.mockReset();
  htmlToImageBlob.mockReset();
  apiFetchMock.mockResolvedValue(GROUPED_RESPONSE);
});

describe('QuickPlot — collapse / expand', () => {
  it('renders collapsed by default with a "Quick plot" header', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    const header = screen.getByRole('button', { name: /Quick plot/i });
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/Y axis/i)).toBeNull();
  });

  it('expanding shows the column-first controls (no axis-mode toggle, no Plot button)', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    expect(screen.getByLabelText(/Y axis/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/X axis/i)).toBeInTheDocument();
    expect(screen.queryByText(/Axis mode/i)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Plot$/i }),
    ).toBeNull();
  });
});

describe('QuickPlot — empty state', () => {
  it('renders the no-plottable-columns empty state for a degenerate table', () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={EMPTY_TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    expect(
      screen.getByTestId('quickplot-empty-no-columns'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Y axis/i)).toBeNull();
  });
});

describe('QuickPlot — primary suggestion auto-applies on first expand', () => {
  it('auto-seeds the controls from the deterministic primary suggestion', async () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));

    await waitFor(() => {
      const yPicker = screen.getByLabelText(/Y axis/i) as HTMLSelectElement;
      expect(yPicker.value).toBe('firingRate');
    });
    // categoricalCols are walked in column-declaration order; `subject`
    // appears before `region` in the fixture, so it wins the
    // groupableCat slot.
    const xPicker = screen.getByLabelText(/X axis/i) as HTMLSelectElement;
    expect(xPicker.value).toBe('subject');
    expect(
      screen.getByRole('radio', { name: 'Violin' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('fires the distribution mutation for the auto-seeded violin', async () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
    const [path, init] = apiFetchMock.mock.calls[0]!;
    expect(path).toBe('/api/visualize/distribution');
    expect((init as { body: unknown }).body).toMatchObject({
      datasetId: 'd1',
      className: 'subject',
      field: 'firingRate',
      groupBy: 'subject',
    });
  });
});

describe('QuickPlot — column changes trigger re-inference', () => {
  it('changing X to a numeric time-shaped column flips the chip row to scatter/line', async () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Y axis/i)).toHaveValue('firingRate'),
    );

    fireEvent.change(screen.getByLabelText(/X axis/i), {
      target: { value: 'time' },
    });

    await waitFor(() => {
      expect(
        screen.getByRole('radio', { name: 'Line' }),
      ).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.queryByRole('radio', { name: 'Violin' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Scatter' })).toBeInTheDocument();
  });
});

describe('QuickPlot — chip override', () => {
  it('clicking a non-active chip flips the plot type within the family', async () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Violin' }),
      ).toHaveAttribute('aria-checked', 'true'),
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Box' }));

    expect(
      screen.getByRole('radio', { name: 'Box' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('radio', { name: 'Violin' }),
    ).toHaveAttribute('aria-checked', 'false');
  });
});

describe('QuickPlot — secondary suggestions', () => {
  it('renders secondary suggestion chips below the plot', async () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    await waitFor(() =>
      expect(
        screen.getByTestId('quickplot-secondary-suggestions'),
      ).toBeInTheDocument(),
    );
    const buttons = screen
      .getByTestId('quickplot-secondary-suggestions')
      .querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a secondary suggestion re-seeds the controls', async () => {
    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    await waitFor(() =>
      expect(
        screen.getByTestId('quickplot-secondary-suggestions'),
      ).toBeInTheDocument(),
    );

    const suggestionsBlock = screen.getByTestId(
      'quickplot-secondary-suggestions',
    );
    const firstSuggestion = suggestionsBlock.querySelector('button');
    expect(firstSuggestion).toBeTruthy();
    fireEvent.click(firstSuggestion!);

    await waitFor(() => {
      const yPicker = screen.getByLabelText(/Y axis/i) as HTMLSelectElement;
      expect(['spikeCount', 'firingRate']).toContain(yPicker.value);
    });
  });
});

describe('QuickPlot — Copy Python', () => {
  it('writes the matplotlib snippet for the current view to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalled(),
    );

    const button = await screen.findByTestId('quickplot-copy-python');
    fireEvent.click(button);

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const code = writeText.mock.calls[0]![0] as string;
    expect(code).toContain('ax.violinplot');
    expect(code).toContain('"firingRate"');
    expect(code).toContain('"subject"');
  });
});

describe('QuickPlot — Copy PNG', () => {
  afterEach(() => {
    Object.defineProperty(window, 'ClipboardItem', {
      value: undefined,
      configurable: true,
    });
  });

  it('lazy-imports html-to-image and writes a ClipboardItem to the clipboard', async () => {
    const fakeBlob = new Blob(['fake-png'], { type: 'image/png' });
    htmlToImageBlob.mockResolvedValue(fakeBlob);

    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { write },
      configurable: true,
    });
    Object.defineProperty(window, 'ClipboardItem', {
      value: class {
        constructor(readonly items: Record<string, Blob>) {}
      },
      configurable: true,
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <QuickPlot datasetId="d1" className="subject" table={TABLE} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Quick plot/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());

    const button = await screen.findByTestId('quickplot-copy-png');
    fireEvent.click(button);

    await waitFor(() => {
      expect(htmlToImageBlob).toHaveBeenCalled();
      expect(write).toHaveBeenCalled();
    });
  });
});

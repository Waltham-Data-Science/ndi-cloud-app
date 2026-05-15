/**
 * Stream 6.1 — chart-fence dispatcher tests for Markdown.tsx.
 *
 * The chat UI parses chart-fence code blocks (```signal-chart,
 * ```violin-chart, ```gantt-chart, ```image-chart, ```spike-raster,
 * ```isi-histogram, ```psth-chart) emitted by the LLM and mounts the
 * corresponding chart component in place. Any regression in fence-kind
 * routing would render raw JSON in the chat. This suite locks the
 * dispatcher behavior:
 *
 *   1. Each known fence kind renders its component with the parsed JSON
 *      payload.
 *   2. Unknown fence kinds fall through to the default `<pre><code>`
 *      render — no crash, no chart.
 *   3. Malformed JSON falls through to the default render.
 *   4. The "### Sources" h3 is suppressed (rendered by SourcesPanel).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock each chart component so the test never touches Plotly /
// uPlot. We assert dispatch by data-testid; the test isn't responsible
// for verifying chart internals.
vi.mock('@/components/ndi/charts/SignalChart', () => ({
  SignalChart: (props: { datasetId: string; docId: string }) => (
    <div data-testid="signal-chart-rendered">
      {props.datasetId}:{props.docId}
    </div>
  ),
}));
vi.mock('@/components/ndi/charts/ViolinChart', () => ({
  ViolinChart: (props: { datasetId: string; variableNameContains: string }) => (
    <div data-testid="violin-chart-rendered">
      {props.datasetId}:{props.variableNameContains}
    </div>
  ),
}));
vi.mock('@/components/ndi/charts/GanttChart', () => ({
  GanttChart: (props: { datasetId: string }) => (
    <div data-testid="gantt-chart-rendered">{props.datasetId}</div>
  ),
}));
vi.mock('@/components/ndi/charts/ImageChart', () => ({
  ImageChart: (props: { datasetId: string; docId: string }) => (
    <div data-testid="image-chart-rendered">
      {props.datasetId}:{props.docId}
    </div>
  ),
}));
vi.mock('@/components/ndi/charts/SpikeRaster', () => ({
  SpikeRaster: (props: { datasetId?: string }) => (
    <div data-testid="spike-raster-rendered">{props.datasetId ?? ''}</div>
  ),
}));
vi.mock('@/components/ndi/charts/IsiHistogram', () => ({
  IsiHistogram: (props: { datasetId?: string }) => (
    <div data-testid="isi-histogram-rendered">{props.datasetId ?? ''}</div>
  ),
}));
vi.mock('@/components/ndi/charts/PsthChart', () => ({
  PsthChart: (props: { datasetId: string }) => (
    <div data-testid="psth-chart-rendered">{props.datasetId}</div>
  ),
}));

// Stub CitationChip + SourcesPanel — not under test here, and they
// require references parsing that's covered elsewhere.
vi.mock('@/components/ai/CitationChip', () => ({
  CitationChip: ({ number }: { number: number }) => (
    <span data-testid={`citation-${number}`}>[^{number}]</span>
  ),
}));
vi.mock('@/components/ai/SourcesPanel', () => ({
  SourcesPanel: () => <div data-testid="sources-panel" />,
}));

import { Markdown } from '@/components/ai/Markdown';

function fence(lang: string, body: object): string {
  return `Some prose.\n\n\`\`\`${lang}\n${JSON.stringify(body)}\n\`\`\``;
}

describe('Markdown chart-fence dispatcher', () => {
  it('renders SignalChart for a signal-chart fence', () => {
    render(
      <Markdown
        content={fence('signal-chart', {
          datasetId: 'ds1',
          docId: 'doc1',
          downsample: 2000,
        })}
      />,
    );
    const chart = screen.getByTestId('signal-chart-rendered');
    expect(chart).toHaveTextContent('ds1:doc1');
  });

  it('renders ViolinChart for a violin-chart fence', () => {
    render(
      <Markdown
        content={fence('violin-chart', {
          datasetId: 'ds1',
          variableNameContains: 'ElevatedPlusMaze',
          groupBy: 'Treatment',
        })}
      />,
    );
    expect(screen.getByTestId('violin-chart-rendered')).toHaveTextContent(
      'ds1:ElevatedPlusMaze',
    );
  });

  it('renders GanttChart for a gantt-chart fence', () => {
    render(
      <Markdown
        content={fence('gantt-chart', {
          datasetId: 'ds1',
          items: [{ subject: 's1', treatment: 'Saline', start: 0, end: 1 }],
        })}
      />,
    );
    expect(screen.getByTestId('gantt-chart-rendered')).toHaveTextContent('ds1');
  });

  it('renders ImageChart for an image-chart fence', () => {
    render(
      <Markdown
        content={fence('image-chart', {
          datasetId: 'ds1',
          docId: 'docX',
          frame: 0,
        })}
      />,
    );
    expect(screen.getByTestId('image-chart-rendered')).toHaveTextContent(
      'ds1:docX',
    );
  });

  it('renders SpikeRaster for a spike-raster fence with units', () => {
    render(
      <Markdown
        content={fence('spike-raster', {
          datasetId: 'ds1',
          units: [{ name: 'Unit 1', spikeTimes: [0.1, 0.2] }],
        })}
      />,
    );
    expect(screen.getByTestId('spike-raster-rendered')).toBeInTheDocument();
  });

  it('renders IsiHistogram for an isi-histogram fence with intervals', () => {
    render(
      <Markdown
        content={fence('isi-histogram', {
          datasetId: 'ds1',
          intervals: [0.01, 0.02, 0.015],
        })}
      />,
    );
    expect(screen.getByTestId('isi-histogram-rendered')).toBeInTheDocument();
  });

  it('renders PsthChart for a psth-chart fence', () => {
    render(
      <Markdown
        content={fence('psth-chart', {
          datasetId: 'ds1',
          binCenters: [-0.4, -0.2, 0, 0.2, 0.4],
          counts: [1, 2, 5, 3, 1],
          meanRateHz: [0.5, 1, 2.5, 1.5, 0.5],
          binSizeMs: 20,
          t0: -0.5,
          t1: 0.5,
          unitName: 'Unit 1',
        })}
      />,
    );
    expect(screen.getByTestId('psth-chart-rendered')).toHaveTextContent('ds1');
  });

  it('falls back to a pre/code block on an unknown fence kind', () => {
    render(
      <Markdown
        content={fence('unknown-chart', { foo: 'bar' })}
      />,
    );
    // Unknown fence renders as a default <pre><code> — no chart mounts.
    expect(screen.queryByTestId('signal-chart-rendered')).not.toBeInTheDocument();
    expect(screen.queryByTestId('violin-chart-rendered')).not.toBeInTheDocument();
    expect(screen.queryByTestId('psth-chart-rendered')).not.toBeInTheDocument();
    // The fence body should still be visible as text.
    expect(screen.getByText(/foo/)).toBeInTheDocument();
  });

  it('falls back to default render on malformed JSON in a known fence', () => {
    const content = 'Prose.\n\n```signal-chart\n{ not valid json }\n```';
    render(<Markdown content={content} />);
    expect(screen.queryByTestId('signal-chart-rendered')).not.toBeInTheDocument();
    expect(screen.getByText(/not valid json/)).toBeInTheDocument();
  });

  it('returns null parse on a chart fence missing required props', () => {
    // signal-chart REQUIRES datasetId + docId — omit docId.
    const content =
      'Prose.\n\n```signal-chart\n{ "datasetId": "ds1" }\n```';
    render(<Markdown content={content} />);
    expect(screen.queryByTestId('signal-chart-rendered')).not.toBeInTheDocument();
  });

  it('suppresses the "### Sources" h3 the LLM emits (rendered by SourcesPanel)', () => {
    render(
      <Markdown
        content={
          'Some prose.\n\n### Sources\n[^1]: [Title](/datasets/ds1) — dataset'
        }
      />,
    );
    // The h3 with text "Sources" is suppressed in favor of SourcesPanel.
    expect(
      screen.queryByRole('heading', { level: 3, name: 'Sources' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('sources-panel')).toBeInTheDocument();
  });

});

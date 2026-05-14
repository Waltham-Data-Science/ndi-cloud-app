/**
 * MultiTraceChart — unit tests for the new multi-channel renderer
 * used by SignalChart for >1-channel signal responses + the optional
 * vertical colorbar overlay.
 *
 * The uPlot constructor is mocked at the module level so the test
 * never instantiates real canvas / DOM-measuring code. We assert on:
 *   - color-ramp picking logic (sequential vs. categorical)
 *   - per-channel name + color in the overlay legend
 *   - colorbar rendering when the prop is set
 *   - uPlot is asked to create N+1 series (1 axis + N channels)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the uPlot constructor at the module level. The default export
// from `uplot` is a class; we replace it with a vi.fn that captures
// the args so tests can inspect the series + scales config the
// component passed in. Returns a stub instance with the minimum API
// the component touches (`destroy` + `setSize`).
//
// `vi.mock` is hoisted by vitest to the top of the file, so its
// factory cannot reference top-level vars. We use `vi.hoisted` to
// declare the shared instance-capture array + constructor stub in
// the hoisted scope, then re-export them for the tests to read.
const { uplotInstances, uplotCtor } = vi.hoisted(() => {
  const insts: Array<{
    opts: unknown;
    data: unknown;
    destroy: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
  }> = [];
  // The component calls `new uPlot(opts, data, container)` — vi.fn
  // alone isn't a real constructor, so we wrap it in a small class
  // whose own constructor records every call into the shared array.
  // Tests inspect `uplotInstances[i].opts` for series + colors.
  class UplotStub {
    opts: unknown;
    data: unknown;
    destroy: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    constructor(opts: unknown, data: unknown) {
      this.opts = opts;
      this.data = data;
      this.destroy = vi.fn();
      this.setSize = vi.fn();
      insts.push(this);
    }
  }
  return { uplotInstances: insts, uplotCtor: UplotStub };
});

vi.mock('uplot', () => ({
  default: uplotCtor,
}));
// uPlot's CSS import — stub so the vite-transformer doesn't choke.
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

import {
  MultiTraceChart,
  pickColorAssignment,
  parseChannelNumeric,
  viridisColor,
  plasmaColor,
  coolWarmColor,
} from '@/components/ai/MultiTraceChart';

const fixture3Numeric = {
  channels: {
    'voltage_+10pA': [1, 2, 3, 4],
    'voltage_+20pA': [2, 3, 4, 5],
    'voltage_+30pA': [3, 4, 5, 6],
  },
  timestamps: [0, 0.001, 0.002, 0.003],
  sample_count: 4,
  format: 'nbf',
  error: null,
};

const fixtureCategorical = {
  channels: {
    voltage: [1, 2, 3, 4],
    current: [5, 6, 7, 8],
    stimulus: [0, 0, 1, 1],
  },
  timestamps: [0, 0.001, 0.002, 0.003],
  sample_count: 4,
  format: 'nbf',
  error: null,
};

describe('parseChannelNumeric', () => {
  it('parses ch0, ch1, ch2 → 0, 1, 2', () => {
    expect(parseChannelNumeric('ch0')).toBe(0);
    expect(parseChannelNumeric('ch1')).toBe(1);
    expect(parseChannelNumeric('ch12')).toBe(12);
  });

  it('parses signed-magnitude tags like voltage_+10pA, -20pA', () => {
    expect(parseChannelNumeric('voltage_+10pA')).toBe(10);
    expect(parseChannelNumeric('-20pA')).toBe(-20);
    expect(parseChannelNumeric('step_+5.5_pA')).toBe(5.5);
  });

  it('returns null for purely categorical names', () => {
    expect(parseChannelNumeric('voltage')).toBeNull();
    expect(parseChannelNumeric('current')).toBeNull();
    expect(parseChannelNumeric('stimulus')).toBeNull();
  });
});

describe('pickColorAssignment', () => {
  it('returns a sequential viridis ramp when all channels parse numerically', () => {
    const result = pickColorAssignment(
      ['voltage_+10pA', 'voltage_+20pA', 'voltage_+30pA'],
      'viridis',
    );
    expect(result.kind).toBe('sequential');
    expect(result.colors).toHaveLength(3);
    // First color = viridis(0) (min), last = viridis(1) (max).
    expect(result.colors[0]).toBe(viridisColor(0));
    expect(result.colors[2]).toBe(viridisColor(1));
  });

  it('returns a categorical palette when channel names are non-numeric', () => {
    const result = pickColorAssignment(
      ['voltage', 'current', 'stimulus'],
      'viridis',
    );
    expect(result.kind).toBe('categorical');
    // Each channel gets a distinct categorical color from the
    // PALETTE — verify pair-wise distinctness.
    expect(new Set(result.colors).size).toBe(3);
  });

  it('falls back to categorical for a single channel even when numeric', () => {
    // A 1-channel "sequential" ramp is degenerate (min === max);
    // categorical avoids dividing by zero and gives a sensible
    // single-color result.
    const result = pickColorAssignment(['ch0'], 'viridis');
    expect(result.kind).toBe('categorical');
    expect(result.colors).toHaveLength(1);
  });

  it('honors the scale prop — plasma vs. viridis vs. cool-warm', () => {
    const v = pickColorAssignment(['+10', '+20', '+30'], 'viridis');
    const p = pickColorAssignment(['+10', '+20', '+30'], 'plasma');
    const c = pickColorAssignment(['+10', '+20', '+30'], 'cool-warm');
    // Different colormaps → different RGB at t=0.5 by construction.
    expect(v.colors).not.toEqual(p.colors);
    expect(v.colors).not.toEqual(c.colors);
    expect(p.colors).not.toEqual(c.colors);
  });
});

describe('colormap functions', () => {
  it('viridis ramps from dark-purple to bright-yellow', () => {
    const lo = viridisColor(0);
    const hi = viridisColor(1);
    expect(lo).toMatch(/^rgb\(/);
    expect(hi).toMatch(/^rgb\(/);
    expect(lo).not.toEqual(hi);
  });

  it('all colormaps clamp out-of-range t to [0,1]', () => {
    expect(viridisColor(-1)).toBe(viridisColor(0));
    expect(viridisColor(2)).toBe(viridisColor(1));
    expect(plasmaColor(-0.5)).toBe(plasmaColor(0));
    expect(coolWarmColor(99)).toBe(coolWarmColor(1));
  });

  it('cool-warm is diverging — t=0.5 is the white-ish midpoint', () => {
    // Midpoint of a diverging map should have all RGB components
    // near 255 (white-ish anchor); explicit threshold gives 245+.
    const mid = coolWarmColor(0.5);
    const match = mid.match(/rgb\((\d+),(\d+),(\d+)\)/);
    expect(match).toBeTruthy();
    const r = Number(match![1]);
    const g = Number(match![2]);
    const b = Number(match![3]);
    expect(r).toBeGreaterThanOrEqual(240);
    expect(g).toBeGreaterThanOrEqual(240);
    expect(b).toBeGreaterThanOrEqual(240);
  });
});

describe('MultiTraceChart', () => {
  beforeEach(() => {
    uplotInstances.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a uPlot with N+1 series (1 x-axis + N channels) for multi-channel data', () => {
    render(<MultiTraceChart data={fixture3Numeric} />);
    expect(uplotInstances).toHaveLength(1);
    const opts = uplotInstances[0]!.opts as { series: Array<{ label: string }> };
    // 1 x-axis "series" entry + 3 channels = 4 series.
    expect(opts.series).toHaveLength(4);
    expect(opts.series[1]!.label).toBe('voltage_+10pA');
    expect(opts.series[2]!.label).toBe('voltage_+20pA');
    expect(opts.series[3]!.label).toBe('voltage_+30pA');
  });

  it('assigns distinct colors per channel (sequential viridis for numeric names)', () => {
    render(<MultiTraceChart data={fixture3Numeric} />);
    const opts = uplotInstances[0]!.opts as {
      series: Array<{ stroke?: string }>;
    };
    const strokes = opts.series.slice(1).map((s) => s.stroke);
    // 3 distinct colors.
    expect(new Set(strokes).size).toBe(3);
    // First = viridis(0), last = viridis(1).
    expect(strokes[0]).toBe(viridisColor(0));
    expect(strokes[2]).toBe(viridisColor(1));
  });

  it('assigns categorical palette colors when channel names are non-numeric', () => {
    render(<MultiTraceChart data={fixtureCategorical} />);
    const opts = uplotInstances[0]!.opts as {
      series: Array<{ stroke?: string }>;
    };
    const strokes = opts.series.slice(1).map((s) => s.stroke);
    expect(new Set(strokes).size).toBe(3);
    // None of the categorical strokes should match viridis(0/0.5/1).
    expect(strokes).not.toContain(viridisColor(0));
    expect(strokes).not.toContain(viridisColor(1));
  });

  it('renders an overlay legend with each channel name + color swatch', () => {
    render(<MultiTraceChart data={fixture3Numeric} />);
    const legend = screen.getByTestId('multitrace-legend');
    // Each channel name appears verbatim in the legend so screen
    // readers + hover-search both work.
    expect(legend).toHaveTextContent('voltage_+10pA');
    expect(legend).toHaveTextContent('voltage_+20pA');
    expect(legend).toHaveTextContent('voltage_+30pA');
    // Each row has a data-channel-name attribute for DOM-targeting.
    expect(legend.querySelector('[data-channel-name="voltage_+10pA"]')).toBeTruthy();
    expect(legend.querySelector('[data-channel-name="voltage_+30pA"]')).toBeTruthy();
  });

  it('renders the colorbar element when the colorbar prop is set', () => {
    render(
      <MultiTraceChart
        data={fixture3Numeric}
        colorbar={{
          label: 'Injection (pA)',
          min: 10,
          max: 30,
          scale: 'viridis',
        }}
      />,
    );
    expect(screen.getByTestId('multitrace-colorbar')).toBeInTheDocument();
    expect(screen.getByTestId('colorbar-label')).toHaveTextContent(
      'Injection (pA)',
    );
    expect(screen.getByTestId('colorbar-min')).toHaveTextContent('10');
    expect(screen.getByTestId('colorbar-max')).toHaveTextContent('30');
  });

  it('does NOT render a colorbar when the prop is omitted', () => {
    render(<MultiTraceChart data={fixture3Numeric} />);
    expect(screen.queryByTestId('multitrace-colorbar')).not.toBeInTheDocument();
  });

  it('exposes channel names via data-channel-name DOM attributes for hover/test access', () => {
    // The hover tooltip is uPlot's built-in legend.live which we
    // can't drive without a real canvas, but channel names being
    // accessible via the DOM is the contract callers depend on.
    render(<MultiTraceChart data={fixture3Numeric} />);
    const nodes = document.querySelectorAll('[data-channel-name]');
    expect(nodes).toHaveLength(3);
    const names = Array.from(nodes).map((n) =>
      n.getAttribute('data-channel-name'),
    );
    expect(names).toEqual([
      'voltage_+10pA',
      'voltage_+20pA',
      'voltage_+30pA',
    ]);
  });

  it('still renders the metadata footer (sample count + channel count + format)', () => {
    render(<MultiTraceChart data={fixture3Numeric} />);
    // Text nodes are split across React fragments in the rendered
    // output, so we use a normalized-text matcher to assert the
    // visual content. The `nbf` format renders with CSS uppercase
    // (we don't transform the string itself).
    const root = document.body;
    expect(root.textContent).toMatch(/4 samples/);
    expect(root.textContent).toMatch(/3 channels/);
    expect(root.textContent).toMatch(/nbf/i);
  });
});

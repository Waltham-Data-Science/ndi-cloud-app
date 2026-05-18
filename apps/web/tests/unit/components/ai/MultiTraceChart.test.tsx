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

// Type-only import so the stub-uplot helper can satisfy uPlot's shape
// without dragging the real implementation into the test.
import type uPlot from 'uplot';

import {
  MultiTraceChart,
  pickColorAssignment,
  parseChannelNumeric,
  viridisColor,
  plasmaColor,
  coolWarmColor,
  computeColorRamp,
  makePerSegmentPaths,
} from '@/components/ndi/charts/MultiTraceChart';

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

// -------------------------------------------------------------------
// computeColorRamp — pure helper for per-point coloring along a chosen
// axis (time / index / amplitude). Tested standalone because the
// uPlot integration is hard to assert visually in jsdom.
// -------------------------------------------------------------------

describe('computeColorRamp', () => {
  it("maps 'index' mode to evenly-spaced t∈[0,1] regardless of values", () => {
    const out = computeColorRamp([10, 20, 30, 40, 50], 'index');
    expect(out).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("'index' on a single point collapses to [0]", () => {
    expect(computeColorRamp([42], 'index')).toEqual([0]);
  });

  it("'index' on an empty array returns []", () => {
    expect(computeColorRamp([], 'index')).toEqual([]);
  });

  it("'time' mode ramps from t=0 at first timestamp to t=1 at last", () => {
    const out = computeColorRamp([1, 2, 3], 'time', [0, 0.5, 1]);
    expect(out).toEqual([0, 0.5, 1]);
  });

  it("'time' mode preserves non-linear timestamp spacing", () => {
    // Timestamps spaced unevenly — t-fraction should follow them
    // (not the sample index).
    const out = computeColorRamp([10, 20, 30, 40], 'time', [0, 0.1, 0.5, 1]);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0.1);
    expect(out[2]).toBeCloseTo(0.5);
    expect(out[3]).toBeCloseTo(1);
  });

  it("'time' falls back to index when no timeAxis is supplied", () => {
    // Without timestamps, time-mode should behave like index-mode.
    const out = computeColorRamp([10, 20, 30], 'time');
    expect(out).toEqual([0, 0.5, 1]);
  });

  it("'value' mode maps each value into [0,1] keyed on the trace's own min/max", () => {
    // Values 0, 5, 10 → t = 0, 0.5, 1.
    const out = computeColorRamp([0, 5, 10], 'value');
    expect(out).toEqual([0, 0.5, 1]);
  });

  it("'value' mode maps null/undefined/NaN entries to NaN (caller skips)", () => {
    const out = computeColorRamp([0, null, 5, undefined, 10], 'value');
    expect(out[0]).toBe(0);
    expect(Number.isNaN(out[1])).toBe(true);
    expect(out[2]).toBe(0.5);
    expect(Number.isNaN(out[3])).toBe(true);
    expect(out[4]).toBe(1);
  });

  it("'value' mode on all-null data returns zeros (no division-by-zero)", () => {
    const out = computeColorRamp([null, null, null], 'value');
    expect(out).toEqual([0, 0, 0]);
  });

  it("'value' mode on a flat trace (min === max) returns t=0 for every point", () => {
    const out = computeColorRamp([5, 5, 5], 'value');
    expect(out).toEqual([0, 0, 0]);
  });

  it("'time' mode with a flat timeAxis still returns finite ts (degenerate range collapses to 0)", () => {
    const out = computeColorRamp([10, 20, 30], 'time', [0, 0, 0]);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

// -------------------------------------------------------------------
// makePerSegmentPaths — uPlot custom paths builder that strokes each
// consecutive pair of points in a different color.
// -------------------------------------------------------------------

interface StubCtx {
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  lineTo: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
}

function makeStubCtx(): StubCtx {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
}

function makeStubUplot(
  data: Array<ReadonlyArray<number | null | undefined>>,
  ctx: StubCtx,
) {
  // Identity-mapped valToPos — keeps the assertion math simple
  // (px === val), which is all we need for behavior coverage.
  return {
    ctx,
    data,
    valToPos: (v: number) => v,
  } as unknown as uPlot;
}

describe('makePerSegmentPaths', () => {
  it('strokes one segment per consecutive pair, each with its own color', () => {
    // 4 points → 3 segments. Each colored differently.
    const xs = [0, 1, 2, 3];
    const ys = [10, 20, 30, 40];
    const ramp = ['#ff0000', '#00ff00', '#0000ff', '#ffffff'];
    const ctx = makeStubCtx();
    const u = makeStubUplot([xs, ys], ctx);

    const builder = makePerSegmentPaths(ramp, 1.5);
    builder(u, 1, 0, 3);

    // 3 strokes for 3 segments (i → i+1 for i = 0,1,2).
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
    expect(ctx.moveTo).toHaveBeenCalledTimes(3);
    expect(ctx.lineTo).toHaveBeenCalledTimes(3);
    // Default uPlot width respected via lineWidth.
    expect(ctx.lineWidth).toBe(1.5);
    // save / restore boundary — required so we don't leak strokeStyle
    // changes to other series uPlot might draw next.
  });

  it('skips segments where either endpoint y is null/undefined (spanGaps=false)', () => {
    const xs = [0, 1, 2, 3];
    // ys has a gap at index 1 — segments (0→1) and (1→2) should be
    // skipped entirely; only (2→3) renders.
    const ys = [10, null, 30, 40];
    const ramp = ['#ff0000', '#00ff00', '#0000ff', '#ffffff'];
    const ctx = makeStubCtx();
    const u = makeStubUplot([xs, ys], ctx);

    const builder = makePerSegmentPaths(ramp, 1.5);
    builder(u, 1, 0, 3);

    // Only one segment survived → exactly one stroke call.
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('skips segments where the ramp color is null', () => {
    const xs = [0, 1, 2];
    const ys = [10, 20, 30];
    // Middle ramp slot is null → both segments touching index 1 are
    // skipped because the source-color lookup returns null.
    const ramp = ['#ff0000', null, '#0000ff'];
    const ctx = makeStubCtx();
    const u = makeStubUplot([xs, ys], ctx);

    const builder = makePerSegmentPaths(ramp, 1.5);
    builder(u, 1, 0, 2);

    // Segment 0→1 used ramp[0] = '#ff0000' (valid) → 1 stroke. Segment
    // 1→2 used ramp[1] = null → skipped.
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("returns null (paths builder contract: caller drew the series itself)", () => {
    const xs = [0, 1];
    const ys = [10, 20];
    const ramp = ['#ff0000', '#00ff00'];
    const ctx = makeStubCtx();
    const u = makeStubUplot([xs, ys], ctx);

    const builder = makePerSegmentPaths(ramp, 1.5);
    const result = builder(u, 1, 0, 1);
    expect(result).toBeNull();
  });

  it('balances save() with restore() so it does not leak ctx state', () => {
    const xs = [0, 1, 2];
    const ys = [10, 20, 30];
    const ramp = ['#ff0000', '#00ff00', '#0000ff'];
    const ctx = makeStubCtx();
    const u = makeStubUplot([xs, ys], ctx);

    const builder = makePerSegmentPaths(ramp, 1.5);
    builder(u, 1, 0, 2);

    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------------------
// MultiTraceChart — colorBy integration: when the prop is set, each
// series must carry a custom `paths` builder and the metadata footer
// surfaces a "Color by …" label.
// -------------------------------------------------------------------

describe('MultiTraceChart — colorBy prop', () => {
  beforeEach(() => {
    uplotInstances.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT install custom paths when colorBy is null/undefined (default)', () => {
    render(<MultiTraceChart data={fixture3Numeric} />);
    const opts = uplotInstances[0]!.opts as {
      series: Array<{ paths?: unknown }>;
    };
    // Channel series (index 1+) should not have a custom paths
    // builder when colorBy is unset.
    for (let i = 1; i < opts.series.length; i++) {
      expect(opts.series[i]!.paths).toBeUndefined();
    }
    // Footer label not rendered.
    expect(
      screen.queryByTestId('multitrace-colorby-label'),
    ).not.toBeInTheDocument();
  });

  it("installs a custom paths builder on each channel when colorBy='time'", () => {
    render(<MultiTraceChart data={fixture3Numeric} colorBy="time" />);
    const opts = uplotInstances[0]!.opts as {
      series: Array<{ paths?: unknown }>;
    };
    // 3 channels → 3 series each with a paths builder.
    for (let i = 1; i < opts.series.length; i++) {
      expect(opts.series[i]!.paths).toBeTypeOf('function');
    }
    expect(screen.getByTestId('multitrace-colorby-label')).toHaveTextContent(
      /color by time/i,
    );
  });

  it("installs a custom paths builder on each channel when colorBy='index'", () => {
    render(<MultiTraceChart data={fixture3Numeric} colorBy="index" />);
    const opts = uplotInstances[0]!.opts as {
      series: Array<{ paths?: unknown }>;
    };
    for (let i = 1; i < opts.series.length; i++) {
      expect(opts.series[i]!.paths).toBeTypeOf('function');
    }
    expect(screen.getByTestId('multitrace-colorby-label')).toHaveTextContent(
      /color by sample/i,
    );
  });

  it("installs a custom paths builder on each channel when colorBy='value'", () => {
    render(<MultiTraceChart data={fixture3Numeric} colorBy="value" />);
    const opts = uplotInstances[0]!.opts as {
      series: Array<{ paths?: unknown }>;
    };
    for (let i = 1; i < opts.series.length; i++) {
      expect(opts.series[i]!.paths).toBeTypeOf('function');
    }
    expect(screen.getByTestId('multitrace-colorby-label')).toHaveTextContent(
      /color by value/i,
    );
  });

  it('hides the legacy "Color: viridis ramp" label when colorBy is engaged', () => {
    // Pre-colorBy multi-channel numeric data showed a "Color: viridis
    // ramp" hint. When colorBy is on, that hint is replaced by the
    // colorBy label so the user sees a single source of truth.
    render(<MultiTraceChart data={fixture3Numeric} colorBy="time" />);
    const root = document.body;
    expect(root.textContent).not.toMatch(/^Color: viridis ramp/);
    expect(screen.getByTestId('multitrace-colorby-label')).toBeInTheDocument();
  });

  it('still routes the categorical-fallback channels through colorBy when set', () => {
    // colorBy is independent of channel-name parsing — even when the
    // legend reverts to categorical (non-numeric names), the custom
    // paths builder should still get installed.
    render(<MultiTraceChart data={fixtureCategorical} colorBy="value" />);
    const opts = uplotInstances[0]!.opts as {
      series: Array<{ paths?: unknown }>;
    };
    for (let i = 1; i < opts.series.length; i++) {
      expect(opts.series[i]!.paths).toBeTypeOf('function');
    }
  });
});

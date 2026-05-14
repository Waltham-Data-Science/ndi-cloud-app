import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ViolinPlot, type ViolinGroup } from '@/components/ndi/charts/inline/ViolinPlot';

function makeGroup(name: string, n: number, mean: number): ViolinGroup {
  const values = Array.from({ length: n }, (_, i) => mean + (i - n / 2) * 0.5);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)]!;
  const q1 = sorted[Math.floor(n / 4)]!;
  const q3 = sorted[Math.floor((3 * n) / 4)]!;
  return {
    name,
    values,
    count: n,
    mean,
    median,
    std: 1,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    q1,
    q3,
  };
}

describe('ViolinPlot — canonical scientific look (points + IQR + median)', () => {
  it('renders one IQR box per group', () => {
    const groups = [makeGroup('WT', 20, 10), makeGroup('KO', 20, 14)];
    render(<ViolinPlot groups={groups} yLabel="latency" xLabel="strain" />);
    expect(screen.getAllByTestId('violin-iqr-box')).toHaveLength(2);
  });

  it('renders one median dot per group', () => {
    const groups = [makeGroup('WT', 20, 10), makeGroup('KO', 20, 14)];
    render(<ViolinPlot groups={groups} yLabel="latency" xLabel="strain" />);
    expect(screen.getAllByTestId('violin-median-dot')).toHaveLength(2);
  });

  it('renders one jittered-points group per violin group', () => {
    const groups = [makeGroup('WT', 20, 10), makeGroup('KO', 20, 14)];
    render(<ViolinPlot groups={groups} yLabel="latency" xLabel="strain" />);
    expect(screen.getAllByTestId('violin-points')).toHaveLength(2);
  });

  it('still renders points for large groups (no n≤100 suppression)', () => {
    // 250 points per group exceeds the legacy hard cap; make sure the
    // upgraded renderer still emits the points wrapper rather than
    // hiding the dots entirely.
    const groups = [makeGroup('WT', 250, 10)];
    render(<ViolinPlot groups={groups} yLabel="latency" xLabel="strain" />);
    expect(screen.getByTestId('violin-points')).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BoxPlot } from '@/components/app/BoxPlot';
import type { ViolinGroup } from '@/components/app/ViolinPlot';

function makeGroup(name: string, n: number, mean: number): ViolinGroup {
  const values = Array.from({ length: n }, (_, i) => mean + (i - n / 2) * 0.5);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    name,
    values,
    count: n,
    mean,
    median: sorted[Math.floor(n / 2)]!,
    std: 1,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    q1: sorted[Math.floor(n / 4)]!,
    q3: sorted[Math.floor((3 * n) / 4)]!,
  };
}

describe('BoxPlot — jittered points overlay', () => {
  it('renders a points wrapper for each group', () => {
    const groups = [makeGroup('WT', 15, 10), makeGroup('KO', 15, 14)];
    render(<BoxPlot groups={groups} yLabel="latency" xLabel="strain" />);
    expect(screen.getAllByTestId('box-points')).toHaveLength(2);
  });

  it('still renders points for large groups (no n cap)', () => {
    const groups = [makeGroup('WT', 200, 10)];
    render(<BoxPlot groups={groups} yLabel="latency" xLabel="strain" />);
    expect(screen.getByTestId('box-points')).toBeInTheDocument();
  });
});

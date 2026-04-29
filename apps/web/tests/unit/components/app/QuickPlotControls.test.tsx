import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { QuickPlotControls } from '@/components/app/QuickPlotControls';

const numericCols = ['latency', 'age'];
const categoricalCols = ['strain'];

const baseProps = {
  numericCols,
  categoricalCols,
  yField: '',
  xField: '',
  plotType: null,
  onYChange: vi.fn(),
  onXChange: vi.fn(),
  onPlotTypeChange: vi.fn(),
};

describe('QuickPlotControls — column-first column pickers', () => {
  it('Y dropdown surfaces numeric columns only', () => {
    render(<QuickPlotControls {...baseProps} />);
    const yPicker = screen.getByLabelText(/^Y axis/i) as HTMLSelectElement;
    const yOptions = Array.from(yPicker.options).map((o) => o.value);
    expect(yOptions).toContain('latency');
    expect(yOptions).toContain('age');
    expect(yOptions).not.toContain('strain');
  });

  it('X dropdown surfaces both numeric and categorical columns plus a "None" option', () => {
    render(<QuickPlotControls {...baseProps} />);
    const xPicker = screen.getByLabelText(/^X axis/i) as HTMLSelectElement;
    const xOptions = Array.from(xPicker.options).map((o) => o.value);
    expect(xOptions).toContain('');
    expect(xOptions).toContain('latency');
    expect(xOptions).toContain('strain');
  });

  it('does NOT render the chip row when plotType is null', () => {
    render(<QuickPlotControls {...baseProps} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('QuickPlotControls — chip row visibility per inferred type', () => {
  it('renders histogram/violin/box chips when plotType=histogram (solo numeric Y)', () => {
    render(
      <QuickPlotControls
        {...baseProps}
        yField="latency"
        plotType="histogram"
      />,
    );
    const radios = screen
      .getAllByRole('radio')
      .map((el) => el.getAttribute('aria-label'));
    expect(radios).toEqual(
      expect.arrayContaining(['Histogram', 'Violin', 'Box']),
    );
    expect(radios).not.toContain('Scatter');
  });

  it('renders violin/box/histogram chips when plotType=violin (numeric Y x categorical X)', () => {
    render(
      <QuickPlotControls
        {...baseProps}
        yField="latency"
        xField="strain"
        plotType="violin"
      />,
    );
    const radios = screen
      .getAllByRole('radio')
      .map((el) => el.getAttribute('aria-label'));
    expect(radios).toEqual(
      expect.arrayContaining(['Violin', 'Box', 'Histogram']),
    );
  });

  it('renders scatter/line chips when plotType=scatter (numeric x numeric)', () => {
    render(
      <QuickPlotControls
        {...baseProps}
        yField="latency"
        xField="age"
        plotType="scatter"
      />,
    );
    const radios = screen
      .getAllByRole('radio')
      .map((el) => el.getAttribute('aria-label'));
    expect(radios).toEqual(expect.arrayContaining(['Scatter', 'Line']));
    expect(radios).not.toContain('Violin');
  });

  it('renders only the bar-count chip when plotType=bar-count (no Y, categorical X)', () => {
    render(
      <QuickPlotControls
        {...baseProps}
        xField="strain"
        plotType="bar-count"
      />,
    );
    const radios = screen
      .getAllByRole('radio')
      .map((el) => el.getAttribute('aria-label'));
    expect(radios).toEqual(['Bar count']);
  });
});

describe('QuickPlotControls — chip selection', () => {
  it('marks the active plotType chip as aria-checked=true', () => {
    render(
      <QuickPlotControls
        {...baseProps}
        yField="latency"
        plotType="violin"
      />,
    );
    const violinChip = screen.getByRole('radio', { name: 'Violin' });
    const histogramChip = screen.getByRole('radio', { name: 'Histogram' });
    expect(violinChip).toHaveAttribute('aria-checked', 'true');
    expect(histogramChip).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onPlotTypeChange when a non-active chip is clicked', () => {
    const onPlotTypeChange = vi.fn();
    render(
      <QuickPlotControls
        {...baseProps}
        yField="latency"
        plotType="violin"
        onPlotTypeChange={onPlotTypeChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Histogram' }));
    expect(onPlotTypeChange).toHaveBeenCalledWith('histogram');
  });

  it('chip row uses role="radiogroup" for accessibility', () => {
    render(
      <QuickPlotControls
        {...baseProps}
        yField="latency"
        plotType="histogram"
      />,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });
});

describe('QuickPlotControls — column picker callbacks', () => {
  it('calls onYChange when a numeric column is picked', () => {
    const onYChange = vi.fn();
    render(<QuickPlotControls {...baseProps} onYChange={onYChange} />);
    fireEvent.change(screen.getByLabelText(/^Y axis/i), {
      target: { value: 'latency' },
    });
    expect(onYChange).toHaveBeenCalledWith('latency');
  });

  it('calls onXChange when an X column is picked (categorical or numeric)', () => {
    const onXChange = vi.fn();
    render(<QuickPlotControls {...baseProps} onXChange={onXChange} />);
    fireEvent.change(screen.getByLabelText(/^X axis/i), {
      target: { value: 'strain' },
    });
    expect(onXChange).toHaveBeenCalledWith('strain');
  });
});

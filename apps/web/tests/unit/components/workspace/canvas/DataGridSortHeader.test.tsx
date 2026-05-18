/**
 * DataGridSortHeader — sortable column header with arrow indicator.
 *
 * Phase G5 tests. No portal involved, plain button — easy to test.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataGridSortHeader } from '@/components/workspace/canvas/DataGridSortHeader';

describe('DataGridSortHeader — render variants', () => {
  it('renders as a plain label when onCycle is null (non-sortable)', () => {
    render(
      <DataGridSortHeader label="Strain" sort={false} onCycle={null} />,
    );
    expect(screen.getByText('Strain')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders as a button when onCycle is provided', () => {
    render(
      <DataGridSortHeader label="Strain" sort={false} onCycle={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /Strain/i })).toBeInTheDocument();
  });

  it('asc sort: tooltip says "Click for descending"', () => {
    render(
      <DataGridSortHeader label="Date" sort="asc" onCycle={() => {}} />,
    );
    expect(
      screen.getByTitle(/Sorted ascending.*click for descending/i),
    ).toBeInTheDocument();
  });

  it('desc sort: tooltip says "Click to clear sort"', () => {
    render(
      <DataGridSortHeader label="Date" sort="desc" onCycle={() => {}} />,
    );
    expect(
      screen.getByTitle(/Sorted descending.*click to clear/i),
    ).toBeInTheDocument();
  });

  it('unsorted: tooltip says "Click to sort ascending"', () => {
    render(
      <DataGridSortHeader label="Date" sort={false} onCycle={() => {}} />,
    );
    expect(
      screen.getByTitle(/Click to sort ascending/i),
    ).toBeInTheDocument();
  });
});

describe('DataGridSortHeader — interaction', () => {
  it('calls onCycle when clicked', async () => {
    const onCycle = vi.fn();
    const user = userEvent.setup();
    render(
      <DataGridSortHeader label="Date" sort={false} onCycle={onCycle} />,
    );
    await user.click(screen.getByRole('button', { name: /Date/i }));
    expect(onCycle).toHaveBeenCalledTimes(1);
  });
});

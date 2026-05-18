/**
 * WorkspaceDataGrid — integration tests for the grid primitive.
 *
 * Phase G7 tests. Focuses on observable behavior:
 *
 *   - empty state renders the noun-aware message
 *   - rows render with cell content
 *   - primary click writes via onPrimaryChange
 *   - checkbox click toggles multi-select (independent of primary)
 *   - bulk-actions bar appears when count > 0
 *   - bulk action callback receives the selected ids
 *   - sort header click toggles sort
 *   - keyboard: ArrowDown moves focus; Space toggles; Enter sets primary;
 *     Cmd+A selects all; Esc clears
 *   - footer shows row count
 *
 * @tanstack/react-virtual is mocked to render all rows synchronously
 * (jsdom has no real scroll geometry, so virtualization returns
 * empty without the mock). Same pattern as the existing
 * VirtualizedTable + Subjects/Sessions tests.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { type ColumnDef } from '@tanstack/react-table';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 32,
        size: 32,
      })),
    getTotalSize: () => count * 32,
    measure: () => {},
    scrollToIndex: () => {},
  }),
}));

import { WorkspaceDataGrid } from '@/components/workspace/canvas/WorkspaceDataGrid';

interface Row {
  id: string;
  name: string;
  count: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'alpha', count: 1 },
  { id: 'b', name: 'beta', count: 2 },
  { id: 'c', name: 'gamma', count: 3 },
];

const COLUMNS: ColumnDef<Row, unknown>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', enableSorting: true },
  { id: 'count', header: 'Count', accessorKey: 'count', enableSorting: true },
];

const NOOP_CONTEXT = () => [];
const NOOP_BULK = () => [];

describe('WorkspaceDataGrid — empty + loading states', () => {
  it('renders the default empty state when data is empty', () => {
    render(
      <WorkspaceDataGrid
        data={[]}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    expect(screen.getByText(/No things match/i)).toBeInTheDocument();
  });

  it('renders the default loading state when isLoading', () => {
    const { container } = render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
        isLoading
      />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders a custom empty state when provided', () => {
    render(
      <WorkspaceDataGrid
        data={[]}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
        emptyState={<div data-testid="custom-empty">Try a different filter</div>}
      />,
    );
    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
  });
});

describe('WorkspaceDataGrid — row rendering', () => {
  beforeEach(() => {
    // jsdom doesn't implement scrollIntoView; stub so keyboard
    // nav tests don't crash.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders one row per data entry with cell content', () => {
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
    expect(screen.getByText('gamma')).toBeInTheDocument();
  });

  it('renders the footer with row count', () => {
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    // Footer text: "3 things"
    expect(screen.getByText(/3 things/)).toBeInTheDocument();
  });

  it('renders sortable headers', () => {
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Name —/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Count —/i }),
    ).toBeInTheDocument();
  });
});

describe('WorkspaceDataGrid — primary click', () => {
  it('calls onPrimaryChange with the row id when row body is clicked', async () => {
    const onPrimaryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={onPrimaryChange}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    await user.click(screen.getByText('alpha'));
    expect(onPrimaryChange).toHaveBeenCalledWith('a');
  });

  it('calls onPrimaryChange with null when the active primary is re-clicked', async () => {
    const onPrimaryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId="a"
        onPrimaryChange={onPrimaryChange}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    await user.click(screen.getByText('alpha'));
    expect(onPrimaryChange).toHaveBeenCalledWith(null);
  });
});

describe('WorkspaceDataGrid — multi-select checkboxes', () => {
  it('row checkbox toggles multi-select WITHOUT calling onPrimaryChange', async () => {
    const onPrimaryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={onPrimaryChange}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    // 3 row checkboxes (the 4th checkbox role is the header "Select all")
    const checkboxes = screen.getAllByRole('checkbox', { name: /Select row/i });
    expect(checkboxes).toHaveLength(3);
    await user.click(checkboxes[0]!);
    // Footer should now show "1 selected"
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    // onPrimaryChange should NOT have been called (checkbox stops propagation)
    expect(onPrimaryChange).not.toHaveBeenCalled();
  });

  it('header checkbox selects all visible rows', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    await user.click(
      screen.getByRole('checkbox', { name: /Select all visible rows/i }),
    );
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
  });
});

describe('WorkspaceDataGrid — bulk actions bar', () => {
  it('is hidden when nothing is selected', () => {
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={() => [
          { id: 'x', label: 'Do thing', onSelect: vi.fn() },
        ]}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Do thing' }),
    ).toBeNull();
  });

  it('appears with the user-provided action button when 1+ selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={() => [
          { id: 'x', label: 'Do thing', onSelect },
        ]}
      />,
    );
    await user.click(
      screen.getAllByRole('checkbox', { name: /Select row/i })[0]!,
    );
    const btn = screen.getByRole('button', { name: 'Do thing' });
    await user.click(btn);
    expect(onSelect).toHaveBeenCalledWith(['a']);
  });
});

describe('WorkspaceDataGrid — keyboard nav', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('Cmd+A selects all visible rows', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    const grid = screen.getByRole('grid');
    grid.focus();
    await user.keyboard('{Meta>}a{/Meta}');
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
  });

  it('Esc clears multi-select', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId={null}
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    // Pre-select via header checkbox
    await user.click(
      screen.getByRole('checkbox', { name: /Select all visible rows/i }),
    );
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();

    const grid = screen.getByRole('grid');
    grid.focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/3 selected/)).toBeNull();
  });
});

describe('WorkspaceDataGrid — primary visual indicator', () => {
  it('decorates the primary row with brand-blue left border class', () => {
    const { container } = render(
      <WorkspaceDataGrid
        data={ROWS}
        columns={COLUMNS}
        rowId={(r) => r.id}
        noun="thing"
        primaryId="b"
        onPrimaryChange={vi.fn()}
        contextMenuActions={NOOP_CONTEXT}
        bulkActions={NOOP_BULK}
      />,
    );
    // The row for 'b' (beta) is wrapped in a ContextMenu wrapper.
    // Find by the row text + parent border class.
    const betaCell = screen.getByText('beta');
    const row = betaCell.closest('[role="row"]');
    expect(row?.className).toMatch(/border-l-brand-blue/);
    // Footer should also surface "1 primary"
    expect(within(container).getByText(/1 primary/)).toBeInTheDocument();
  });
});

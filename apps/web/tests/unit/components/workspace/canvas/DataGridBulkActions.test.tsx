/**
 * DataGridBulkActions — sticky bar that surfaces on multi-select.
 *
 * Phase G6 tests. Easy — no portal, just JSX + click handlers.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sparkles, Copy } from 'lucide-react';

import {
  DataGridBulkActions,
  type BulkAction,
} from '@/components/workspace/canvas/DataGridBulkActions';

const ACTIONS: BulkAction[] = [
  {
    id: 'copy',
    label: 'Copy IDs',
    icon: Copy,
    onSelect: vi.fn(),
  },
  {
    id: 'ask',
    label: 'Ask Claude',
    icon: Sparkles,
    variant: 'primary',
    onSelect: vi.fn(),
  },
];

describe('DataGridBulkActions — visibility', () => {
  it('renders nothing when no rows are selected', () => {
    const { container } = render(
      <DataGridBulkActions
        selectedIds={[]}
        noun="subject"
        actions={ACTIONS}
        onClear={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('mounts when 1+ row is selected', () => {
    render(
      <DataGridBulkActions
        selectedIds={['a']}
        noun="subject"
        actions={ACTIONS}
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole('region', { name: /1 subject selected/i }))
      .toBeInTheDocument();
  });
});

describe('DataGridBulkActions — copy', () => {
  it('singular noun for count=1', () => {
    render(
      <DataGridBulkActions
        selectedIds={['a']}
        noun="subject"
        actions={[]}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('1 subject')).toBeInTheDocument();
  });

  it('plural noun for count>1 (appends "s")', () => {
    render(
      <DataGridBulkActions
        selectedIds={['a', 'b', 'c']}
        noun="subject"
        actions={[]}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText('3 subjects')).toBeInTheDocument();
  });
});

describe('DataGridBulkActions — actions', () => {
  it('renders each action button', () => {
    render(
      <DataGridBulkActions
        selectedIds={['a', 'b']}
        noun="subject"
        actions={ACTIONS}
        onClear={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Copy IDs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Ask Claude/i }),
    ).toBeInTheDocument();
  });

  it('calls action.onSelect with the selected ids', async () => {
    const onSelect = vi.fn();
    const actions: BulkAction[] = [
      { id: 'x', label: 'Do thing', onSelect },
    ];
    const user = userEvent.setup();
    render(
      <DataGridBulkActions
        selectedIds={['a', 'b', 'c']}
        noun="subject"
        actions={actions}
        onClear={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Do thing' }));
    expect(onSelect).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('disables the button when action.disabled is true', () => {
    const actions: BulkAction[] = [
      { id: 'x', label: 'Coming soon', onSelect: () => {}, disabled: true },
    ];
    render(
      <DataGridBulkActions
        selectedIds={['a']}
        noun="subject"
        actions={actions}
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Coming soon' })).toBeDisabled();
  });
});

describe('DataGridBulkActions — clear', () => {
  it('renders a Clear button with aria-label', () => {
    render(
      <DataGridBulkActions
        selectedIds={['a']}
        noun="subject"
        actions={[]}
        onClear={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Clear selection/i }),
    ).toBeInTheDocument();
  });

  it('calls onClear when the X button is clicked', async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <DataGridBulkActions
        selectedIds={['a']}
        noun="subject"
        actions={[]}
        onClear={onClear}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Clear selection/i }));
    expect(onClear).toHaveBeenCalled();
  });
});

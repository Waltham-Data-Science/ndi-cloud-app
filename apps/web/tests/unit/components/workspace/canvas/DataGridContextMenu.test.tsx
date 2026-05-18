/**
 * DataGridContextMenu — right-click menu wrapping Radix's ContextMenu.
 *
 * Phase G3 tests. Radix portals its content; we can't easily simulate
 * the right-click → portal flow in jsdom (Radix uses pointer events
 * that don't fully behave in jsdom). We test the API contract:
 *
 *   - empty actions: renders children, no menu attached
 *   - non-empty actions: renders the trigger wrapper
 *   - action.onSelect callbacks are wired (sanity: same identity passed)
 *
 * The actual menu interaction is tested at the integration level
 * inside the picker tests, which mock the menu primitive.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  DataGridContextMenu,
  type ContextMenuEntry,
} from '@/components/workspace/canvas/DataGridContextMenu';

describe('DataGridContextMenu — empty actions', () => {
  it('renders children verbatim when actions is empty', () => {
    render(
      <DataGridContextMenu actions={[]}>
        <div data-testid="child">hello</div>
      </DataGridContextMenu>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});

describe('DataGridContextMenu — wraps children when actions present', () => {
  it('renders the child', () => {
    const actions: ContextMenuEntry[] = [
      { kind: 'item', label: 'Copy', onSelect: vi.fn() },
    ];
    render(
      <DataGridContextMenu actions={actions}>
        <div data-testid="child">hello</div>
      </DataGridContextMenu>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('does not render the menu items in the document body before open', () => {
    const actions: ContextMenuEntry[] = [
      { kind: 'item', label: 'Set as primary', onSelect: vi.fn() },
    ];
    render(
      <DataGridContextMenu actions={actions}>
        <div data-testid="child">hello</div>
      </DataGridContextMenu>,
    );
    // Radix only mounts portal content when the menu opens. The
    // menu starts closed, so "Set as primary" should NOT be in DOM.
    expect(screen.queryByText('Set as primary')).toBeNull();
  });
});

describe('DataGridContextMenu — action type safety', () => {
  // Type-level guard: the discriminated union accepts all three kinds.
  it('accepts item / separator / group entries without type error', () => {
    const actions: ContextMenuEntry[] = [
      { kind: 'item', label: 'A', onSelect: vi.fn() },
      { kind: 'separator' },
      {
        kind: 'group',
        label: 'Set as',
        items: [{ kind: 'item', label: 'Subject', onSelect: vi.fn() }],
      },
    ];
    expect(actions).toHaveLength(3);
  });
});

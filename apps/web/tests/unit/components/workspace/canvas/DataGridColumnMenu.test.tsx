/**
 * DataGridColumnMenu — column visibility + density dropdown wrapping
 * Radix's DropdownMenu.
 *
 * Phase G4 tests. Same approach as DataGridContextMenu — Radix
 * portals + pointer events don't behave fully in jsdom, so we test
 * the API contract:
 *
 *   - renders the trigger button (aria-label)
 *   - menu items don't appear in DOM until trigger is opened
 *   - props pass through (density value, columns)
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  DataGridColumnMenu,
  type ColumnVisibility,
} from '@/components/workspace/canvas/DataGridColumnMenu';

const COLUMNS: ColumnVisibility[] = [
  { id: 'identifier', label: 'Subject', visible: true, onToggle: () => {}, locked: true },
  { id: 'species', label: 'Species', visible: true, onToggle: () => {} },
  { id: 'age', label: 'Age', visible: false, onToggle: () => {} },
];

describe('DataGridColumnMenu — trigger', () => {
  it('renders the settings trigger button', () => {
    render(
      <DataGridColumnMenu
        columns={COLUMNS}
        density="compact"
        onDensityChange={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Column and density settings/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render menu items before the trigger is opened (Radix portal)', () => {
    render(
      <DataGridColumnMenu
        columns={COLUMNS}
        density="compact"
        onDensityChange={() => {}}
      />,
    );
    // The Species checkbox lives in the Portal content; it's not in
    // the document until the menu opens. Same shape as the context
    // menu's portal behavior.
    expect(screen.queryByText('Species')).toBeNull();
    expect(screen.queryByText('Density')).toBeNull();
  });
});

describe('DataGridColumnMenu — props pass through', () => {
  it('accepts an empty columns list without crashing', () => {
    render(
      <DataGridColumnMenu
        columns={[]}
        density="comfortable"
        onDensityChange={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Column and density settings/i }),
    ).toBeInTheDocument();
  });

  it('renders the optional onReset trigger when provided', () => {
    // Doesn't actually verify the "Reset" item is visible (portal'd),
    // but ensures the prop doesn't break the trigger render.
    render(
      <DataGridColumnMenu
        columns={COLUMNS}
        density="compact"
        onDensityChange={() => {}}
        onReset={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Column and density settings/i }),
    ).toBeInTheDocument();
  });
});

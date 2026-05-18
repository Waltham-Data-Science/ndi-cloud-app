/**
 * WorkspaceCanvas — the one-canvas layout container.
 *
 * Phase F2 tests:
 *   - selection bar mounts at the top
 *   - picker rail mounts with the right slot active
 *   - snapshot slot renders before the analyses slot in the DOM
 *   - document explorer escape link renders in the picker footer
 *
 * The picker tabs + selection bar internals are covered by their
 * own tests. Here we just verify the canvas wires them together.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/workspace/use-workspace-selection', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/workspace/use-workspace-selection')
  >('@/lib/workspace/use-workspace-selection');
  return {
    ...actual,
    useWorkspaceSelection: () => ({
      selection: {
        subject: null,
        session: null,
        probe: null,
        stimulus: null,
        unit: null,
      },
      hasAnySelection: false,
      pickerTab: 'subjects' as const,
      set: vi.fn(),
      clear: vi.fn(),
      clearOne: vi.fn(),
      setPickerTab: vi.fn(),
    }),
  };
});

import { WorkspaceCanvas } from '@/components/workspace/canvas/WorkspaceCanvas';

const SLOTS = {
  subjects: <div data-testid="subjects-slot">subjects</div>,
  sessions: <div data-testid="sessions-slot">sessions</div>,
  probes: <div data-testid="probes-slot">probes</div>,
  stimuli: <div data-testid="stimuli-slot">stimuli</div>,
  documents: <div data-testid="documents-slot">documents</div>,
} as const;

beforeEach(() => {
  // jsdom doesn't always set scrollY consistently between tests
});

describe('WorkspaceCanvas — composition', () => {
  it('mounts the SelectionBar at the top', () => {
    render(
      <WorkspaceCanvas
        datasetId="ds-test"
        pickerSlots={SLOTS}
        snapshot={<div data-testid="snapshot">snap</div>}
        analyses={<div data-testid="analyses">grid</div>}
      />,
    );
    expect(
      screen.getByRole('region', { name: /Workspace selection context/i }),
    ).toBeInTheDocument();
  });

  it('mounts the PickerRail with the active picker body', () => {
    render(
      <WorkspaceCanvas
        datasetId="ds-test"
        pickerSlots={SLOTS}
        snapshot={<div data-testid="snapshot">snap</div>}
        analyses={<div data-testid="analyses">grid</div>}
      />,
    );
    expect(screen.getByTestId('subjects-slot')).toBeInTheDocument();
  });

  it('renders the snapshot slot before the analyses slot in document order', () => {
    render(
      <WorkspaceCanvas
        datasetId="ds-test"
        pickerSlots={SLOTS}
        snapshot={<div data-testid="snapshot">snap</div>}
        analyses={<div data-testid="analyses">grid</div>}
      />,
    );
    const snap = screen.getByTestId('snapshot');
    const grid = screen.getByTestId('analyses');
    const followsSnap = Boolean(
      snap.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(followsSnap).toBe(true);
  });

  it('renders the Document Explorer escape link in the picker footer', () => {
    render(
      <WorkspaceCanvas
        datasetId="ds-test"
        pickerSlots={SLOTS}
        snapshot={<div data-testid="snapshot">snap</div>}
        analyses={<div data-testid="analyses">grid</div>}
      />,
    );
    const link = screen.getByRole('link', {
      name: /Browse all documents in Document Explorer/i,
    });
    expect(link).toHaveAttribute('href', '/datasets/ds-test/documents');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

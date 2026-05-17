/**
 * PanelEmptyState — illustrated empty-state primitive for analysis
 * cards.
 *
 * H8 polish (workspace-canvas-redesign 2026-05-16). Tests:
 *
 *   - Each of the 6 illustration kinds renders without throwing and
 *     wires its SVG testid
 *   - Title + hint text both surface in the DOM
 *   - role="status" so screen readers announce
 *   - data-illustration attribute mirrors the prop (lets per-panel
 *     tests assert which family the empty state belongs to)
 *   - testId prop pipes through to the wrapper
 *   - hint accepts ReactNode (string, fragments, nested elements)
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  PanelEmptyState,
  type EmptyStateIllustration,
} from '@/components/workspace/canvas/PanelEmptyState';

const ILLUSTRATIONS: ReadonlyArray<{
  kind: EmptyStateIllustration;
  testId: string;
}> = [
  { kind: 'line-trace', testId: 'empty-illustration-line-trace' },
  { kind: 'histogram', testId: 'empty-illustration-histogram' },
  { kind: 'raster', testId: 'empty-illustration-raster' },
  { kind: 'violin', testId: 'empty-illustration-violin' },
  { kind: 'gantt', testId: 'empty-illustration-gantt' },
  { kind: 'scatter', testId: 'empty-illustration-scatter' },
];

describe('PanelEmptyState', () => {
  it('renders title + hint + role=status', () => {
    render(
      <PanelEmptyState
        illustration="line-trace"
        title="Plot a signal trace"
        hint="Pick a session in the left rail."
      />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Plot a signal trace')).toBeInTheDocument();
    expect(
      screen.getByText(/pick a session in the left rail/i),
    ).toBeInTheDocument();
  });

  it('renders the testId on the wrapper when provided', () => {
    render(
      <PanelEmptyState
        illustration="line-trace"
        title="t"
        hint="h"
        testId="signal-empty"
      />,
    );

    expect(screen.getByTestId('signal-empty')).toBeInTheDocument();
  });

  it('exposes data-illustration so panel tests can assert the family', () => {
    render(
      <PanelEmptyState
        illustration="histogram"
        title="t"
        hint="h"
        testId="psth-empty"
      />,
    );

    expect(screen.getByTestId('psth-empty')).toHaveAttribute(
      'data-illustration',
      'histogram',
    );
  });

  it('accepts a ReactNode hint (fragments + nested markup)', () => {
    render(
      <PanelEmptyState
        illustration="raster"
        title="t"
        hint={
          <>
            Pick a unit <strong>(vmspikesummary)</strong> document.
          </>
        }
      />,
    );

    // Text fragment outside the strong:
    expect(screen.getByText(/pick a unit/i)).toBeInTheDocument();
    // Nested element:
    expect(screen.getByText('(vmspikesummary)').tagName).toBe('STRONG');
  });

  for (const { kind, testId } of ILLUSTRATIONS) {
    it(`renders the ${kind} illustration SVG`, () => {
      render(
        <PanelEmptyState
          illustration={kind}
          title="t"
          hint="h"
          testId={`wrap-${kind}`}
        />,
      );

      expect(screen.getByTestId(testId)).toBeInTheDocument();
      // Container reflects the illustration name.
      expect(screen.getByTestId(`wrap-${kind}`)).toHaveAttribute(
        'data-illustration',
        kind,
      );
    });
  }
});

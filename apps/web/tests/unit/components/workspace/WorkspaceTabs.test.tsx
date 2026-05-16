/**
 * WorkspaceTabs — URL-routed tab bar for the redesigned workspace
 * (Phase A, 2026-05-16).
 *
 * Mirrors the test pattern for DatasetTabs (which doesn't have its
 * own test file as of this writing, but the WAI-ARIA tablist
 * invariants are stable enough to lock here). Covers:
 *
 *   1. All five tabs render (Overview / Structure / Subjects /
 *      Sessions / Analyses). Ask is intentionally NOT a tab —
 *      decision locked in `docs/design/2026-05-16-workspace-redesign.md`.
 *   2. Active state derived from `usePathname()` — each tab's
 *      `aria-selected` flips based on the URL.
 *   3. Roving tabindex — only the active tab has `tabIndex={0}`;
 *      others sit at `tabIndex={-1}`.
 *   4. URL-routed hrefs — each tab links to the correct sub-route
 *      under `/my/workspace/[id]/`.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let pathnameStub: string = '/my/workspace/ds-abc/overview';

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameStub,
}));

import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

describe('WorkspaceTabs', () => {
  it('renders all five workspace tabs', () => {
    pathnameStub = '/my/workspace/ds-abc/overview';
    render(<WorkspaceTabs datasetId="ds-abc" />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    const labels = tabs.map((t) => t.textContent?.trim());
    expect(labels).toEqual([
      'Overview',
      'Structure',
      'Subjects',
      'Sessions',
      'Analyses',
    ]);
  });

  it('does NOT include an Ask tab (decision locked in redesign doc)', () => {
    pathnameStub = '/my/workspace/ds-abc/overview';
    render(<WorkspaceTabs datasetId="ds-abc" />);

    const tabs = screen.getAllByRole('tab');
    const labels = tabs.map((t) => t.textContent?.trim().toLowerCase());
    expect(labels).not.toContain('ask');
  });

  it('marks the Overview tab active when on /overview', () => {
    pathnameStub = '/my/workspace/ds-abc/overview';
    render(<WorkspaceTabs datasetId="ds-abc" />);

    const overview = screen.getByRole('tab', { name: /overview/i });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    expect(overview).toHaveAttribute('tabindex', '0');

    // Every other tab is unselected with tabindex -1 (roving pattern).
    const structure = screen.getByRole('tab', { name: /structure/i });
    expect(structure).toHaveAttribute('aria-selected', 'false');
    expect(structure).toHaveAttribute('tabindex', '-1');
  });

  it('marks the Subjects tab active when on /subjects', () => {
    pathnameStub = '/my/workspace/ds-abc/subjects';
    render(<WorkspaceTabs datasetId="ds-abc" />);

    expect(screen.getByRole('tab', { name: /subjects/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /overview/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('marks Sessions active for /sessions and any /sessions/<sub-route>', () => {
    // Deep-link friendly: the matcher uses startsWith, so a future
    // /sessions/<sessionId> drill-in keeps the parent tab selected.
    pathnameStub = '/my/workspace/ds-abc/sessions/sess-123';
    render(<WorkspaceTabs datasetId="ds-abc" />);

    expect(screen.getByRole('tab', { name: /sessions/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('links each tab to /my/workspace/<id>/<tab>', () => {
    pathnameStub = '/my/workspace/ds-xyz/overview';
    render(<WorkspaceTabs datasetId="ds-xyz" />);

    expect(
      screen.getByRole('tab', { name: /overview/i }),
    ).toHaveAttribute('href', '/my/workspace/ds-xyz/overview');
    expect(
      screen.getByRole('tab', { name: /structure/i }),
    ).toHaveAttribute('href', '/my/workspace/ds-xyz/structure');
    expect(
      screen.getByRole('tab', { name: /subjects/i }),
    ).toHaveAttribute('href', '/my/workspace/ds-xyz/subjects');
    expect(
      screen.getByRole('tab', { name: /sessions/i }),
    ).toHaveAttribute('href', '/my/workspace/ds-xyz/sessions');
    expect(
      screen.getByRole('tab', { name: /analyses/i }),
    ).toHaveAttribute('href', '/my/workspace/ds-xyz/analyses');
  });
});

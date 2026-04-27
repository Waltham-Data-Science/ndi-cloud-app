/**
 * DatasetTabs — audit #65 a11y gate (TDD red-first).
 *
 * The data-browser shipped a tab bar built on react-router NavLinks
 * with custom matchers but no roving tabindex + no arrow-key handling.
 * Audit 2026-04-23 #65 flagged this: WAI-ARIA tabs require keyboard
 * navigation within the tablist (only the active tab is in the natural
 * tab-order; siblings are reached via ArrowKeys / Home / End). This test
 * locks in the from-scratch implementation:
 *
 *   - Three URL-routed tabs (Overview, Summary tables, Document explorer)
 *   - `role="tab"` + `aria-selected` reflecting the URL pathname
 *   - Roving tabindex: active tab `tabIndex=0`, others `tabIndex=-1`
 *   - ArrowRight → next, ArrowLeft → previous (with wrap-around)
 *   - Home → first, End → last
 *   - Click-to-activate (Next.js navigates via `<Link>`)
 *
 * `usePathname` is mocked to control which tab is "active" in tests
 * without spinning up a real Next.js routing context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const pathnameMock = vi.fn<() => string>();
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

import { DatasetTabs } from '@/components/app/DatasetTabs';

beforeEach(() => {
  pathnameMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DatasetTabs — audit #65 a11y', () => {
  it('emits role="tablist" with four role="tab" children (Overview, Summary tables, Pivot, Document explorer)', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    render(<DatasetTabs datasetId="d1" />);
    const tablist = screen.getByRole('tablist');
    const tabs = screen.getAllByRole('tab');
    expect(tablist).toBeInTheDocument();
    // Audit 2026-04-27 #5 — Pivot tab restored. Pre-fix this was 3
    // tabs and pivot URLs lit up Summary tables. Now pivot is its
    // own tab; the Summary tables matcher narrows to /tables/* only.
    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'Overview',
      'Summary tables',
      'Pivot',
      'Document explorer',
    ]);
  });

  it('marks the Overview tab aria-selected when pathname ends in /overview', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    render(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const tables = screen.getByRole('tab', { name: /summary tables/i });
    expect(overview.getAttribute('aria-selected')).toBe('true');
    expect(tables.getAttribute('aria-selected')).toBe('false');
  });

  it('marks the Summary tables tab aria-selected on any /tables/* path', () => {
    pathnameMock.mockReturnValue('/datasets/d1/tables/subject');
    render(<DatasetTabs datasetId="d1" />);
    expect(
      screen.getByRole('tab', { name: /summary tables/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('marks the Pivot tab aria-selected on any /pivot/* path (NOT Summary tables)', () => {
    // Audit 2026-04-27 #5 — pre-fix, pivot URLs cross-wired to
    // Summary tables because both shared a matcher. Now Pivot owns
    // /pivot/* exclusively, and Summary tables stays inert.
    pathnameMock.mockReturnValue('/datasets/d1/pivot/session');
    render(<DatasetTabs datasetId="d1" />);
    expect(
      screen.getByRole('tab', { name: /^pivot$/i }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      screen.getByRole('tab', { name: /summary tables/i }).getAttribute('aria-selected'),
    ).toBe('false');
  });

  it('marks the Document explorer tab aria-selected on /documents path', () => {
    pathnameMock.mockReturnValue('/datasets/d1/documents');
    render(<DatasetTabs datasetId="d1" />);
    expect(
      screen.getByRole('tab', { name: /document explorer/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('roving tabindex: active tab has tabIndex=0, others have tabIndex=-1', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    render(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const tables = screen.getByRole('tab', { name: /summary tables/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    expect(overview.getAttribute('tabindex')).toBe('0');
    expect(tables.getAttribute('tabindex')).toBe('-1');
    expect(documents.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight on the focused tab moves focus to the next tab', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    render(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const tables = screen.getByRole('tab', { name: /summary tables/i });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tables);
  });

  it('ArrowLeft on the focused tab moves focus to the previous tab (wraps to last)', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    render(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(documents);
  });

  it('Home moves focus to the first tab', () => {
    pathnameMock.mockReturnValue('/datasets/d1/documents');
    render(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    documents.focus();
    fireEvent.keyDown(documents, { key: 'Home' });
    expect(document.activeElement).toBe(overview);
  });

  it('End moves focus to the last tab', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    render(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'End' });
    expect(document.activeElement).toBe(documents);
  });

  it('renders each tab as a Link with the correct href (URL-routed, not state)', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    render(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const tables = screen.getByRole('tab', { name: /summary tables/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    // next/link renders as <a href=...>, role="tab" applied via prop forwarding.
    expect(overview.getAttribute('href')).toBe('/datasets/d1/overview');
    // Tables tab points at the default subject class — keeps first-click
    // behavior identical to the data-browser /tables → tables/subject redirect.
    expect(tables.getAttribute('href')).toBe('/datasets/d1/tables/subject');
    expect(documents.getAttribute('href')).toBe('/datasets/d1/documents');
  });
});

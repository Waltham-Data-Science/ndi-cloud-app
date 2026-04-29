/**
 * DatasetTabs — audit #65 a11y gate + Tutorials autodiscovery (this PR).
 *
 * The data-browser shipped a tab bar built on react-router NavLinks
 * with custom matchers but no roving tabindex + no arrow-key handling.
 * Audit 2026-04-23 #65 flagged this: WAI-ARIA tabs require keyboard
 * navigation within the tablist (only the active tab is in the natural
 * tab-order; siblings are reached via ArrowKeys / Home / End). This test
 * locks in the from-scratch implementation:
 *
 *   - Three URL-routed tabs (Overview, Summary tables, Document explorer)
 *   - Tutorials tab appears when `useTutorialAvailability` returns
 *     `hasAny: true`, hidden otherwise (this PR — replacing the
 *     hardcoded two-id allowlist with a HEAD probe against the
 *     tutorials S3 bucket)
 *   - `role="tab"` + `aria-selected` reflecting the URL pathname
 *   - Roving tabindex: active tab `tabIndex=0`, others `tabIndex=-1`
 *   - ArrowRight → next, ArrowLeft → previous (with wrap-around)
 *   - Home → first, End → last
 *   - Click-to-activate (Next.js navigates via `<Link>`)
 *
 * `usePathname` is mocked to control which tab is "active" in tests
 * without spinning up a real Next.js routing context.
 * `useTutorialAvailability` is mocked so the test doesn't hit S3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const pathnameMock = vi.fn<() => string>();
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

// Mock the tutorial-availability hook so tests can flip the result
// per-case without standing up the real S3 probe.
const tutorialAvailabilityMock = vi.fn<() => {
  data?: { hasMatlab: boolean; hasPython: boolean; hasAny: boolean };
}>();
vi.mock('@/lib/data/tutorials', () => ({
  useTutorialAvailability: () => tutorialAvailabilityMock(),
}));

import { DatasetTabs } from '@/components/app/DatasetTabs';

function renderWithClient(node: ReactNode) {
  // Per-test QueryClient so tests don't share cache state. The hook
  // itself is mocked, so the QueryClient is just here to satisfy any
  // transitive `useQuery` callers in child components.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  pathnameMock.mockReset();
  tutorialAvailabilityMock.mockReset();
  // Default: probe resolved with no tutorials → Tutorials tab hidden.
  // Each test that needs the tab can override.
  tutorialAvailabilityMock.mockReturnValue({
    data: { hasMatlab: false, hasPython: false, hasAny: false },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('DatasetTabs — audit #65 a11y', () => {
  it('emits role="tablist" with three role="tab" children when no tutorial exists (Overview, Summary tables, Document explorer)', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const tablist = screen.getByRole('tablist');
    const tabs = screen.getAllByRole('tab');
    expect(tablist).toBeInTheDocument();
    // 2026-04-28 — Pivot tab removed (route + proxy + component
    // deleted in the same PR). The bar is back to three tabs.
    // Tutorials tab is gated on the HEAD probe — hidden by default.
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'Overview',
      'Summary tables',
      'Document explorer',
    ]);
  });

  it('marks the Overview tab aria-selected when pathname ends in /overview', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const tables = screen.getByRole('tab', { name: /summary tables/i });
    expect(overview.getAttribute('aria-selected')).toBe('true');
    expect(tables.getAttribute('aria-selected')).toBe('false');
  });

  it('marks the Summary tables tab aria-selected on any /tables/* path', () => {
    pathnameMock.mockReturnValue('/datasets/d1/tables/subject');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    expect(
      screen.getByRole('tab', { name: /summary tables/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('marks the Document explorer tab aria-selected on /documents path', () => {
    pathnameMock.mockReturnValue('/datasets/d1/documents');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    expect(
      screen.getByRole('tab', { name: /document explorer/i }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('roving tabindex: active tab has tabIndex=0, others have tabIndex=-1', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const tables = screen.getByRole('tab', { name: /summary tables/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    expect(overview.getAttribute('tabindex')).toBe('0');
    expect(tables.getAttribute('tabindex')).toBe('-1');
    expect(documents.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight on the focused tab moves focus to the next tab', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const tables = screen.getByRole('tab', { name: /summary tables/i });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tables);
  });

  it('ArrowLeft on the focused tab moves focus to the previous tab (wraps to last)', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(documents);
  });

  it('Home moves focus to the first tab', () => {
    pathnameMock.mockReturnValue('/datasets/d1/documents');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    documents.focus();
    fireEvent.keyDown(documents, { key: 'Home' });
    expect(document.activeElement).toBe(overview);
  });

  it('End moves focus to the last tab', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    const documents = screen.getByRole('tab', { name: /document explorer/i });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'End' });
    expect(document.activeElement).toBe(documents);
  });

  it('renders each tab as a Link with the correct href (URL-routed, not state)', () => {
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
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

describe('DatasetTabs — Tutorials autodiscovery gate', () => {
  it('hides the Tutorials tab while the HEAD-probe query is loading (no data yet)', () => {
    // `data: undefined` mirrors TanStack Query's pending state; the
    // gate optional-chains to `false`, so no tab renders.
    tutorialAvailabilityMock.mockReturnValue({ data: undefined });
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    expect(
      screen.queryByRole('tab', { name: /tutorial/i }),
    ).not.toBeInTheDocument();
  });

  it('hides the Tutorials tab when both probes resolve unavailable (hasAny:false)', () => {
    tutorialAvailabilityMock.mockReturnValue({
      data: { hasMatlab: false, hasPython: false, hasAny: false },
    });
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    expect(
      screen.queryByRole('tab', { name: /tutorial/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the Tutorials tab when at least one probe resolves available (hasAny:true)', () => {
    tutorialAvailabilityMock.mockReturnValue({
      data: { hasMatlab: true, hasPython: false, hasAny: true },
    });
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    const tutorial = screen.getByRole('tab', { name: /tutorial/i });
    expect(tutorial).toBeInTheDocument();
    expect(tutorial.getAttribute('href')).toBe('/datasets/d1/tutorials');
  });

  it('shows the Tutorials tab when only Python is available', () => {
    tutorialAvailabilityMock.mockReturnValue({
      data: { hasMatlab: false, hasPython: true, hasAny: true },
    });
    pathnameMock.mockReturnValue('/datasets/d1/overview');
    renderWithClient(<DatasetTabs datasetId="d1" />);
    expect(screen.getByRole('tab', { name: /tutorial/i })).toBeInTheDocument();
  });
});

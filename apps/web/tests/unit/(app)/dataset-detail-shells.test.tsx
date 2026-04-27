/**
 * Phase 3b shell smoke tests — TableShell, PivotShell, DocumentsShell,
 * DocumentDetailShell, OverviewContent.
 *
 * These are minimum-viable shells (the data-browser content components
 * port in a follow-up). The tests exercise the structural branches:
 *   - Sub-nav routing links carry the right hrefs
 *   - Active class / grain reflected via aria-current
 *   - Loading / error / data branches in OverviewContent
 *   - DocumentDetailShell renders title fallback + back link
 *
 * Coverage payoff: brings 5 untested files into branch coverage so
 * the Phase 3b ratchet stays above the 45% branches threshold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

// Phase 6.5b/6.5c: PivotShell mounts the real `<PivotView>` and
// DocumentsShell mounts the real `<DocumentExplorer>`. Both call
// `useRouter()`; DocumentExplorer also calls `useSearchParams()` and
// `usePathname()` for filter/page URL state. Mock all three so the
// rendering tests stay focused on shell-level contracts.
//
// `routerPushMock` is hoisted to module scope so per-test assertions
// (e.g., the onRowClick navigation test below) can read what URL the
// shell tried to navigate to.
const routerPushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/datasets/d1/documents',
}));

// VirtualizedTable wraps `@tanstack/react-virtual.useVirtualizer`,
// which under jsdom returns zero items because the scroll container
// has 0 height — so onRowClick never fires from a click test. Mock to
// materialize every row, matching the same pattern used by the
// PivotView test.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => {
    const size = estimateSize();
    const items = Array.from({ length: count }, (_, i) => ({
      index: i,
      key: i,
      start: i * size,
      end: (i + 1) * size,
      size,
      lane: 0,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * size,
    };
  },
}));

import { apiFetch } from '@/lib/api/client';
import { TableShell } from '@/app/(app)/datasets/[id]/tables/[className]/table-shell';
import { PivotShell } from '@/app/(app)/datasets/[id]/pivot/[grain]/pivot-shell';
import { DocumentsShell } from '@/app/(app)/datasets/[id]/documents/documents-shell';
import { DocumentDetailShell } from '@/app/(app)/datasets/[id]/documents/[docId]/document-detail-shell';
import { OverviewContent } from '@/app/(app)/datasets/[id]/overview/overview-content';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestQueryProvider;
}

beforeEach(() => {
  mockedApiFetch.mockReset();
  routerPushMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('TableShell', () => {
  // Phase 6.5a turned this from a placeholder into a real data-fetching
  // shell. The sub-nav is still rendered unconditionally, but the body
  // (TableContent) calls `useSummaryTable` which requires a
  // `QueryClientProvider` ancestor. The mock leaves the request pending
  // (Skeleton renders) so these tests stay focused on the nav contract.
  it('renders the per-class sub-nav with active aria-current', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="subject" />
      </Wrapper>,
    );
    const subjectLink = screen.getByRole('link', { name: 'Subjects' });
    expect(subjectLink.getAttribute('aria-current')).toBe('page');
    expect(subjectLink.getAttribute('href')).toBe('/datasets/d1/tables/subject');
    const elementLink = screen.getByRole('link', { name: 'Elements' });
    expect(elementLink.getAttribute('aria-current')).toBeNull();
  });

  it('renders the empty-state message when the table has no rows', async () => {
    mockedApiFetch.mockResolvedValueOnce({ columns: [], rows: [] });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="treatment" />
      </Wrapper>,
    );
    // The empty-state copy interpolates the active class name into a
    // separate `<span>` node ("No <span>treatment</span> rows…"), so the
    // class id appears as its own match target.
    await waitFor(() => {
      // Two `treatment` strings in the DOM: the active sub-nav link
      // ("Treatments") and the empty-state span. Match the span via
      // exact-text equality against the bare class id.
      expect(screen.getByText('treatment', { selector: 'span' })).toBeInTheDocument();
    });
  });

  it('clicking a subject row navigates to the document detail page', async () => {
    // Smoke-test feedback (post-Phase-6.7): summary-tables rows were
    // not clickable in the cloud-app port even though the data-browser
    // SPA navigated to /datasets/[id]/documents/[ndiId] on row click.
    // This pin guards the per-grain primary-id mapping in
    // `PRIMARY_DOC_ID_FIELD` (subject grain → subjectDocumentIdentifier).
    mockedApiFetch.mockResolvedValueOnce({
      columns: [
        { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
        { key: 'subjectLocalIdentifier', label: 'Local Identifier' },
      ],
      rows: [
        {
          subjectDocumentIdentifier: 'ndi-sub-A',
          subjectLocalIdentifier: 'A@lab.edu',
        },
      ],
    });
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <TableShell datasetId="d1" className="subject" />
      </Wrapper>,
    );
    // Wait for the table body to populate.
    await waitFor(() => {
      expect(screen.getByText('A@lab.edu')).toBeInTheDocument();
    });
    // The row carries the click handler — find the <tr> that contains
    // our cell text and click it. (We click the cell, which bubbles to
    // the row's onClick.)
    const cell = screen.getByText('A@lab.edu');
    const row = cell.closest('tr');
    expect(row).not.toBeNull();
    expect(row?.className).toMatch(/cursor-pointer/);
    row?.click();
    expect(routerPushMock).toHaveBeenCalledWith(
      '/datasets/d1/documents/ndi-sub-A',
    );
    // Reference `container` so eslint doesn't flag the destructure as
    // unused — also serves as a smoke-check the render mounted.
    expect(container.querySelector('table')).not.toBeNull();
  });
});

describe('PivotShell', () => {
  // Phase 6.5b turned this from a placeholder into a real PivotView
  // mount. The sub-nav is still rendered unconditionally, but PivotView
  // calls `useDatasetSummary` + `useDatasetPivot` which both require a
  // `QueryClientProvider` ancestor. Mock leaves them pending so this
  // test stays focused on the nav contract.
  it('renders the grain sub-nav with active aria-current', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <PivotShell datasetId="d1" grain="session" />
      </Wrapper>,
    );
    const sessionLink = screen.getByRole('link', { name: 'Per session' });
    expect(sessionLink.getAttribute('aria-current')).toBe('page');
    const subjectLink = screen.getByRole('link', { name: 'Per subject' });
    expect(subjectLink.getAttribute('aria-current')).toBeNull();
    expect(subjectLink.getAttribute('href')).toBe('/datasets/d1/pivot/subject');
  });
});

describe('DocumentsShell', () => {
  // Phase 6.5c turned this from a placeholder into a `DocumentExplorer`
  // mount. The sidebar header always renders ("Document classes"); the
  // class-counts list / document table appear after the api fetches
  // resolve. The mock leaves both pending so this test stays focused
  // on the shell rendering at all.
  it('renders the document-classes sidebar even before data resolves', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentsShell datasetId="d1" />
      </Wrapper>,
    );
    expect(
      screen.getByRole('heading', { name: /Document classes/i }),
    ).toBeInTheDocument();
  });
});

describe('DocumentDetailShell', () => {
  it('shows skeletons in the hero h1 slot and the body while the fetch is pending', () => {
    // Phase 6.6 REBUILD-8 swapped the prior "Loading document…" copy for
    // a depth-gradient hero with a Skeleton in the h1 position plus body
    // Skeletons (matches source's hero layout). Assert against the
    // skeleton class directly since the copy is no longer rendered.
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <DocumentDetailShell datasetId="d1" docId="doc-1" />
      </Wrapper>,
    );
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows an ErrorState when the document fetch errors', async () => {
    // Phase 6.6 REBUILD-8 routes errors through `<ErrorState>` (matches
    // source). For a plain Error (no recovery hint), ErrorState renders
    // the contact-support branch with `role="alert"` containing the
    // error message — assert against the role + message text so we
    // don't pin the exact copy.
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentDetailShell datasetId="d1" docId="doc-1" />
      </Wrapper>,
    );
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/boom/);
    });
  });

  it('renders the document name as h1 when fetched', async () => {
    // The new shell mounts `<AppearsElsewhere>` after the document
    // resolves, which fetches `/api/datasets/:id/documents/:docId/appears-elsewhere`.
    // Stub all subsequent calls to a never-resolving promise so the
    // component shows its loading state without throwing on a missing
    // mock.
    mockedApiFetch.mockResolvedValueOnce({
      id: 'doc-1',
      name: 'My probe',
      ndiId: 'ndi:abc',
      className: 'element',
    });
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentDetailShell datasetId="d1" docId="doc-1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'My probe' }),
      ).toBeInTheDocument();
    });
  });

  it('always renders a back link to the document explorer', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentDetailShell datasetId="d-back" docId="doc-1" />
      </Wrapper>,
    );
    const back = screen.getByRole('link', { name: /Back to document explorer/i });
    expect(back.getAttribute('href')).toBe('/datasets/d-back/documents');
  });
});

describe('OverviewContent', () => {
  it('shows skeletons while loading', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <OverviewContent datasetId="d1" />
      </Wrapper>,
    );
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('shows a fallback panel on error', async () => {
    // Phase 6.6 REBUILD-3c: OverviewContent makes three query calls
    // (dataset, summary, provenance). The error branch is gated on
    // `ds.isError`, so we only need to fail the first call; summary +
    // provenance can stay pending.
    // Visual-comparison audit #6: the fallback panel is now the
    // ported `<ErrorState>` (typed error UI) instead of the static
    // "Couldn't load dataset {id}" line. ErrorState renders a
    // `role=alert` region in any recovery branch — assert against
    // that contract so the test stays robust regardless of the bucket
    // a particular Error fixture lands in.
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <OverviewContent datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });
  });

  it('renders the abstract when the dataset has one', async () => {
    // Phase 6.6 REBUILD-3c: OverviewContent now mounts
    // DatasetOverviewCard (main column) + DatasetSummaryCard / provenance
    // (sidecar). The dataset record's `description ?? abstract` shows
    // up inside the Details card; summary + provenance are left
    // pending so this test stays focused on the Overview card path.
    mockedApiFetch
      .mockResolvedValueOnce({
        id: 'd1',
        name: 'whatever',
        abstract: 'A long study of widget tuning across rats and mice.',
      })
      .mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <OverviewContent datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/A long study of widget tuning/i),
      ).toBeInTheDocument();
    });
  });
});

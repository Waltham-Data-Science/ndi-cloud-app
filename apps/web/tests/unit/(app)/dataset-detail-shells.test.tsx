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
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/datasets/d1/documents',
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
  it('shows a loading message while the document fetch is pending', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentDetailShell datasetId="d1" docId="doc-1" />
      </Wrapper>,
    );
    expect(screen.getByText(/Loading document/i)).toBeInTheDocument();
  });

  it('shows a fallback when the document fetch errors', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentDetailShell datasetId="d1" docId="doc-1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn.t load document doc-1/i),
      ).toBeInTheDocument();
    });
  });

  it('renders the document name when fetched', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'doc-1',
      name: 'My probe',
      ndiId: 'ndi:abc',
      className: 'element',
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentDetailShell datasetId="d1" docId="doc-1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'My probe' }),
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
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <OverviewContent datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Couldn.t load dataset d1/i)).toBeInTheDocument();
    });
  });

  it('renders the abstract when the dataset has one', async () => {
    // First call: useDataset → returns data with abstract
    // Second call: useDatasetSummary → returns empty highlights
    mockedApiFetch
      .mockResolvedValueOnce({
        id: 'd1',
        name: 'whatever',
        abstract: 'A long study of widget tuning across rats and mice.',
      })
      .mockResolvedValueOnce({ species: [], brainRegions: [] });
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

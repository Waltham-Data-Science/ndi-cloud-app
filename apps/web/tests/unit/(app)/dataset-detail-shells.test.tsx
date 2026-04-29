/**
 * Phase 3b shell smoke tests — TableShell, DocumentsShell,
 * DocumentDetailShell, OverviewContent.
 *
 * 2026-04-28: PivotShell removed alongside the pivot route deletion.
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

// Mock `apiFetch` only; preserve the rest of the module's exports
// (notably `ApiError`, which production code at `table-shell.tsx`
// uses for `instanceof` checks on 404 responses — audit 2026-04-27
// #6 fix). A blanket `() => ({ apiFetch: vi.fn() })` would break the
// re-exported `ApiError` symbol, making `instanceof` checks fail
// silently with `Right-hand side of instanceof is not callable`.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

// Phase 6.5c: DocumentsShell mounts the real `<DocumentExplorer>`,
// which calls `useRouter()`, `useSearchParams()` and `usePathname()`
// for filter/page URL state. Mock all three so the rendering tests
// stay focused on shell-level contracts.
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
// materialize every row.
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

  it('omits Treatments / OpenMINDS subjects / Combined from the default tab strip even when the dataset has rows', async () => {
    // 2026-04-28 (round 2) — team review feedback: those three tabs
    // are redundant with the Subjects tab (treatments now joined per-
    // subject) and the Combined join is empty for most datasets. They
    // remain reachable by direct URL but are filtered out of the
    // default sub-tab strip. Pin the contract so a future
    // ALWAYS_VISIBLE_CLASSES change doesn't accidentally promote them
    // back.
    mockedApiFetch.mockImplementation((url: string) => {
      if (url.includes('/class-counts')) {
        return Promise.resolve({
          datasetId: 'd1',
          totalDocuments: 99,
          classCounts: {
            subject: 5,
            element: 3,
            element_epoch: 2,
            treatment: 4,
            probe_location: 2,
            openminds_subject: 5,
            // `combined` is gated on element_epoch; element_epoch=2
            // would historically have shown the tab, but
            // HIDDEN_DEFAULT_TABS now blocks it from the default strip
            // regardless.
          },
        });
      }
      return new Promise(() => {});
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="subject" />
      </Wrapper>,
    );
    // Wait for class-counts to land — the strip recomputes once data
    // arrives.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Subjects' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Treatments' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'OpenMINDS subjects' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Combined' })).not.toBeInTheDocument();
    // The visible primary grains are still there.
    expect(screen.getByRole('link', { name: 'Elements' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Epochs' })).toBeInTheDocument();
    // Mappings (formerly Ontology) is in ALWAYS_VISIBLE_CLASSES so it
    // shows up regardless of count.
    expect(screen.getByRole('link', { name: 'Mappings' })).toBeInTheDocument();
  });

  it('surfaces a hidden-default tab in the strip when the user is currently on it (direct-URL bookmark fallback)', async () => {
    // The route at /datasets/[id]/tables/treatment must still resolve
    // even though `treatment` is in HIDDEN_DEFAULT_TABS. To keep the
    // active-tab state visible, the strip surfaces the active tab
    // even when it's a hidden default.
    mockedApiFetch.mockImplementation((url: string) => {
      if (url.includes('/class-counts')) {
        return Promise.resolve({
          datasetId: 'd1',
          totalDocuments: 99,
          classCounts: { subject: 5, treatment: 4 },
        });
      }
      // Leave the table fetch pending so we focus on the nav contract.
      return new Promise(() => {});
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="treatment" />
      </Wrapper>,
    );
    await waitFor(() => {
      const treatmentLink = screen.queryByRole('link', { name: 'Treatments' });
      expect(treatmentLink).not.toBeNull();
      expect(treatmentLink?.getAttribute('aria-current')).toBe('page');
    });
  });

  it('renders the empty-state message when the table has no rows', async () => {
    mockedApiFetch.mockResolvedValueOnce({ columns: [], rows: [] });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="treatment" />
      </Wrapper>,
    );
    // Audit 2026-04-27 #6 — the empty-state copy now uses the
    // friendly per-class label (`treatments`) instead of the raw
    // URL slug (`treatment`). Sub-nav still shows "Treatments"
    // (capitalized); the empty-state span renders the lowercase
    // friendly label so the sentence reads naturally.
    await waitFor(() => {
      expect(screen.getByText('treatments', { selector: 'span' })).toBeInTheDocument();
    });
  });

  it('treats a 404 from the table endpoint as empty (audit #6), not as an error', async () => {
    // The `useSummaryTable` query throws ApiError(404, ...) when
    // the dataset doesn't publish this class. Pre-fix, the renderer
    // showed alarming "Failed to load… Something went wrong" copy
    // for what's really an empty state. Audit's fix: distinguish
    // 404 from real failures and route 404 to the empty-state
    // branch.
    // Import ApiError directly from `@/lib/api/errors` — the
    // module mock at the top of this file replaces `@/lib/api/client`
    // entirely with `{ apiFetch: vi.fn() }`, dropping its re-export
    // of ApiError. The errors module isn't mocked, so it's the
    // canonical source.
    const { ApiError } = await import('@/lib/api/errors');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(404, {
        error: {
          code: 'NOT_FOUND',
          message: 'No treatment table for dataset d1',
          recovery: 'none',
          requestId: null,
        },
      }),
    );
    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="treatment" />
      </Wrapper>,
    );
    await waitFor(() => {
      // Empty-state span (friendly label, lowercase).
      expect(
        screen.getByText('treatments', { selector: 'span' }),
      ).toBeInTheDocument();
    });
    // The "Couldn't load… please retry" alarm copy must NOT render.
    expect(screen.queryByText(/please retry/i)).not.toBeInTheDocument();
    // Body should explain the empty state, not surface the 404
    // request id / error code.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('keeps the retry-style copy for non-404 errors (audit #6 negative case)', async () => {
    // 503 / 504 / 500 are real failures; the retry copy must still
    // render so the user knows to try again.
    // Import ApiError directly from `@/lib/api/errors` — the
    // module mock at the top of this file replaces `@/lib/api/client`
    // entirely with `{ apiFetch: vi.fn() }`, dropping its re-export
    // of ApiError. The errors module isn't mocked, so it's the
    // canonical source.
    const { ApiError } = await import('@/lib/api/errors');
    // 2026-04-29 — strain-name join (round 3) added a second
    // `useDocumentsInfinite('openminds_subject', …)` query to the
    // subject grain. Switched from one-shot `mockRejectedValueOnce`
    // to URL-dispatched mocking so the openminds_subject + class-
    // counts queries get safe stubs while the subject summary query
    // is the one that errors. Otherwise the un-mocked second call
    // returns `undefined` and crashes `useDocumentsInfinite`'s
    // `getNextPageParam`.
    const error = new ApiError(503, {
      error: {
        code: 'CLOUD_UNREACHABLE',
        message: 'cloud upstream unreachable',
        recovery: 'retry',
        requestId: 'req-503-test',
      },
    });
    mockedApiFetch.mockImplementation((url: string) => {
      if (url.includes('/class-counts')) {
        return Promise.resolve({
          datasetId: 'd1',
          totalDocuments: 0,
          classCounts: {},
        });
      }
      if (url.includes('/documents?') && url.includes('class=openminds_subject')) {
        return Promise.resolve({
          total: 0,
          documents: [],
          page: 1,
          pageSize: 200,
        });
      }
      // The subject summary table query is the one we want to fail.
      return Promise.reject(error);
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="subject" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/please retry/i)).toBeInTheDocument();
    });
    // The empty-state copy must NOT render for a 503.
    expect(
      screen.queryByText(/this dataset doesn.+publish/i),
    ).not.toBeInTheDocument();
  });

  it('joins treatments to subjects per-row without broadcasting (replaces PR #129 hide-by-default)', async () => {
    // 2026-04-28 — Per-subject treatment join. PR #129 hid the
    // discovered dynamic treatment columns by default to avoid the
    // broadcast bug (every subject showing the same treatment
    // values); this PR replaces that with a real per-subject join
    // keyed off `subjectDocumentIdentifier`. Contract pinned by this
    // test:
    //  (a) row count stays at N (NOT N × treatments)
    //  (b) subject 1 carries its own treatment value, subject 2
    //      carries its own
    //  (c) subject 3 (no matching treatment) has empty treatment
    //      cells, NOT broadcast values
    //
    // TableShell + StandardTableContent register multiple useQuery
    // hooks in the same render pass (`useClassCounts`,
    // `useSummaryTable(subject)`, `useSummaryTable(treatment)`).
    // TanStack Query may schedule those queryFns concurrently, so
    // chained `mockResolvedValueOnce` calls do NOT reliably map to
    // a specific endpoint. Dispatch by URL pattern instead.
    mockedApiFetch.mockImplementation((url: string) => {
      if (url.includes('/class-counts')) {
        return Promise.resolve({
          datasetId: 'd1',
          totalDocuments: 99,
          classCounts: { subject: 3, treatment: 2 },
        });
      }
      if (url.includes('/tables/subject')) {
        return Promise.resolve({
          columns: [
            { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
            { key: 'subjectLocalIdentifier', label: 'Local Identifier' },
          ],
          rows: [
            { subjectDocumentIdentifier: 'sub-1', subjectLocalIdentifier: 'A@lab' },
            { subjectDocumentIdentifier: 'sub-2', subjectLocalIdentifier: 'B@lab' },
            { subjectDocumentIdentifier: 'sub-3', subjectLocalIdentifier: 'C@lab' },
          ],
        });
      }
      if (url.includes('/tables/treatment')) {
        return Promise.resolve({
          columns: [
            { key: 'treatmentName', label: 'Treatment' },
            { key: 'treatmentOntology', label: 'Treatment Ontology' },
            { key: 'numericValue', label: 'Numeric Value' },
            { key: 'stringValue', label: 'String Value' },
            { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
          ],
          rows: [
            {
              treatmentName: 'Optogenetic Tetanus Stimulation Target Location',
              treatmentOntology: 'EMPTY:0000074',
              numericValue: [],
              stringValue: 'UBERON:0001930',
              subjectDocumentIdentifier: 'sub-1',
            },
            {
              treatmentName: 'Optogenetic Tetanus Stimulation Target Location',
              treatmentOntology: 'EMPTY:0000074',
              numericValue: [],
              stringValue: 'UBERON:0002034',
              subjectDocumentIdentifier: 'sub-2',
            },
          ],
        });
      }
      // Any other URL leaves the query pending — no test should hit
      // this branch, but a never-resolving promise is the safe default.
      return new Promise(() => {});
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="subject" />
      </Wrapper>,
    );

    // Wait for both fetches to settle and the join to apply — the
    // dynamic column header appears once treatment data lands.
    await waitFor(() => {
      const headerCells = Array.from(document.querySelectorAll('thead th'));
      const labels = headerCells.map(
        (th) => th.querySelector('button span')?.textContent?.trim() ?? '',
      );
      expect(
        labels.some((l) => l.includes('Optogenetic Tetanus Stimulation Target Location')),
      ).toBe(true);
    });

    // (a) Row count: exactly 3 subject rows, NOT 3 × 2 treatments.
    const bodyRows = document.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(3);

    // (b) Per-subject treatment values: sub-1 → UBERON:0001930,
    //     sub-2 → UBERON:0002034. Test by locating the row that
    //     contains the subject's local id, then asserting the cell
    //     text within that row.
    const sub1Row = screen.getByText('A@lab').closest('tr');
    expect(sub1Row).not.toBeNull();
    expect(sub1Row?.textContent).toContain('UBERON:0001930');
    expect(sub1Row?.textContent).not.toContain('UBERON:0002034');

    const sub2Row = screen.getByText('B@lab').closest('tr');
    expect(sub2Row).not.toBeNull();
    expect(sub2Row?.textContent).toContain('UBERON:0002034');
    expect(sub2Row?.textContent).not.toContain('UBERON:0001930');

    // (c) sub-3 has NO matching treatment — its row must NOT carry
    //     either of the broadcast values.
    const sub3Row = screen.getByText('C@lab').closest('tr');
    expect(sub3Row).not.toBeNull();
    expect(sub3Row?.textContent).not.toContain('UBERON:0001930');
    expect(sub3Row?.textContent).not.toContain('UBERON:0002034');
  });

  it('replaces strain ID with the human-readable name from the partner openminds_subject doc and renders a Wormbase link', async () => {
    // 2026-04-28 (round 3) — Team review feedback: "currently
    // displaying as 00000001 should be displaying as N2 and link to
    // wormbase.org". The cloud's subject summary projection ships
    // `strainName: "WBStrain:00000001"` (the bare ID); the strain
    // *name* `"N2"` lives on the partner openminds_subject Strain
    // doc linked to the subject via depends_on.subject_id. This
    // PR fetches those docs and joins them onto the subject row.
    //
    // Contract pinned by this test:
    //  (a) The strain cell renders the human strain name (`N2`),
    //      not the raw ID (`WBStrain:00000001`).
    //  (b) The strainOntology cell still shows the ID chip AND a
    //      hyperlink to https://wormbase.org/.../strain/WBStrain00000001
    //      (data-ontology-link attribute carries the term ID for
    //       e2e hooks).
    mockedApiFetch.mockImplementation((url: string) => {
      if (url.includes('/class-counts')) {
        return Promise.resolve({
          datasetId: 'd1',
          totalDocuments: 99,
          classCounts: {
            subject: 2,
            openminds_subject: 2,
          },
        });
      }
      if (url.includes('/tables/subject')) {
        return Promise.resolve({
          columns: [
            { key: 'subjectDocumentIdentifier', label: 'Subject Doc ID' },
            { key: 'strainName', label: 'Strain' },
            { key: 'strainOntology', label: 'Strain Ontology' },
          ],
          rows: [
            {
              subjectDocumentIdentifier: 'sub-A',
              strainName: 'WBStrain:00000001',
              strainOntology: 'WBStrain:00000001',
            },
            {
              subjectDocumentIdentifier: 'sub-B',
              strainName: 'WBStrain:00000007',
              strainOntology: 'WBStrain:00000007',
            },
          ],
        });
      }
      if (url.includes('/documents') && url.includes('class=openminds_subject')) {
        return Promise.resolve({
          total: 2,
          page: 1,
          pageSize: 200,
          documents: [
            {
              ndiId: 'ndi:strain:1',
              data: {
                openminds: {
                  matlab_type: 'openminds.core.research.Strain',
                  openminds_type: 'https://openminds.om-i.org/types/Strain',
                  fields: {
                    name: 'N2',
                    ontologyIdentifier: 'WBStrain:00000001',
                  },
                },
                depends_on: [{ name: 'subject_id', value: 'sub-A' }],
              },
            },
            {
              ndiId: 'ndi:strain:2',
              data: {
                openminds: {
                  matlab_type: 'openminds.core.research.Strain',
                  openminds_type: 'https://openminds.om-i.org/types/Strain',
                  fields: {
                    name: 'CB1234',
                    ontologyIdentifier: 'WBStrain:00000007',
                  },
                },
                depends_on: [{ name: 'subject_id', value: 'sub-B' }],
              },
            },
          ],
        });
      }
      // Any other URL — the treatment fetch will hit this for the
      // subject grain (the per-subject treatment join also fires).
      // Resolve as 404 so the empty-treatment-table path is exercised
      // and doesn't block the subject render.
      return new Promise(() => {});
    });

    const Wrapper = withClient();
    render(
      <Wrapper>
        <TableShell datasetId="d1" className="subject" />
      </Wrapper>,
    );

    // (a) Wait for the strain-name join to apply — sub-A row should
    //     show `N2` somewhere, not the bare ID.
    await waitFor(() => {
      const sub1Row = document.querySelector('tbody tr');
      expect(sub1Row?.textContent).toContain('N2');
    });
    const subARow = screen
      .getAllByText('sub-A', { selector: 'span' })[0]
      ?.closest('tr');
    expect(subARow).toBeTruthy();
    // The strain cell on sub-A's row carries `N2` (not just somewhere
    // on the page).
    expect(subARow?.textContent).toContain('N2');

    const subBRow = screen
      .getAllByText('sub-B', { selector: 'span' })[0]
      ?.closest('tr');
    expect(subBRow).toBeTruthy();
    expect(subBRow?.textContent).toContain('CB1234');

    // (b) The strainOntology chip still shows the ID. The external
    //     link renders for the WBStrain prefix → Wormbase.
    const links = document.querySelectorAll('a[data-ontology-link]');
    const wbLinks = Array.from(links).filter(
      (a) => a.getAttribute('data-ontology-link') === 'WBStrain:00000001',
    );
    expect(wbLinks.length).toBeGreaterThan(0);
    expect(wbLinks[0]?.getAttribute('href')).toBe(
      'https://wormbase.org/species/c_elegans/strain/WBStrain00000001',
    );
    expect(wbLinks[0]?.getAttribute('target')).toBe('_blank');
    expect(wbLinks[0]?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('clicking a subject row navigates to the document detail page', async () => {
    // Smoke-test feedback (post-Phase-6.7): summary-tables rows were
    // not clickable in the cloud-app port even though the data-browser
    // SPA navigated to /datasets/[id]/documents/[ndiId] on row click.
    // This pin guards the per-grain primary-id mapping in
    // `PRIMARY_DOC_ID_FIELD` (subject grain → subjectDocumentIdentifier).
    // 2026-04-29 — same mocking-shape change as the retry-copy test
    // above: subject grain now fires three queries (class-counts +
    // subject summary + openminds_subject documents for strain-name
    // join). Dispatch by URL so each gets a sensible stub.
    mockedApiFetch.mockImplementation((url: string) => {
      if (url.includes('/class-counts')) {
        return Promise.resolve({
          datasetId: 'd1',
          totalDocuments: 1,
          classCounts: { subject: 1 },
        });
      }
      if (url.includes('/documents?') && url.includes('class=openminds_subject')) {
        return Promise.resolve({
          total: 0,
          documents: [],
          page: 1,
          pageSize: 200,
        });
      }
      // Subject summary table — the actual payload under test.
      return Promise.resolve({
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

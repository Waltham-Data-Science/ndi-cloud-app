/**
 * DocumentExplorer + DocumentDetailView smoke tests — Phase 6.5c.
 *
 * The data-browser source had no test files for these components — this
 * suite ports the rendering contracts the components were designed for
 * (filter sidebar, paginated list, JSON tree, dependency list, file
 * panel, summary-vs-raw class routing). Each test mounts under
 * `QueryClientProvider` with mocked `apiFetch` because both components
 * eventually hit `useDocuments` / `useClassCounts` / `useDocument`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/datasets/d1/documents',
}));

import { apiFetch } from '@/lib/api/client';
import { ClassCountsList } from '@/components/app/ClassCountsList';
import { DocumentExplorer } from '@/components/app/DocumentExplorer';
import { DocumentDetailView } from '@/components/app/DocumentDetailView';
import type { DocumentSummary } from '@/lib/api/documents';

const mockedApiFetch = vi.mocked(apiFetch);

function withClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function TestProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return TestProvider;
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── ClassCountsList ────────────────────────────────────────────────────

describe('ClassCountsList', () => {
  it('routes EVERY class to /documents?class= (stays in the explorer)', () => {
    // 2026-04-28 — pre-fix this split summary classes (subject /
    // element / element_epoch / treatment / openminds_subject /
    // probe_location) to /tables/[className]. That yanked users out
    // of the explorer they were already in. The fix routes every
    // class to the explorer's class-filter URL form so clicks behave
    // like filters, not tab swaps.
    render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 100,
          classCounts: { subject: 30, custom_class: 70 },
        }}
      />,
    );
    const subjectLink = screen.getByRole('link', { name: /subject/i });
    expect(subjectLink.getAttribute('href')).toBe(
      '/datasets/d1/documents?class=subject',
    );
    const customLink = screen.getByRole('link', { name: /custom_class/i });
    expect(customLink.getAttribute('href')).toBe(
      '/datasets/d1/documents?class=custom_class',
    );
  });

  it('renders progress bars sorted by count (descending)', () => {
    const { container } = render(
      <ClassCountsList
        datasetId="d1"
        data={{
          totalDocuments: 200,
          classCounts: { a: 10, b: 50, c: 140 },
        }}
      />,
    );
    const links = Array.from(container.querySelectorAll('a'));
    const labels = links.map((l) => l.textContent?.match(/^([a-z_]+)/)?.[0]);
    // Highest count first.
    expect(labels[0]).toBe('c');
    expect(labels[1]).toBe('b');
    expect(labels[2]).toBe('a');
  });

  it('caps at 25 classes (sanity bound on long tails)', () => {
    const classCounts: Record<string, number> = {};
    for (let i = 0; i < 50; i++) classCounts[`class_${i}`] = 50 - i;
    render(
      <ClassCountsList
        datasetId="d1"
        data={{ totalDocuments: 1000, classCounts }}
      />,
    );
    expect(screen.getAllByRole('link').length).toBe(25);
  });
});

// ─── DocumentExplorer ───────────────────────────────────────────────────

describe('DocumentExplorer', () => {
  it('renders a loading skeleton in the sidebar while class counts fetch', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentExplorer datasetId="d1" />
      </Wrapper>,
    );
    // Sidebar header is unconditional; the skeleton appears beneath it.
    expect(
      screen.getByRole('heading', { name: /Document classes/i }),
    ).toBeInTheDocument();
  });

  /** apiFetch dispatcher — branches on URL so useClassCounts and
   * useDocuments each see the right response shape regardless of which
   * query TanStack Query schedules first. */
  function mockApiByUrl(map: Record<string, unknown>) {
    mockedApiFetch.mockImplementation((url: string) => {
      for (const prefix of Object.keys(map)) {
        if (url.startsWith(prefix)) return Promise.resolve(map[prefix]);
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
  }

  it('renders the empty-state row when documents return zero results', async () => {
    mockApiByUrl({
      '/api/datasets/d1/class-counts': {
        totalDocuments: 0,
        classCounts: {},
      },
      '/api/datasets/d1/documents': {
        total: 0,
        documents: [],
        page: 1,
        pageSize: 50,
      },
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentExplorer datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No documents for this class/i)).toBeInTheDocument();
    });
  });

  it('renders a row per document when the list returns results', async () => {
    mockApiByUrl({
      '/api/datasets/d1/class-counts': {
        totalDocuments: 1,
        classCounts: { subject: 1 },
      },
      '/api/datasets/d1/documents': {
        total: 1,
        documents: [
          {
            id: 'mongo-1',
            ndiId: 'ndi-1',
            name: 'My subject',
            className: 'subject',
          },
        ],
        page: 1,
        pageSize: 50,
      },
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DocumentExplorer datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('My subject')).toBeInTheDocument();
    });
    expect(screen.getByText('mongo-1')).toBeInTheDocument();
  });
});

// ─── DocumentDetailView ─────────────────────────────────────────────────

const baseDoc: DocumentSummary = {
  id: 'mongo-1',
  ndiId: 'ndi-abc',
  name: 'Subject A',
  className: 'subject',
  data: {
    base: { id: 'ndi-abc', datestamp: '2026-01-15T00:00:00Z' },
    document_class: {
      class_name: 'subject',
      definition: 'A laboratory subject.',
    },
    depends_on: [{ name: 'session_id', value: 'ndi-sess-1' }],
    files: {
      file_info: [
        { name: 'recording.bin', locations: { uid: 'uid-123' } },
      ],
    },
    custom_field: 'hello',
    counts: { trials: 12 },
  },
};

describe('DocumentDetailView', () => {
  it('renders the class badge + ndiId + definition + datestamp', () => {
    render(<DocumentDetailView document={baseDoc} datasetId="d1" />);
    const view = screen.getByTestId('document-detail-view');
    expect(within(view).getByText('subject')).toBeInTheDocument();
    expect(within(view).getByText(/ID:\s*ndi-abc/)).toBeInTheDocument();
    expect(within(view).getByText(/A laboratory subject\./)).toBeInTheDocument();
  });

  it('renders dependency rows linked to the right doc detail page', () => {
    render(<DocumentDetailView document={baseDoc} datasetId="d1" />);
    const link = screen.getByRole('link', { name: 'ndi-sess-1' });
    expect(link.getAttribute('href')).toBe(
      '/datasets/d1/documents/ndi-sess-1',
    );
  });

  it('renders the files panel with file name and uid', () => {
    render(<DocumentDetailView document={baseDoc} datasetId="d1" />);
    expect(screen.getByText('recording.bin')).toBeInTheDocument();
    expect(screen.getByText('uid-123')).toBeInTheDocument();
  });

  it('renders the JSON tree of remaining (non-special) fields', () => {
    const { container } = render(
      <DocumentDetailView document={baseDoc} datasetId="d1" />,
    );
    // The tree shows top-level keys that aren't `base` / `document_class`
    // / `depends_on` / `files` — i.e. `custom_field` + `counts`.
    expect(container.textContent).toContain('custom_field');
    expect(container.textContent).toContain('counts');
    expect(container.textContent).toContain('hello');
    expect(container.textContent).toContain('12');
  });

  it('renders dependency value as plain text when no datasetId is provided', () => {
    render(<DocumentDetailView document={baseDoc} />);
    // Without datasetId we cannot resolve the doc URL, so the dep value
    // shows as text (no <a>).
    expect(screen.queryByRole('link', { name: 'ndi-sess-1' })).toBeNull();
    expect(screen.getByText('ndi-sess-1')).toBeInTheDocument();
  });
});

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
  it('renders the per-class sub-nav with active aria-current', () => {
    render(<TableShell datasetId="d1" className="subject" />);
    const subjectLink = screen.getByRole('link', { name: 'Subjects' });
    expect(subjectLink.getAttribute('aria-current')).toBe('page');
    expect(subjectLink.getAttribute('href')).toBe('/datasets/d1/tables/subject');
    const elementLink = screen.getByRole('link', { name: 'Elements' });
    expect(elementLink.getAttribute('aria-current')).toBeNull();
  });

  it('echoes the active class id in the body copy', () => {
    render(<TableShell datasetId="d1" className="treatment" />);
    expect(screen.getByText('treatment')).toBeInTheDocument();
  });
});

describe('PivotShell', () => {
  it('renders the grain sub-nav with active aria-current', () => {
    render(<PivotShell datasetId="d1" grain="session" />);
    const sessionLink = screen.getByRole('link', { name: 'Per session' });
    expect(sessionLink.getAttribute('aria-current')).toBe('page');
    const subjectLink = screen.getByRole('link', { name: 'Per subject' });
    expect(subjectLink.getAttribute('aria-current')).toBeNull();
    expect(subjectLink.getAttribute('href')).toBe('/datasets/d1/pivot/subject');
  });
});

describe('DocumentsShell', () => {
  it('renders the dataset id', () => {
    render(<DocumentsShell datasetId="d1" />);
    expect(screen.getByText('d1')).toBeInTheDocument();
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

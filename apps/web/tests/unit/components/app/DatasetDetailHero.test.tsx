/**
 * DatasetDetailHero — Phase 3b smoke + branch coverage.
 *
 * The hero has three top-level branches (loading / error / has-data)
 * plus several sub-branches (license badge, branch badge, contributors,
 * dates, DOI). These tests exercise each branch through TanStack
 * Query's `useDataset` hook with a controlled fixture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { DatasetDetailHero } from '@/components/app/DatasetDetailHero';
import { apiFetch } from '@/lib/api/client';

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

describe('DatasetDetailHero', () => {
  it('shows skeletons while the dataset is loading', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    // Skeleton component renders divs with `.skeleton`. Fallback heading
    // doesn't render in the loading branch.
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('falls back to the dataset id as heading on fetch error', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('network down'));
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DatasetDetailHero datasetId="d-broken" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'd-broken' }),
      ).toBeInTheDocument();
    });
  });

  it('renders dataset name + license badge when data resolves', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Mouse V1 chronic recordings',
      license: 'CC-BY-4.0',
      isPublished: true,
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Mouse V1 chronic recordings/ }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('CC-BY-4.0')).toBeInTheDocument();
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
  });

  it('renders the byline (contributors + date + DOI) when present', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Whatever',
      contributors: [
        { firstName: 'Audri', lastName: 'B' },
        { firstName: 'Steve', lastName: 'V' },
      ],
      uploadedAt: '2026-04-25T00:00:00.000Z',
      doi: 'https://doi.org/10.63884/abc',
      isPublished: true,
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Audri B, Steve V/)).toBeInTheDocument();
    });
    expect(screen.getByText(/doi\.org\/10\.63884\/abc/)).toBeInTheDocument();
  });

  it('renders a non-original branch badge when present', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Branched dataset',
      branchName: 'v2-revision',
      isPublished: true,
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('v2-revision')).toBeInTheDocument();
    });
  });
});

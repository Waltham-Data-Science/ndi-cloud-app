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
    // License renders in two places per source: the badge row above the
    // h1 AND the HeroFact strip below the byline. `getAllByText` covers
    // both — at least the badge-row one must be present.
    expect(screen.getAllByText('CC-BY-4.0').length).toBeGreaterThanOrEqual(1);
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

  /**
   * HeroFact strip — Phase 6.6 REBUILD-2.
   *
   * The fact strip is a `<dl>` below the byline showing quick-glance
   * counts/labels (species, region, documents, subjects, size, license).
   * Each <dt>/<dd> pair only renders when the corresponding field is
   * present on the dataset payload — the entire <dl> is hidden when no
   * facts are available so a fact-less dataset doesn't show an empty
   * decorative bar.
   */
  it('renders the HeroFact strip with all six facts when present', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Full-fact dataset',
      species: 'Mus musculus',
      brainRegions: 'V1, M1',
      documentCount: 412,
      numberOfSubjects: 17,
      totalSize: 2_400_000_000, // ~2.24 GB
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
      expect(screen.getByText('Species')).toBeInTheDocument();
    });
    expect(screen.getByText('Mus musculus')).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('V1, M1')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('Subjects')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    // Size formatted via formatBytes — matches the lib/format.ts contract.
    expect(screen.getByText(/GB$/)).toBeInTheDocument();
    // License appears twice — once in the badge row above the h1, once
    // in the fact strip dt/dd. The single `getByText` would throw on
    // multiple matches, so use `getAllByText`.
    const licenseHits = screen.getAllByText('CC-BY-4.0');
    expect(licenseHits.length).toBeGreaterThanOrEqual(2);
  });

  it('omits the HeroFact strip entirely when no facts are present', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Bare-bones dataset',
      isPublished: true,
      // No species/brainRegions/documentCount/numberOfSubjects/totalSize/license.
    });
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Bare-bones dataset/ }),
      ).toBeInTheDocument();
    });
    // The <dl> should NOT be rendered at all when no facts are available.
    expect(container.querySelector('dl')).toBeNull();
  });

  // Audit 2026-04-27 #18 (design call) — when fewer than 4 facts are
  // populated, center-justify the strip so it doesn't sit awkwardly
  // aligned-left next to the wide hero. Reikersdorfer-style 2-fact
  // datasets get justify-center; Sophie-style 5-fact datasets stay
  // justify-start.
  it('center-justifies the HeroFact strip when fewer than 4 facts are populated', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Sparse dataset',
      documentCount: 12,
      totalSize: 1_000_000,
      // Only 2 facts populated (documents + size).
      isPublished: true,
    });
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Documents')).toBeInTheDocument();
    });
    const dl = container.querySelector('dl[data-fact-count]');
    expect(dl).not.toBeNull();
    expect(dl?.getAttribute('data-fact-count')).toBe('2');
    expect(dl?.className).toMatch(/justify-center/);
    expect(dl?.className).not.toMatch(/justify-start/);
  });

  it('left-justifies the HeroFact strip when 4+ facts are populated', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Rich dataset',
      species: 'Mus musculus',
      brainRegions: 'V1',
      documentCount: 412,
      numberOfSubjects: 17,
      totalSize: 1_000_000,
      // 5 facts populated.
      isPublished: true,
    });
    const Wrapper = withClient();
    const { container } = render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('Subjects')).toBeInTheDocument();
    });
    const dl = container.querySelector('dl[data-fact-count]');
    expect(dl?.getAttribute('data-fact-count')).toBe('5');
    expect(dl?.className).toMatch(/justify-start/);
    expect(dl?.className).not.toMatch(/justify-center/);
  });
});

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
  // 2026-04-28 — Species + Region facts dropped from the hero (team
  // review feedback: they were duplicated by the auto-derived
  // ontology pills in the Overview tab's DatasetSummaryCard, and
  // the manually-entered hero values weren't accurate). This test
  // pins the new "four facts max" hero contract: Documents,
  // Subjects, Size, License — the cardinal facts that don't have
  // a richer surface elsewhere.
  it('renders the HeroFact strip with the four cardinal facts (no Species / Region)', async () => {
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
      expect(screen.getByText('Documents')).toBeInTheDocument();
    });
    // Species / Region are no longer in the hero — they belong to
    // the Overview tab's auto-derived ontology pills.
    expect(screen.queryByText('Species')).not.toBeInTheDocument();
    expect(screen.queryByText('Region')).not.toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('Subjects')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText(/GB$/)).toBeInTheDocument();
    // License appears twice — once in the badge row above the h1, once
    // in the fact strip dt/dd.
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

  // Team review 2026-04-28 — Griswold-style datasets (3 facts:
  // Documents / Size / License, no numberOfSubjects) were rendering
  // with the row centered inside its max-w-3xl dl, which made the
  // items appear "indented and floating" relative to the h1. The
  // earlier audit #18 heuristic (justify-center when fact count <
  // 4) is reverted — the strip now always left-aligns with the
  // hero title, irrespective of fact count.
  it('left-justifies the HeroFact strip with a Griswold-style 3-fact dataset (Documents / Size / License)', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      // Shape mirrors production dataset 68839b1fbf243809c0800a01
      // (Griswold/Van Hooser 2025): Documents + Size + License are
      // populated, but numberOfSubjects is null. Pre-fix this
      // rendered with `justify-center` and the items started ~250px
      // to the right of the h1.
      id: 'd1',
      name: 'Griswold-style dataset',
      documentCount: 101396,
      totalSize: 188467208494,
      license: 'CC-BY-4.0',
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
    expect(dl?.getAttribute('data-fact-count')).toBe('3');
    expect(dl?.className).toMatch(/justify-start/);
    expect(dl?.className).not.toMatch(/justify-center/);
  });

  it('left-justifies the HeroFact strip when only 2 facts are populated', async () => {
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
    expect(dl?.className).toMatch(/justify-start/);
    expect(dl?.className).not.toMatch(/justify-center/);
  });

  it('left-justifies the HeroFact strip when 4+ facts are populated', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Rich dataset',
      // Species + brainRegions ignored by the hero post-2026-04-28
      // (see "four cardinal facts" comment above). To get 4+ facts
      // populated we now need Documents / Subjects / Size / License
      // since species/region don't count toward the strip.
      documentCount: 412,
      numberOfSubjects: 17,
      totalSize: 1_000_000,
      license: 'CC-BY-4.0',
      // 4 facts populated.
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
    expect(dl?.getAttribute('data-fact-count')).toBe('4');
    expect(dl?.className).toMatch(/justify-start/);
    expect(dl?.className).not.toMatch(/justify-center/);
  });
});

describe('DatasetDetailHero — License unspecified badge (audit #19)', () => {
  // Audit 2026-04-27 #19 (design call) — when the cloud record has
  // no license set, render a quiet "License unspecified" badge
  // instead of leaving the badge row with just the status pill.
  // The placeholder badge gives the user an explicit hand-off
  // ("ask the author") rather than an ambiguous absence.

  it('renders a "License unspecified" badge when the dataset has no license', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'No-license dataset',
      isPublished: true,
      // No license field.
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText(/License unspecified/i)).toBeInTheDocument();
    });
  });

  it('does NOT render the placeholder when a real license is set', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Real-license dataset',
      isPublished: true,
      license: 'CC0-1.0',
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    // License "CC0-1.0" appears in two places: the badge row above
    // the h1 AND the HeroFact strip below the byline. Using
    // getAllByText avoids the ambiguity-error from getByText.
    await waitFor(() => {
      expect(screen.getAllByText('CC0-1.0').length).toBeGreaterThanOrEqual(1);
    });
    expect(
      screen.queryByText(/License unspecified/i),
    ).not.toBeInTheDocument();
  });

  it('does NOT render the placeholder on a draft dataset', async () => {
    // Draft pill carries the visibility story — adding "License
    // unspecified" on top would clutter without telling the user
    // anything they don't already know from the Draft badge.
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Draft dataset',
      isPublished: false,
    });
    const Wrapper = withClient();
    render(
      <Wrapper>
        <DatasetDetailHero datasetId="d1" />
      </Wrapper>,
    );
    // "Draft" matches both the badge text "● Draft" and the
    // dataset name "Draft dataset". getAllByText is fine here —
    // we just need the badge to exist somewhere.
    await waitFor(() => {
      expect(screen.getAllByText(/Draft/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(
      screen.queryByText(/License unspecified/i),
    ).not.toBeInTheDocument();
  });
});

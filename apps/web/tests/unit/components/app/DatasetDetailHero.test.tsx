/**
 * DatasetDetailHero — async Server Component coverage.
 *
 * Pre-fix: the hero was a `'use client'` component using TanStack Query;
 * tests mocked `apiFetch` to drive the loading / error / success
 * branches. As of the Apr 2026 SEO refactor the hero is async RSC and
 * awaits `safeFetchDataset` server-side so the H1 + byline ship in the
 * SSR'd HTML (visible to crawlers and link-preview generators). Tests
 * now mock `safeFetchDataset` per case and render the awaited React
 * tree.
 *
 * The branches we cover:
 *
 *   - Fetch returns null → `<h1>{datasetId}</h1>` fallback (preserves
 *     pre-fix behavior on slow / unreachable Railway).
 *   - Fetch returns full record → name + license badge + byline + DOI
 *     + four cardinal facts.
 *   - License variants: real license, missing license (placeholder
 *     badge), draft (placeholder skipped).
 *   - HeroFact strip: 3-fact (Griswold-style) and 4-fact left-justified
 *     contracts; absent when no facts populated.
 *   - Date label: "Published" prefix + tooltip pinning uploadedAt vs
 *     createdAt.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/api/datasets-server', () => ({
  safeFetchDataset: vi.fn(),
}));

import { DatasetDetailHero } from '@/components/app/DatasetDetailHero';
import { safeFetchDataset } from '@/lib/api/datasets-server';
import type { DatasetRecord } from '@/lib/api/datasets';

const mockedFetch = vi.mocked(safeFetchDataset);

beforeEach(() => {
  mockedFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Render an async Server Component result by awaiting the function call. */
async function renderHero(datasetId: string) {
  const result = await DatasetDetailHero({ datasetId });
  return render(result);
}

describe('DatasetDetailHero (async RSC)', () => {
  it('falls back to the dataset id as heading when fetch returns null', async () => {
    mockedFetch.mockResolvedValueOnce(null);
    await renderHero('d-broken');
    expect(
      screen.getByRole('heading', { name: 'd-broken' }),
    ).toBeInTheDocument();
  });

  it('renders dataset name + license badge when fetch resolves', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Mouse V1 chronic recordings',
      license: 'CC-BY-4.0',
      isPublished: true,
    } as DatasetRecord);
    await renderHero('d1');
    expect(
      screen.getByRole('heading', { name: /Mouse V1 chronic recordings/ }),
    ).toBeInTheDocument();
    // License renders in two places: the badge row above the h1 AND the
    // HeroFact strip below the byline.
    expect(screen.getAllByText('CC-BY-4.0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
  });

  it('renders the byline (contributors + date + DOI) when present', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Whatever',
      contributors: [
        { firstName: 'Audri', lastName: 'B' },
        { firstName: 'Steve', lastName: 'V' },
      ],
      uploadedAt: '2026-04-25T00:00:00.000Z',
      doi: 'https://doi.org/10.63884/abc',
      isPublished: true,
    } as DatasetRecord);
    await renderHero('d1');
    expect(screen.getByText(/Audri B, Steve V/)).toBeInTheDocument();
    expect(screen.getByText(/doi\.org\/10\.63884\/abc/)).toBeInTheDocument();
  });

  it('renders the hero date with a visible "Published" label', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Labeled-date dataset',
      uploadedAt: '2025-06-17T12:00:00.000Z',
      isPublished: true,
    } as DatasetRecord);
    const { container } = await renderHero('d1');
    expect(screen.getByText(/Jun 17, 2025/i)).toBeInTheDocument();
    const dateWrapper = container.querySelector('span[title*="uploadedAt"]');
    expect(dateWrapper).not.toBeNull();
    expect(dateWrapper?.textContent).toMatch(/Published\s+Jun 17, 2025/);
  });

  it('uses the createdAt field meaning in the title tooltip when uploadedAt is missing', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'CreatedAt-only dataset',
      createdAt: '2024-03-08T12:00:00.000Z',
      isPublished: true,
    } as DatasetRecord);
    const { container } = await renderHero('d1');
    expect(screen.getByText(/Mar 8, 2024/i)).toBeInTheDocument();
    const tooltipNode = container.querySelector('span[title*="createdAt"]');
    expect(tooltipNode).not.toBeNull();
  });

  it('renders a non-original branch badge when present', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Branched dataset',
      branchName: 'v2-revision',
      isPublished: true,
    } as DatasetRecord);
    await renderHero('d1');
    expect(screen.getByText('v2-revision')).toBeInTheDocument();
  });

  it('renders the HeroFact strip with the four cardinal facts (no Species / Region)', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Full-fact dataset',
      species: 'Mus musculus',
      brainRegions: 'V1, M1',
      documentCount: 412,
      numberOfSubjects: 17,
      totalSize: 2_400_000_000,
      license: 'CC-BY-4.0',
      isPublished: true,
    } as DatasetRecord);
    await renderHero('d1');
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.queryByText('Species')).not.toBeInTheDocument();
    expect(screen.queryByText('Region')).not.toBeInTheDocument();
    expect(screen.getByText('412')).toBeInTheDocument();
    expect(screen.getByText('Subjects')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText(/GB$/)).toBeInTheDocument();
    const licenseHits = screen.getAllByText('CC-BY-4.0');
    expect(licenseHits.length).toBeGreaterThanOrEqual(2);
  });

  it('omits the HeroFact strip entirely when no facts are present', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Bare-bones dataset',
      isPublished: true,
    } as DatasetRecord);
    const { container } = await renderHero('d1');
    expect(
      screen.getByRole('heading', { name: /Bare-bones dataset/ }),
    ).toBeInTheDocument();
    expect(container.querySelector('dl')).toBeNull();
  });

  it('left-justifies the HeroFact strip with a Griswold-style 3-fact dataset', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Griswold-style dataset',
      documentCount: 101396,
      totalSize: 188467208494,
      license: 'CC-BY-4.0',
      isPublished: true,
    } as DatasetRecord);
    const { container } = await renderHero('d1');
    expect(screen.getByText('Documents')).toBeInTheDocument();
    const dl = container.querySelector('dl[data-fact-count]');
    expect(dl).not.toBeNull();
    expect(dl?.getAttribute('data-fact-count')).toBe('3');
    expect(dl?.className).toMatch(/justify-start/);
    expect(dl?.className).not.toMatch(/justify-center/);
  });

  it('left-justifies the HeroFact strip when only 2 facts are populated', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Sparse dataset',
      documentCount: 12,
      totalSize: 1_000_000,
      isPublished: true,
    } as DatasetRecord);
    const { container } = await renderHero('d1');
    expect(screen.getByText('Documents')).toBeInTheDocument();
    const dl = container.querySelector('dl[data-fact-count]');
    expect(dl).not.toBeNull();
    expect(dl?.getAttribute('data-fact-count')).toBe('2');
    expect(dl?.className).toMatch(/justify-start/);
    expect(dl?.className).not.toMatch(/justify-center/);
  });

  it('left-justifies the HeroFact strip when 4+ facts are populated', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Rich dataset',
      documentCount: 412,
      numberOfSubjects: 17,
      totalSize: 1_000_000,
      license: 'CC-BY-4.0',
      isPublished: true,
    } as DatasetRecord);
    const { container } = await renderHero('d1');
    expect(screen.getByText('Subjects')).toBeInTheDocument();
    const dl = container.querySelector('dl[data-fact-count]');
    expect(dl?.getAttribute('data-fact-count')).toBe('4');
    expect(dl?.className).toMatch(/justify-start/);
    expect(dl?.className).not.toMatch(/justify-center/);
  });
});

describe('DatasetDetailHero — License unspecified badge (audit #19)', () => {
  it('renders a "License unspecified" badge when the dataset has no license', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'No-license dataset',
      isPublished: true,
    } as DatasetRecord);
    await renderHero('d1');
    expect(screen.getByText(/License unspecified/i)).toBeInTheDocument();
  });

  it('does NOT render the placeholder when a real license is set', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Real-license dataset',
      isPublished: true,
      license: 'CC0-1.0',
    } as DatasetRecord);
    await renderHero('d1');
    expect(screen.getAllByText('CC0-1.0').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/License unspecified/i)).not.toBeInTheDocument();
  });

  it('does NOT render the placeholder on a draft dataset', async () => {
    mockedFetch.mockResolvedValueOnce({
      id: 'd1',
      name: 'Draft dataset',
      isPublished: false,
    } as DatasetRecord);
    await renderHero('d1');
    expect(screen.getAllByText(/Draft/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/License unspecified/i)).not.toBeInTheDocument();
  });
});

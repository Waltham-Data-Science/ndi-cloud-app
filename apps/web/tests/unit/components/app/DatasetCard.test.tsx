/**
 * DatasetCard — wide-format catalog row.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/datasets/DatasetCard.test.tsx`.
 * Substitutions: drop `<MemoryRouter>` wrapper (Next.js doesn't need a
 * router context for `next/link` in tests); update the expected link
 * target from `/datasets/DS1` to `/datasets/DS1/overview` (the monorepo
 * routes detail tabs as nested URLs, with `/datasets/[id]` redirecting
 * to `./overview`).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { DatasetRecord } from '@/lib/api/datasets';
import type { CompactDatasetSummary } from '@/lib/types/dataset-summary';

import { DatasetCard } from '@/components/app/DatasetCard';

function baseDataset(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'DS1',
    name: 'A Testing Dataset',
    abstract: 'Experimental data from rats and mice.',
    license: 'CC-BY-4.0',
    organizationId: 'org-abc-123',
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    documentCount: 123,
    ...overrides,
  };
}

function compactSummary(
  overrides: Partial<CompactDatasetSummary> = {},
): CompactDatasetSummary {
  return {
    datasetId: 'DS1',
    counts: { subjects: 5, totalDocuments: 120 },
    species: [{ label: 'Rattus norvegicus', ontologyId: 'NCBITaxon:10116' }],
    brainRegions: [
      { label: 'primary visual cortex', ontologyId: 'UBERON:0002436' },
    ],
    citation: {
      title: 'A Testing Dataset',
      license: 'CC-BY-4.0',
      datasetDoi: 'https://doi.org/10.63884/xyz',
      year: 2025,
    },
    schemaVersion: 'summary:v1',
    ...overrides,
  };
}

describe('DatasetCard — wide-format card', () => {
  it('renders the title, abstract, and license badge', () => {
    render(<DatasetCard dataset={baseDataset({ summary: compactSummary() })} />);
    expect(
      screen.getByRole('heading', { name: 'A Testing Dataset' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Experimental data from rats and mice\./i),
    ).toBeInTheDocument();
    expect(screen.getByText('CC-BY-4.0')).toBeInTheDocument();
  });

  it('renders the published status pill', () => {
    render(<DatasetCard dataset={baseDataset({ summary: compactSummary() })} />);
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
  });

  it('prefers summary.species over dataset.species in the Species cell', () => {
    render(
      <DatasetCard
        dataset={baseDataset({
          species: 'Mus musculus',
          summary: compactSummary({
            species: [
              { label: 'Rattus norvegicus', ontologyId: 'NCBITaxon:10116' },
            ],
          }),
        })}
      />,
    );
    expect(screen.getByText('Rattus norvegicus')).toBeInTheDocument();
    expect(screen.queryByText('Mus musculus')).not.toBeInTheDocument();
  });

  it('falls back to dataset.species when no summary is attached', () => {
    render(
      <DatasetCard
        dataset={baseDataset({ species: 'Mus musculus', summary: null })}
      />,
    );
    expect(screen.getByText('Mus musculus')).toBeInTheDocument();
  });

  it('prefers summary.counts.totalDocuments over dataset.documentCount', () => {
    render(
      <DatasetCard
        dataset={baseDataset({
          documentCount: 123,
          summary: compactSummary({
            counts: { subjects: 5, totalDocuments: 999 },
          }),
        })}
      />,
    );
    expect(screen.getByText('999')).toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();
  });

  it('falls back to dataset.documentCount when summary is null', () => {
    render(<DatasetCard dataset={baseDataset({ summary: null })} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('falls back to dataset.documentCount when summary is undefined (pre-B2 backend)', () => {
    render(<DatasetCard dataset={baseDataset()} />);
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('surfaces the Subjects MetaCell only when summary.counts.subjects > 0', () => {
    const { rerender } = render(
      <DatasetCard
        dataset={baseDataset({
          summary: compactSummary({
            counts: { subjects: 5, totalDocuments: 120 },
          }),
        })}
      />,
    );
    expect(screen.getByText('Subjects')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    rerender(
      <DatasetCard
        dataset={baseDataset({
          summary: compactSummary({
            counts: { subjects: 0, totalDocuments: 120 },
          }),
        })}
      />,
    );
    expect(screen.queryByText('Subjects')).not.toBeInTheDocument();
  });

  it('renders the DOI MetaCell without the https:// prefix when present', () => {
    render(
      <DatasetCard
        dataset={baseDataset({ doi: 'https://doi.org/10.63884/xyz' })}
      />,
    );
    expect(screen.getByText('doi.org/10.63884/xyz')).toBeInTheDocument();
  });

  it('shows em-dash placeholders when a MetaCell has no data', () => {
    render(
      <DatasetCard
        dataset={baseDataset({
          species: undefined,
          brainRegions: undefined,
          summary: null,
        })}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('wraps the entire card in a single Link to /datasets/[id]/overview', () => {
    render(<DatasetCard dataset={baseDataset({ summary: compactSummary() })} />);
    const link = screen.getByRole('link', {
      name: /open dataset A Testing Dataset/i,
    });
    expect(link).toHaveAttribute('href', '/datasets/DS1/overview');
  });
});

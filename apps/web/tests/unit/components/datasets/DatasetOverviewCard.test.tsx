/**
 * DatasetOverviewCard — focused tests for the metadata table.
 *
 * Audit 2026-04-27 #23 — pre-fix the "Org" row rendered the cloud
 * record's `organizationId` directly, which is a Mongo ObjectId
 * (24-hex). End users see "Org 649b1b1bea20f31db68d4f9f" — meaningless.
 * The fix hides the row when the value LOOKS like an ObjectId, but
 * passes through human-readable slugs / names unchanged so a future
 * backend that ships a name keeps rendering. This file pins that
 * matrix.
 *
 * 2026-04-28 (round 2) — extended to cover the metadata block
 * restructure (DOI / NDI / Created / Updated) and the Associated
 * publications hyperlink fixes.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { DatasetOverviewCard } from '@/components/datasets/DatasetOverviewCard';
import type { DatasetRecord } from '@/lib/api/datasets';

function baseDataset(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'DS1',
    name: 'A Testing Dataset',
    abstract: 'Synthetic abstract.',
    isPublished: true,
    ...overrides,
  };
}

describe('DatasetOverviewCard — Org row (audit #23)', () => {
  it('hides the Org row when organizationId looks like a Mongo ObjectId', () => {
    render(
      <DatasetOverviewCard
        ds={baseDataset({ organizationId: '649b1b1bea20f31db68d4f9f' })}
        datasetId="DS1"
      />,
    );
    // The 24-hex ObjectId must NOT appear in the body.
    expect(
      screen.queryByText('649b1b1bea20f31db68d4f9f'),
    ).not.toBeInTheDocument();
    // The "Org" dt label is also suppressed when the value is hidden.
    expect(screen.queryByText('Org')).not.toBeInTheDocument();
  });

  it('renders the Org row when organizationId is a human-readable slug', () => {
    render(
      <DatasetOverviewCard
        ds={baseDataset({ organizationId: 'walthamdatascience' })}
        datasetId="DS1"
      />,
    );
    expect(screen.getByText('Org')).toBeInTheDocument();
    expect(screen.getByText('walthamdatascience')).toBeInTheDocument();
  });

  it('renders the Org row when organizationId is a hyphenated name', () => {
    render(
      <DatasetOverviewCard
        ds={baseDataset({ organizationId: 'brandeis-lab' })}
        datasetId="DS1"
      />,
    );
    expect(screen.getByText('brandeis-lab')).toBeInTheDocument();
  });

  it('hides the Org row when organizationId is missing entirely', () => {
    render(<DatasetOverviewCard ds={baseDataset()} datasetId="DS1" />);
    expect(screen.queryByText('Org')).not.toBeInTheDocument();
  });
});

describe('DatasetOverviewCard — metadata block (round 2)', () => {
  it('renders the dataset DOI as a doi.org hyperlink even when the cloud emits a bare DOI', () => {
    render(
      <DatasetOverviewCard
        ds={baseDataset({ doi: '10.63884/ndic.2025.jyxfer8m' })}
        datasetId="DS1"
      />,
    );
    const doiLink = screen.getByRole('link', { name: /10\.63884\/ndic\.2025\.jyxfer8m/ });
    expect(doiLink.getAttribute('href')).toBe(
      'https://doi.org/10.63884/ndic.2025.jyxfer8m',
    );
  });

  it('renders the NDI dataset ID inline with a copy button', () => {
    render(
      <DatasetOverviewCard
        ds={baseDataset()}
        datasetId="67f723d574f5f79c6062389d"
      />,
    );
    // The id appears as inline mono text inside the metadata grid.
    expect(
      screen.getByText('67f723d574f5f79c6062389d'),
    ).toBeInTheDocument();
    // A copy button targets the dataset id specifically (not, e.g.,
    // a separate footer copy button — the round-2 restructure
    // relocates it into the metadata block).
    expect(
      screen.getByRole('button', {
        name: /Copy NDI dataset ID 67f723d574f5f79c6062389d/i,
      }),
    ).toBeInTheDocument();
  });

  it('does not render a PubMed row in the dataset metadata block', () => {
    // Round-2 review: PubMed is paper-level, not dataset-level — moved
    // to Associated publications. The dataset metadata block must
    // not render the `PubMed` dt anymore.
    render(
      <DatasetOverviewCard
        ds={baseDataset({ pubMedId: '40471787' })}
        datasetId="DS1"
      />,
    );
    expect(screen.queryByText('PubMed')).not.toBeInTheDocument();
  });
});

describe('DatasetOverviewCard — Associated publications (round 2)', () => {
  it('hides the Associated publications heading entirely when no paper is set', () => {
    render(<DatasetOverviewCard ds={baseDataset()} datasetId="DS1" />);
    expect(
      screen.queryByText(/Associated publications/i),
    ).not.toBeInTheDocument();
  });

  it('links the paper title to https://doi.org/<paperDoi> instead of a relative origin URL', () => {
    // Round-2 review: the paper title hyperlink was broken — bare
    // `p.DOI` strings flowed through `safeHref` which resolved them
    // against `ndi-cloud.com`, producing
    // `https://ndi-cloud.com/10.1016/...`. Fix: normalize via
    // `toDoiUrl` so bare DOIs wrap to `https://doi.org/...`.
    render(
      <DatasetOverviewCard
        ds={baseDataset({
          associatedPublications: [
            {
              title: 'Name of paper',
              DOI: '10.1016/j.celrep.2025.115768',
              PMID: '40471787',
              PMCID: '12294564',
            },
          ],
        })}
        datasetId="DS1"
      />,
    );
    const titleLink = screen.getByRole('link', { name: 'Name of paper' });
    expect(titleLink.getAttribute('href')).toBe(
      'https://doi.org/10.1016/j.celrep.2025.115768',
    );
  });

  it('renders the DOI chip with the bare doi value as a doi.org hyperlink', () => {
    // 2026-04-29 (round 3) — chip refactored: the DOI/PMID/PMC labels
    // now sit OUTSIDE the link as gray text, so the link's accessible
    // name is the bare value only (e.g. "10.1016/j.celrep.2025.115768").
    // This makes the field boundaries visually clearer when multiple
    // chips render side-by-side.
    render(
      <DatasetOverviewCard
        ds={baseDataset({
          associatedPublications: [
            { title: 'p', DOI: '10.1016/j.celrep.2025.115768' },
          ],
        })}
        datasetId="DS1"
      />,
    );
    const doiChip = screen.getByRole('link', {
      name: /^10\.1016\/j\.celrep\.2025\.115768$/,
    });
    expect(doiChip.getAttribute('href')).toBe(
      'https://doi.org/10.1016/j.celrep.2025.115768',
    );
    // The "DOI" label sits adjacent to (but outside) the link.
    const doiLabel = screen.getAllByText('DOI');
    expect(doiLabel.length).toBeGreaterThan(0);
  });

  it('renders the PMID chip linking to pubmed.ncbi.nlm.nih.gov', () => {
    render(
      <DatasetOverviewCard
        ds={baseDataset({
          associatedPublications: [{ title: 'p', PMID: '40471787' }],
        })}
        datasetId="DS1"
      />,
    );
    // Link's accessible name is the bare PMID value; "PMID" is a
    // separate gray label adjacent to it.
    const pmidLink = screen.getByRole('link', { name: '40471787' });
    expect(pmidLink.getAttribute('href')).toBe(
      'https://pubmed.ncbi.nlm.nih.gov/40471787/',
    );
    expect(screen.getByText('PMID')).toBeInTheDocument();
  });

  it('force-prefixes PMC into the PMC URL when the field omits it', () => {
    // Round-2 review: PMC chip URL must always include the `PMC`
    // prefix so the link resolves; the cloud ships some records with
    // bare numeric PMCIDs. The visible link label is the BARE
    // numeric portion (the `PMC` is the gray label outside).
    render(
      <DatasetOverviewCard
        ds={baseDataset({
          associatedPublications: [{ title: 'p', PMCID: '12294564' }],
        })}
        datasetId="DS1"
      />,
    );
    const pmcLink = screen.getByRole('link', { name: '12294564' });
    expect(pmcLink.getAttribute('href')).toBe(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12294564/',
    );
    expect(screen.getByText('PMC')).toBeInTheDocument();
  });

  it('does not double-prefix when the cloud already ships PMC<n>', () => {
    render(
      <DatasetOverviewCard
        ds={baseDataset({
          associatedPublications: [{ title: 'p', PMCID: 'PMC12294564' }],
        })}
        datasetId="DS1"
      />,
    );
    const pmcLink = screen.getByRole('link', { name: '12294564' });
    expect(pmcLink.getAttribute('href')).toBe(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12294564/',
    );
    // The double-prefix guard means we never produce `PMCPMC...`
    // either as the href or as the visible label.
    expect(
      screen.queryByText(/PMCPMC/),
    ).not.toBeInTheDocument();
  });

  it('keeps DOI / PMID / PMC chips inside the publications section, not the dataset metadata', () => {
    // Smoke: the section header is its own H3, and the DOI/PMID/PMC
    // chips for the paper live inside that section's <ul>, not in
    // the dataset-level <dl>.
    render(
      <DatasetOverviewCard
        ds={baseDataset({
          doi: '10.63884/ndic.2025.jyxfer8m',
          associatedPublications: [
            {
              title: 'Paper title',
              DOI: '10.1016/j.celrep.2025.115768',
              PMID: '40471787',
              PMCID: '12294564',
            },
          ],
        })}
        datasetId="DS1"
      />,
    );
    const heading = screen.getByText(/Associated publications/i);
    const section = heading.parentElement;
    expect(section).not.toBeNull();
    const sectionScope = within(section as HTMLElement);
    // Section contains the bare-value link AND the gray label;
    // both should resolve via querying the section.
    expect(sectionScope.getByText('40471787')).toBeInTheDocument();
    expect(sectionScope.getByText('12294564')).toBeInTheDocument();
  });
});

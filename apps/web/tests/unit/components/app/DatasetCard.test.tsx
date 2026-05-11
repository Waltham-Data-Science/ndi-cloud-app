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
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { DatasetRecord } from '@/lib/api/datasets';
import type { CompactDatasetSummary } from '@/lib/types/dataset-summary';

// Mock `useLinkStatus` so tests can control the pending flag. The
// hook normally reads from Next.js's internal navigation state, which
// is only populated by an actual <Link> click. Default mock returns
// `{ pending: false }` so the existing static-render tests stay
// happy; the dedicated pending-state test below overrides per-call.
const useLinkStatusMock = vi.fn(() => ({ pending: false }));
vi.mock('next/link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/link')>();
  return {
    ...actual,
    useLinkStatus: () => useLinkStatusMock(),
  };
});

import { DatasetCard } from '@/components/app/DatasetCard';

beforeEach(() => {
  useLinkStatusMock.mockReturnValue({ pending: false });
});

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

  // Audit 2026-04-27 #16 — the card looked unclickable on dense
  // catalog layouts because the hover affordance was a 1 px Y-translate
  // + soft shadow, which was visually imperceptible. The fix is two-
  // fold: force `cursor-pointer` on the outer link (Safari/Firefox
  // briefly drop the default hand cursor during the navigation pending
  // state, especially on slow-cloud routes where the click→paint gap
  // is multi-second), and bolt a brand-tinted ring + larger shadow
  // onto the hover state. Tested at the class level so a future
  // refactor can't silently regress the affordance.
  it('forces cursor-pointer on the outer link to keep the hand cursor steady mid-click', () => {
    render(<DatasetCard dataset={baseDataset({ summary: compactSummary() })} />);
    const link = screen.getByRole('link', {
      name: /open dataset A Testing Dataset/i,
    });
    expect(link.className).toMatch(/cursor-pointer/);
  });

  // Audit 2026-04-27 #1 (take 2) — `useLinkStatus`-driven pending
  // state. Pre-fix, clicking a slow dataset (Sophie 101k docs) froze
  // the catalog for 6+ seconds with no visible feedback — the card
  // was loaded but unclickable-looking. The pending pill + dimmed
  // card make the click "land" instantly even though the actual
  // navigation completes seconds later.
  describe('pending-state visual feedback (audit #1, take 2)', () => {
    it('renders the "Loading…" pending pill when useLinkStatus reports pending', () => {
      useLinkStatusMock.mockReturnValue({ pending: true });
      render(<DatasetCard dataset={baseDataset({ summary: compactSummary() })} />);
      const pill = screen.getByTestId('dataset-card-pending');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent(/Loading/i);
      // role=status + aria-live for SR users.
      expect(pill).toHaveAttribute('role', 'status');
      expect(pill).toHaveAttribute('aria-live', 'polite');
    });

    it('does NOT render the pending pill when navigation is idle', () => {
      useLinkStatusMock.mockReturnValue({ pending: false });
      render(<DatasetCard dataset={baseDataset({ summary: compactSummary() })} />);
      expect(
        screen.queryByTestId('dataset-card-pending'),
      ).not.toBeInTheDocument();
    });

    it('marks the card aria-busy while pending', () => {
      useLinkStatusMock.mockReturnValue({ pending: true });
      const { container } = render(
        <DatasetCard dataset={baseDataset({ summary: compactSummary() })} />,
      );
      // The Card primitive carries aria-busy; query by attribute since
      // the role is implicit (div with no explicit role).
      const busy = container.querySelector('[aria-busy="true"]');
      expect(busy).not.toBeNull();
    });

    it('clears aria-busy when not pending (no aria-busy attribute, not aria-busy=false)', () => {
      // Avoid emitting `aria-busy="false"` — that's noise for SR users
      // when there's nothing busy. The component sets the attr to
      // `pending || undefined` so React drops it entirely on idle.
      useLinkStatusMock.mockReturnValue({ pending: false });
      const { container } = render(
        <DatasetCard dataset={baseDataset({ summary: compactSummary() })} />,
      );
      const anyBusy = container.querySelector('[aria-busy]');
      expect(anyBusy).toBeNull();
    });
  });

  // Hover-lift Tailwind-class assertions removed (test-suite audit
  // 2026-04-29). The previous test pinned `group-hover:ring-2`,
  // `group-hover:shadow-lg`, and `group-hover:-translate-y-[2px]`
  // against rendered HTML — visual-polish details that change every
  // Tailwind config tweak without affecting the user-visible
  // affordance contract. The `cursor-pointer` test above already
  // pins the clickable affordance; that's the load-bearing one.
});

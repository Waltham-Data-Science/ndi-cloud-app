/**
 * Stream 6.10 — DatasetHealthBadge tests.
 *
 * Catalog badge that surfaces when a dataset fails one of the
 * compact-safe invariants (totalDocuments > 0 with subjects = 0;
 * subjects present with empty species). Should render nothing on
 * healthy datasets so most cards stay clean.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  DatasetHealthBadge,
  computeCatalogViolations,
} from '@/components/datasets/DatasetHealthBadge';
import type { DatasetRecord } from '@/lib/api/datasets';
import type { CompactDatasetSummary } from '@/lib/types/dataset-summary';

function makeDataset(
  overrides: Partial<DatasetRecord> = {},
  summary: CompactDatasetSummary | null = null,
): DatasetRecord {
  // Minimal DatasetRecord — DatasetRecord has many optional/undefined
  // fields; the badge only reads `.id`, `.name`, and `.summary`. Cast
  // through unknown to avoid a strict assignment vs. the full
  // (mostly-optional) interface.
  const base = {
    id: 'ds-test',
    name: 'Test dataset',
    isPublished: true,
    branchName: 'main',
    ...(summary ? { summary } : {}),
    ...overrides,
  } as unknown as DatasetRecord;
  return base;
}

function makeCompactSummary(
  overrides: Partial<CompactDatasetSummary> = {},
): CompactDatasetSummary {
  return {
    datasetId: 'ds-test',
    counts: { subjects: 50, totalDocuments: 200 },
    species: [{ label: 'Caenorhabditis elegans', ontologyId: 'NCBITaxon:6239' }],
    brainRegions: [],
    citation: {
      title: 'Test',
      license: 'CC-BY-4.0',
      datasetDoi: null,
      year: 2026,
    },
    schemaVersion: 'summary:v1',
    ...overrides,
  };
}

describe('<DatasetHealthBadge/>', () => {
  it('renders nothing for healthy datasets', () => {
    const dataset = makeDataset({}, makeCompactSummary());
    const { container } = render(<DatasetHealthBadge dataset={dataset} />);
    // No badge — entire component returns null.
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when summary is missing', () => {
    // Catalog rows where the synthesizer hasn't run yet have
    // `summary === undefined`. Don't badge them — the dataset's
    // own "Processing" pill already explains the state.
    const dataset = makeDataset({}, null);
    const { container } = render(<DatasetHealthBadge dataset={dataset} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders critical chip when totalDocuments > 0 but subjects = 0', () => {
    const dataset = makeDataset(
      {},
      makeCompactSummary({
        counts: { subjects: 0, totalDocuments: 1234 },
      }),
    );
    render(<DatasetHealthBadge dataset={dataset} />);
    const chip = screen.getByTestId('dataset-health-badge');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-severity', 'critical');
    expect(chip).toHaveTextContent(/health check/i);
    // Tooltip carries the underlying violation message.
    expect(chip.getAttribute('title')).toContain('0 subjects');
  });

  it('renders warning chip when subjects > 0 but species empty', () => {
    const dataset = makeDataset(
      {},
      makeCompactSummary({
        species: [],
        counts: { subjects: 215, totalDocuments: 5708 },
      }),
    );
    render(<DatasetHealthBadge dataset={dataset} />);
    const chip = screen.getByTestId('dataset-health-badge');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-severity', 'warning');
    expect(chip).toHaveTextContent(/data note/i);
  });

  it('renders highest-severity label when multiple violations stack', () => {
    // 0 subjects AND empty species AND 1234 docs → critical wins.
    const dataset = makeDataset(
      {},
      makeCompactSummary({
        species: [],
        counts: { subjects: 0, totalDocuments: 1234 },
      }),
    );
    render(<DatasetHealthBadge dataset={dataset} />);
    const chip = screen.getByTestId('dataset-health-badge');
    expect(chip).toHaveAttribute('data-severity', 'critical');
  });

  it('honors enabled=false even when violations exist', () => {
    const dataset = makeDataset(
      {},
      makeCompactSummary({
        counts: { subjects: 0, totalDocuments: 100 },
      }),
    );
    const { container } = render(
      <DatasetHealthBadge dataset={dataset} enabled={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('computeCatalogViolations returns [] when summary missing', () => {
    expect(computeCatalogViolations(makeDataset({}, null))).toEqual([]);
  });

  it('computeCatalogViolations fires the docs>0 subjects=0 rule', () => {
    const violations = computeCatalogViolations(
      makeDataset(
        {},
        makeCompactSummary({
          counts: { subjects: 0, totalDocuments: 100 },
        }),
      ),
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.find((v) => v.key === 'totalDocuments_implies_subjects'),
    ).toBeDefined();
  });
});

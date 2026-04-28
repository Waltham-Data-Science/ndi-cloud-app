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
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

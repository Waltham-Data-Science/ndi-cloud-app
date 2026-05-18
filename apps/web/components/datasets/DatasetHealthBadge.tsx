'use client';

/**
 * DatasetHealthBadge — catalog-card chip for datasets that fail one
 * or more health invariants.
 *
 * Stream 6.10 deliverable (2026-05-15). Consumes
 * `lib/data-quality/invariants.ts`. Two surfaces:
 *
 *   1. Catalog (this component) — computes invariants ON THE FLY from
 *      the compact summary attached to each catalog row. Renders only
 *      when ≥1 violation is detected; renders nothing otherwise so
 *      healthy cards stay clean. Critical violations trigger an amber
 *      pill; warning + info trigger a softer blue pill.
 *   2. Admin `/admin/data-health` (Stream 6.9 — future) — runs the
 *      full invariant set against the rich summary and renders a
 *      table view of all violations across the catalog.
 *
 * Why compute on the fly here instead of reading from a pre-computed
 * `dataset_health` table: the cron + Postgres table (Stream 6.8) is
 * deferred. Once it lands, this component can swap to reading from
 * the stored snapshot without a UI change — the props stay the same
 * (we just pre-compute the violations server-side).
 */
import { AlertTriangle, Info } from 'lucide-react';

import {
  checkCompactDatasetHealth,
  worstSeverity,
  type Severity,
  type Violation,
} from '@/lib/data-quality/invariants';
import type { DatasetRecord } from '@/lib/api/datasets';

export interface DatasetHealthBadgeProps {
  dataset: DatasetRecord;
  /**
   * When true (default), the badge runs invariants AND renders the chip.
   * Pass false to hide the badge in surfaces where it would distract
   * (e.g. the `/my` "your datasets" tab where draft datasets are
   * still being processed by design).
   */
  enabled?: boolean;
}

export function DatasetHealthBadge({
  dataset,
  enabled = true,
}: DatasetHealthBadgeProps) {
  if (!enabled) return null;

  const violations = computeCatalogViolations(dataset);
  if (violations.length === 0) return null;

  const severity = worstSeverity(violations);
  return <BadgeChip severity={severity} violations={violations} />;
}

/**
 * Compute the catalog-side violations for a single dataset. Exposed
 * for testing (the test renders the component AND directly asserts
 * the helper's output for the canonical cases — Mukherjee-like
 * subjects=0+docs>0, Bhar-like clean dataset, etc.).
 *
 * Returns `[]` when the dataset has no inlined summary (rendering
 * skipped entirely — see `DatasetHealthBadge`).
 */
export function computeCatalogViolations(
  dataset: DatasetRecord,
): Violation[] {
  const summary = dataset.summary ?? null;
  if (!summary) return [];

  // Translate the catalog's compact summary into the canonical
  // DatasetSummaryFacts shape the invariants module expects. Fields
  // not in the compact projection (elements, epochs, sessions,
  // classCounts, strains) are zero / empty — `checkCompactDatasetHealth`
  // only runs invariants that don't depend on them.
  return checkCompactDatasetHealth({
    datasetId: dataset.id,
    datasetName: dataset.name ?? dataset.id,
    species: (summary.species ?? []).map((s) => s.label),
    brainRegions: (summary.brainRegions ?? []).map((r) => r.label),
    strains: [],
    totalDocuments: summary.counts.totalDocuments,
    classCounts: {},
    derivedCounts: {
      sessions: 0,
      subjects: summary.counts.subjects,
      elements: 0,
      epochs: 0,
      probes: 0,
    },
  });
}

interface BadgeChipProps {
  severity: Severity | null;
  violations: readonly Violation[];
}

function BadgeChip({ severity, violations }: BadgeChipProps) {
  if (severity === null) return null;
  const palette = paletteFor(severity);
  const Icon = severity === 'info' ? Info : AlertTriangle;
  const messages = violations.map((v) => v.message).join('\n');

  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ' +
        'font-medium ring-1 ring-inset ' +
        palette
      }
      role="status"
      // Surface the full violation messages on hover for operators
      // skimming the catalog. The tooltip plus the chip label is
      // enough signal at the catalog tier; the deep-dive lives at
      // /admin/data-health (Stream 6.9).
      title={messages}
      data-testid="dataset-health-badge"
      data-severity={severity}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {severity === 'critical' ? 'Health check' : 'Data note'}
    </span>
  );
}

function paletteFor(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'bg-amber-50 text-amber-900 ring-amber-200';
    case 'warning':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
    case 'info':
      return 'bg-blue-50 text-blue-800 ring-blue-200';
  }
}

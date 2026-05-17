'use client';

/**
 * ElectrodePositionPanel — workspace panel for spatial electrode /
 * probe positions within a subject's brain. Auto-loads
 * `probe_location` documents on mount and renders an ML-vs-AP scatter
 * colored by depth or brain region.
 *
 * Pattern reference: DatasetStructurePanel (auto-loading, no Run
 * button). The panel exists to show WHAT'S in the dataset — there's
 * no user parameter to tune, so the form/Run scaffolding from
 * SignalViewerPanel doesn't fit here.
 *
 * Coordinate extraction is defensive: NDI datasets vary in how they
 * lay out probe coordinates. We try (in order) the nested `coordinates`
 * object, then flat x/y/z fields, then `ml`/`ap`/`dv` aliases. Docs
 * that fail every shape are silently dropped from the points array —
 * the panel surfaces the resulting count so curators can tell when
 * extraction misfired.
 *
 * Empty-state copy is intentionally educational: it explains WHAT
 * the panel needs (probe_location docs with coordinate fields) rather
 * than just saying "no data". The single consolidated Document
 * Explorer escape now lives in the picker rail footer (per the
 * one-canvas redesign 2026-05-16) — per-panel outbound links were
 * removed to keep the workspace contextual.
 */

import { MapPin } from 'lucide-react';
import { useMemo } from 'react';

import {
  ElectrodeMapChart,
  type ElectrodePositionPoint,
} from '@/components/ndi/charts/ElectrodeMapChart';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDocuments, type DocumentSummary } from '@/lib/api/documents';

import { PanelCard } from './PanelCard';
import { ShowCodeButton } from './ShowCodeButton';

interface ElectrodePositionPanelProps {
  datasetId: string;
}

/**
 * Pull a number out of an unknown value defensively. Strings that
 * parse cleanly (e.g. `"2400"`) are accepted because some NDI ingest
 * paths stringify coordinates. Anything else returns undefined so the
 * caller can fall through to alternate doc shapes.
 */
function asFiniteNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Pull a non-empty string out of an unknown value. Returns undefined
 * for anything else so caller branches stay simple.
 */
function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return undefined;
}

/**
 * Attempt to extract one ElectrodePositionPoint from a probe_location
 * document. Returns `null` when no coordinate-bearing shape matches —
 * the caller filters these out.
 *
 * Shapes tried, in order (most-specific first):
 *
 *   1. `data.probe_location.coordinates = { x, y, z? }` — the canonical
 *      ingest shape from the NDI Python converters.
 *   2. `data.probe_location.{x, y, z?}` — flat fields, seen on older
 *      datasets that were ingested before `coordinates` was wrapped.
 *   3. `data.probe_location.{ml, ap, dv}` — stereotaxic aliases used
 *      by some legacy converters (DV → z).
 */
function extractPoint(doc: DocumentSummary): ElectrodePositionPoint | null {
  const probe =
    (doc.data?.probe_location as Record<string, unknown> | undefined) ??
    undefined;
  if (!probe) return null;

  // Shape 1: nested coordinates object.
  const coords = probe.coordinates as Record<string, unknown> | undefined;
  let x: number | undefined;
  let y: number | undefined;
  let z: number | undefined;
  if (coords && typeof coords === 'object') {
    x = asFiniteNumber(coords.x);
    y = asFiniteNumber(coords.y);
    z = asFiniteNumber(coords.z);
  }

  // Shape 2: flat x/y/z fields on probe_location itself.
  if (x === undefined) x = asFiniteNumber(probe.x);
  if (y === undefined) y = asFiniteNumber(probe.y);
  if (z === undefined) z = asFiniteNumber(probe.z);

  // Shape 3: stereotaxic aliases ml/ap/dv.
  if (x === undefined) x = asFiniteNumber(probe.ml);
  if (y === undefined) y = asFiniteNumber(probe.ap);
  if (z === undefined) z = asFiniteNumber(probe.dv);

  if (x === undefined || y === undefined) return null;

  // Brain region: try ontology fields first, fall back to a plain name.
  const brainRegion =
    asNonEmptyString(probe.brain_region) ??
    asNonEmptyString(probe.ontology_term) ??
    asNonEmptyString(probe.ontology_name) ??
    asNonEmptyString(probe.region);

  // Label fallback chain: explicit name → first 8 chars of id → "probe".
  const id = doc.id ?? doc.ndiId ?? '';
  const fallbackId = id ? `${id.slice(0, 8)}…` : 'probe';
  const label = asNonEmptyString(doc.name) ?? fallbackId;

  return {
    label,
    x,
    y,
    ...(z !== undefined ? { z } : {}),
    ...(brainRegion ? { brainRegion } : {}),
  };
}

/**
 * Heuristically pull the subject id from a probe_location doc's
 * `depends_on` array. Used only for the panel title's "across M
 * subjects" suffix — when extraction fails we just omit the suffix.
 */
function extractSubjectId(doc: DocumentSummary): string | null {
  const depends = doc.data?.depends_on;
  if (!Array.isArray(depends)) return null;
  for (const dep of depends) {
    if (!dep || typeof dep !== 'object') continue;
    const name = (dep as Record<string, unknown>).name;
    if (
      typeof name === 'string' &&
      (name === 'subject_id' || name === 'openminds_subject_id' || name.endsWith('subject_id'))
    ) {
      const value = (dep as Record<string, unknown>).value;
      if (typeof value === 'string' && value.length > 0) return value;
    }
  }
  return null;
}

export function ElectrodePositionPanel({ datasetId }: ElectrodePositionPanelProps) {
  // Auto-load: same useDocuments hook the Document Explorer uses.
  // Page size 500 covers the largest probe_location populations we've
  // seen (Allen Institute Neuropixels datasets ~384 channels × a few
  // probes per subject); larger datasets get the first 500 + a soft
  // truncation note rather than crash.
  const { data, isLoading, isError } = useDocuments(
    datasetId,
    'probe_location',
    1,
    500,
  );

  const { points, subjectCount } = useMemo(() => {
    const docs = data?.documents ?? [];
    const ps: ElectrodePositionPoint[] = [];
    const subjects = new Set<string>();
    for (const doc of docs) {
      const p = extractPoint(doc);
      if (p) {
        ps.push(p);
        const sid = extractSubjectId(doc);
        if (sid) subjects.add(sid);
      }
    }
    return { points: ps, subjectCount: subjects.size };
  }, [data]);

  const totalDocs = data?.documents?.length ?? 0;
  const hasDocsButNoCoords = totalDocs > 0 && points.length === 0;
  const showChart = !isLoading && !isError && points.length > 0;

  // Title composes "Electrode positions — N probes" with an "across M
  // subjects" suffix when we could derive subject ids. When subject
  // extraction failed (no depends_on, or non-standard naming), we
  // fall back to the count-only form rather than show "across 0 subjects".
  const chartTitle = useMemo(() => {
    if (points.length === 0) return undefined;
    const base = `Electrode positions — ${points.length} probe${points.length === 1 ? '' : 's'}`;
    if (subjectCount > 0) {
      return `${base} across ${subjectCount} subject${subjectCount === 1 ? '' : 's'}`;
    }
    return base;
  }, [points.length, subjectCount]);

  return (
    <PanelCard
      icon={MapPin}
      title="Electrode positions"
      subtitle="Spatial map of probes / electrodes within a subject's brain. Colored by depth when present, otherwise by brain region."
      headingId="panel-electrode-positions"
      id="electrode-position"
      footer={
        <ShowCodeButton
          toolName="query_documents"
          args={{ datasetId, className: 'probe_location', limit: 500 }}
          disabled={!showChart}
        />
      }
    >
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      )}

      {/* Most "errors" from `useDocuments(probe_location)` are really
          "this dataset has no probe_location class" — the user reached
          this workspace by being signed in and on a valid dataset id,
          so "dataset may not exist or you may not have access" was
          alarming + misleading. Surface the empty-state copy instead.
          The original red-alert message is preserved as a fallback for
          genuine network failures (5xx); the empty-state covers 404s
          and empty 200s. */}
      {isError && !isLoading && <EmptyState reason="no-docs" />}

      {!isLoading && !isError && totalDocs === 0 && (
        <EmptyState reason="no-docs" />
      )}

      {!isLoading && !isError && hasDocsButNoCoords && (
        <EmptyState reason="no-coords" docCount={totalDocs} />
      )}

      {showChart && (
        <ElectrodeMapChart
          datasetId={datasetId}
          title={chartTitle}
          points={points}
        />
      )}
    </PanelCard>
  );
}

interface EmptyStateProps {
  reason: 'no-docs' | 'no-coords';
  docCount?: number;
}

/**
 * Empty-state copy. Two variants:
 *
 *   - no-docs   → the dataset has no probe_location docs at all
 *   - no-coords → docs exist but extract_point() returned null for all
 *                 of them (coordinates missing or in an unknown shape)
 *
 * Both variants explain WHAT is needed — the educational copy is the
 * load-bearing part since the workspace's single Document Explorer
 * escape now lives in the picker rail footer (one-canvas redesign
 * 2026-05-16). Per-panel "Open Document Explorer →" buttons were
 * removed to stop the user being dumped out of the workspace
 * contextually.
 */
function EmptyState({ reason, docCount }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="rounded-md border border-border-subtle bg-bg-canvas p-4 text-[13px] text-fg-secondary"
    >
      <p className="font-medium text-fg-primary">
        This dataset has no probe location data.
      </p>
      <p className="mt-1.5">
        {reason === 'no-docs' ? (
          <>
            Probe locations require <code className="font-mono text-[12px]">probe_location</code>{' '}
            documents with coordinate fields (either{' '}
            <code className="font-mono text-[12px]">data.probe_location.coordinates</code> or
            flat <code className="font-mono text-[12px]">x</code>/
            <code className="font-mono text-[12px]">y</code>/
            <code className="font-mono text-[12px]">z</code> fields).
          </>
        ) : (
          <>
            Found {docCount}{' '}
            <code className="font-mono text-[12px]">probe_location</code>{' '}
            document{docCount === 1 ? '' : 's'}, but none carried
            extractable coordinate fields. Coordinates can live under{' '}
            <code className="font-mono text-[12px]">data.probe_location.coordinates</code>{' '}
            or as flat <code className="font-mono text-[12px]">x</code>/
            <code className="font-mono text-[12px]">y</code>/
            <code className="font-mono text-[12px]">z</code>.
          </>
        )}
      </p>
    </div>
  );
}

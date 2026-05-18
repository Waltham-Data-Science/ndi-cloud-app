'use client';

/**
 * PatchClampStepFamilyPanel — workspace panel for visualizing
 * patch-clamp step-family recordings (Francesconi D8 tutorial).
 *
 * Background
 * ----------
 *
 * A "step family" is a series of voltage-clamp or current-clamp
 * sweeps recorded against a stepped stimulus (e.g., increasing current
 * injection per sweep). The raw recording concatenates all sweeps into
 * one timeseries with NaN gaps marking sweep boundaries. The canonical
 * visualization overlays every sweep on a common time axis, colored
 * by sweep index (and ideally by injected current step amplitude).
 *
 * This panel:
 *
 *   1. Fetches the raw signal via the existing `/api/datasets/:id/
 *      documents/:docId/signal` endpoint — same code path SignalChart
 *      uses, no backend change.
 *   2. Segments by NaN/null gaps via `segmentByNanGaps` (see the pure
 *      helper for edge-case coverage).
 *   3. Renders each sweep as a separate SVG polyline, overlaid on a
 *      single axes pair, colored along the viridis ramp from earliest
 *      sweep (deep blue) to latest (bright yellow).
 *
 * Form / selection wiring mirrors SignalViewerPanel exactly so users
 * who know one panel know all of them. Auto-fill from `selection.session`
 * with the 400ms debounced auto-run pattern.
 *
 * Sweeps ordering
 * ---------------
 *
 * Sweeps are ordered by recording order (the position in the raw
 * timeseries). A future iteration can rank by injected step amplitude
 * read from a sibling probe document; for now the recording-order
 * coloring matches what the MATLAB tutorial produces by default.
 */
import { LineChart } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Field } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';
import { apiFetch } from '@/lib/api/client';
import { isValidDocId } from '@/lib/workspace/doc-id-validation';
import {
  longestSweep,
  segmentByNanGaps,
  summarize,
  type Sweep,
} from '@/lib/workspace/segment-step-family';
import { viridis } from '@/lib/workspace/viridis';
import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

import { PanelCard } from './PanelCard';
import { PanelEmptyState } from './canvas/PanelEmptyState';
import { ShowCodeButton } from './ShowCodeButton';

interface PatchClampStepFamilyPanelProps {
  datasetId: string;
}

interface ChartPayload {
  datasetId: string;
  docId: string;
  downsample: number;
  file?: string;
  channelName?: string; // optional channel selector when the signal is multi-channel
}

interface SignalResponse {
  channels: Record<string, Array<number | null>>;
  timestamps?: number[] | null;
  sample_count: number;
  format: string;
  error?: string | null;
  errorKind?: string | null;
  source?: { doc_class: string | null; doc_name: string | null };
}

function parseIntOrUndefined(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function PatchClampStepFamilyPanel({
  datasetId,
}: PatchClampStepFamilyPanelProps) {
  const { selection } = useWorkspaceSelection();
  const pulse = usePanelChangeIndicator([selection.session]);

  const [docId, setDocId] = useState<string>(selection.session ?? '');
  const [downsample, setDownsample] = useState('2000');
  const [file, setFile] = useState('');
  const [channelName, setChannelName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAutoFilled, setIsAutoFilled] = useState<boolean>(
    selection.session !== null,
  );
  const [payload, setPayload] = useState<ChartPayload | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- selection-bar bridge to local form state */
  useEffect(() => {
    if (selection.session) {
      setDocId(selection.session);
      setIsAutoFilled(true);
    }
  }, [selection.session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const lastAutoRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAutoFilled) return;
    const id = docId.trim();
    if (!isValidDocId(id)) return;
    if (lastAutoRunRef.current === id) return;
    const ds = parseIntOrUndefined(downsample) ?? 2000;
    const handle = setTimeout(() => {
      lastAutoRunRef.current = id;
      setError(null);
      setPayload({
        datasetId,
        docId: id,
        downsample: ds,
        file: file.trim() || undefined,
        channelName: channelName.trim() || undefined,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [isAutoFilled, docId, downsample, file, channelName, datasetId]);

  function handleRun(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const id = docId.trim();
    if (!id) {
      setError('Document ID is required.');
      return;
    }
    if (!isValidDocId(id)) {
      setError(
        'Document ID must be a 24-char hex Mongo id OR a 16+16 hex NDI id.',
      );
      return;
    }
    const ds = parseIntOrUndefined(downsample);
    if (ds !== undefined && (ds < 100 || ds > 5000)) {
      setError('Downsample must be between 100 and 5000.');
      return;
    }
    lastAutoRunRef.current = id;
    setPayload({
      datasetId,
      docId: id,
      downsample: ds ?? 2000,
      file: file.trim() || undefined,
      channelName: channelName.trim() || undefined,
    });
  }

  function onDocIdChange(value: string) {
    setDocId(value);
    if (isAutoFilled && value !== selection.session) {
      setIsAutoFilled(false);
    }
  }

  const hasPayload = payload !== null;

  return (
    <PanelCard
      id="patch-clamp-step-family"
      pulse={pulse}
      title="Patch-clamp step family"
      subtitle="Overlay every sweep on a common time axis, colored by sweep index. NaN gaps in the raw signal mark sweep boundaries (current-clamp / voltage-clamp step protocols)."
      icon={LineChart}
    >
      <form onSubmit={handleRun} noValidate className="space-y-3">
        <Field
          label="Document ID"
          name="docId"
          required
          value={docId}
          onChange={(e) => onDocIdChange(e.target.value)}
          placeholder="Mongo _id (24 hex) or NDI ndiId (16+16 hex)"
          data-testid="patch-clamp-docid-input"
        />
        {isAutoFilled && selection.session && (
          <p className="text-[11px] text-fg-muted -mt-2" data-testid="patch-clamp-autofill-hint">
            Auto from session selection
          </p>
        )}

        <details className="text-[12px]">
          <summary className="cursor-pointer text-fg-muted hover:text-fg-secondary select-none">
            Advanced options
          </summary>
          <div className="mt-2 space-y-2">
            <Field
              label="Downsample (100-5000)"
              name="downsample"
              value={downsample}
              onChange={(e) => setDownsample(e.target.value)}
              placeholder="2000"
            />
            <Field
              label="File (optional)"
              name="file"
              value={file}
              onChange={(e) => setFile(e.target.value)}
              placeholder="leave blank to pick the default file"
            />
            <Field
              label="Channel name (optional)"
              name="channelName"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="leave blank to pick the first channel"
            />
          </div>
        </details>

        {error && (
          <p className="text-[12px] text-fg-error" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <MarketingButton type="submit" variant="cta" size="sm">
            Run
          </MarketingButton>
          <ShowCodeButton
            toolName="fetch_signal"
            args={{
              datasetId: payload?.datasetId ?? datasetId,
              docId: payload?.docId ?? '',
              downsample: payload?.downsample ?? 2000,
              ...(payload?.file && { file: payload.file }),
            }}
            disabled={!payload}
          />
        </div>
      </form>

      <div className="mt-4">
        {!hasPayload && (
          <PanelEmptyState
            illustration="line-trace"
            title="Run a step-family analysis"
            hint="Pick an element_epoch document containing a patch-clamp recording (current-step protocol) — the signal's NaN gaps mark sweep boundaries that this panel overlays."
            testId="patch-clamp-empty"
          />
        )}
        {hasPayload && payload && <StepFamilyChart payload={payload} />}
      </div>
    </PanelCard>
  );
}

interface StepFamilyChartProps {
  payload: ChartPayload;
}

const STALE_MS = 60_000;

function StepFamilyChart({ payload }: StepFamilyChartProps) {
  const url = useMemo(() => {
    const qs = new URLSearchParams({ downsample: String(payload.downsample) });
    if (payload.file) qs.set('file', payload.file);
    return `/api/datasets/${payload.datasetId}/documents/${payload.docId}/signal?${qs.toString()}`;
  }, [payload]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'patch-clamp-step-family',
      payload.datasetId,
      payload.docId,
      payload.downsample,
      payload.file ?? '',
    ],
    queryFn: ({ signal }) => apiFetch<SignalResponse>(url, { signal }),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 5,
    retry: 0,
  });

  const segments = useMemo<{
    sweeps: Sweep[];
    chosenChannel: string | null;
  }>(() => {
    if (!data || data.error) return { sweeps: [], chosenChannel: null };
    const channelNames = Object.keys(data.channels);
    if (channelNames.length === 0) return { sweeps: [], chosenChannel: null };
    const chosen =
      payload.channelName && data.channels[payload.channelName]
        ? payload.channelName
        : channelNames[0]!;
    const values = data.channels[chosen]!;
    // Build a synthetic time axis if the backend didn't ship one. Step
    // protocols typically have evenly-spaced samples so an integer
    // sample-index axis works fine when timestamps are missing — the
    // overlay's "time within sweep" labels still convey relative pacing.
    const time = data.timestamps ?? values.map((_, i) => i);
    const sweeps = segmentByNanGaps(time, values);
    return { sweeps, chosenChannel: chosen };
  }, [data, payload.channelName]);

  if (isLoading) {
    return (
      <div className="h-[280px] rounded-md border border-border-subtle bg-bg-canvas/30 grid place-items-center">
        <p className="text-[12px] text-fg-muted">Loading signal…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-fg-error/20 bg-fg-error/5 p-3" role="alert">
        <p className="text-[12px] text-fg-error">
          Couldn&rsquo;t load that signal. {error instanceof Error ? error.message : ''}
        </p>
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="rounded-md border border-border-subtle bg-bg-canvas/30 p-3">
        <p className="text-[12px] text-fg-secondary">Signal decode: {data.error}</p>
      </div>
    );
  }

  if (segments.sweeps.length < 2) {
    const wholeSig = segments.sweeps.length === 1;
    return (
      <div className="rounded-md border border-border-subtle bg-bg-canvas/30 p-4">
        <p className="text-[12px] text-fg-secondary">
          {wholeSig
            ? 'No step-family pattern detected — the signal is one continuous trace with no NaN gaps.'
            : 'No data in the selected channel.'}
        </p>
      </div>
    );
  }

  return <StepFamilySvg sweeps={segments.sweeps} channelName={segments.chosenChannel ?? ''} />;
}

interface StepFamilySvgProps {
  sweeps: Sweep[];
  channelName: string;
}

const SVG_WIDTH = 520;
const SVG_HEIGHT = 260;
const PADDING_LEFT = 44;
const PADDING_RIGHT = 12;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 28;

function StepFamilySvg({ sweeps, channelName }: StepFamilySvgProps) {
  const summary = summarize(sweeps);
  const longest = longestSweep(sweeps);
  const titleId = useId();

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let xMaxLocal = 0;
    let yMinLocal = Number.POSITIVE_INFINITY;
    let yMaxLocal = Number.NEGATIVE_INFINITY;
    for (const sweep of sweeps) {
      for (let i = 0; i < sweep.values.length; i++) {
        const t = sweep.time[i] ?? 0;
        const v = sweep.values[i]!;
        if (t > xMaxLocal) xMaxLocal = t;
        if (v < yMinLocal) yMinLocal = v;
        if (v > yMaxLocal) yMaxLocal = v;
      }
    }
    if (!Number.isFinite(yMinLocal) || !Number.isFinite(yMaxLocal)) {
      yMinLocal = 0;
      yMaxLocal = 1;
    }
    if (yMinLocal === yMaxLocal) {
      yMinLocal -= 1;
      yMaxLocal += 1;
    }
    return { xMin: 0, xMax: xMaxLocal || 1, yMin: yMinLocal, yMax: yMaxLocal };
  }, [sweeps]);

  const innerWidth = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const innerHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  function scaleX(t: number): number {
    return PADDING_LEFT + ((t - xMin) / (xMax - xMin)) * innerWidth;
  }
  function scaleY(v: number): number {
    // Flip y so larger values are higher on screen.
    return PADDING_TOP + (1 - (v - yMin) / (yMax - yMin)) * innerHeight;
  }

  return (
    <figure
      className="rounded-md border border-border-subtle bg-white p-2"
      aria-labelledby={titleId}
      data-testid="step-family-chart"
    >
      <figcaption id={titleId} className="mb-1 text-[12px] text-fg-secondary truncate">
        {channelName || 'channel'} · {summary.count} sweeps · {summary.minSamples}–
        {summary.maxSamples} samples each
      </figcaption>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        className="w-full h-auto"
        aria-label={`Step family chart with ${summary.count} sweeps`}
      >
        {/* axes */}
        <line
          x1={PADDING_LEFT}
          y1={PADDING_TOP}
          x2={PADDING_LEFT}
          y2={PADDING_TOP + innerHeight}
          stroke="currentColor"
          className="text-border-subtle"
          strokeWidth={1}
        />
        <line
          x1={PADDING_LEFT}
          y1={PADDING_TOP + innerHeight}
          x2={PADDING_LEFT + innerWidth}
          y2={PADDING_TOP + innerHeight}
          stroke="currentColor"
          className="text-border-subtle"
          strokeWidth={1}
        />
        {/* y tick labels at min and max */}
        <text x={PADDING_LEFT - 4} y={PADDING_TOP + 10} textAnchor="end" fontSize={10} fill="currentColor" className="text-fg-muted">
          {yMax.toPrecision(3)}
        </text>
        <text x={PADDING_LEFT - 4} y={PADDING_TOP + innerHeight} textAnchor="end" fontSize={10} fill="currentColor" className="text-fg-muted">
          {yMin.toPrecision(3)}
        </text>
        <text x={PADDING_LEFT} y={SVG_HEIGHT - 8} textAnchor="start" fontSize={10} fill="currentColor" className="text-fg-muted">
          0
        </text>
        <text x={PADDING_LEFT + innerWidth} y={SVG_HEIGHT - 8} textAnchor="end" fontSize={10} fill="currentColor" className="text-fg-muted">
          {xMax.toPrecision(3)}
        </text>
        {/* sweeps */}
        {sweeps.map((sweep) => {
          const t = sweeps.length > 1 ? sweep.index / (sweeps.length - 1) : 0;
          const color = viridis(t);
          const points = sweep.time
            .map((time, i) => `${scaleX(time)},${scaleY(sweep.values[i]!)}`)
            .join(' ');
          return (
            <polyline
              key={sweep.index}
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.85}
              data-sweep-index={sweep.index}
            />
          );
        })}
      </svg>
      {/* viridis ramp legend */}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-muted">
        <span>sweep 0</span>
        <div
          aria-hidden
          className="flex-1 h-1.5 rounded-full"
          style={{
            background: `linear-gradient(to right, ${viridis(0)}, ${viridis(0.25)}, ${viridis(0.5)}, ${viridis(0.75)}, ${viridis(1)})`,
          }}
        />
        <span>sweep {Math.max(0, summary.count - 1)}</span>
      </div>
      {longest && (
        <p className="mt-1 text-[10px] text-fg-muted">
          Longest sweep: {longest.values.length} samples · {summary.maxSpanSeconds.toPrecision(3)} units span
        </p>
      )}
    </figure>
  );
}

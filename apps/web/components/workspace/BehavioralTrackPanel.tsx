'use client';

/**
 * BehavioralTrackPanel — workspace panel that plots an XY position
 * trajectory (subject location over time) colored by sample index.
 *
 * Pattern mirror of SignalViewerPanel, the closest sibling:
 *
 *   1. Selection-bridge: docId pre-fills from `useWorkspaceSelection().session`
 *      (the "session" dimension holds element_epoch / epochid documents,
 *      which is where position-bearing signals live — e.g. Haley
 *      C. elegans plates, rodent open-field tracks).
 *   2. Manual override: an `<details>` block exposes docId / file /
 *      title for the freeform power-user case (e.g. plotting a
 *      position document that doesn't sit under the session in the
 *      class tree).
 *   3. Auto-run debounce: 400ms after the form settles into a valid
 *      state, the chart re-renders against the new params.
 *   4. The chart owns its own fetch via `apiFetch`, using the same
 *      `/api/datasets/[id]/documents/[docId]/signal` route SignalChart
 *      uses. We pluck two channels (x, y) from the response and
 *      render an SVG trajectory.
 *
 * Why we share the signal route instead of adding a new endpoint:
 *   The fetch_signal contract already returns N channels for any
 *   multi-channel binary document. Position docs are 2-channel
 *   variants of the same shape — backend-wise nothing changes. The
 *   TrajectoryChart just consumes 2 of the N channels rather than
 *   all of them. This keeps the heart-on-Railway contract intact
 *   (ADR-001) and avoids a new tool registration.
 *
 * Empty state: when no docId is set we render the scatter-illustration
 * empty card (a behavioral track is fundamentally a scatter of
 * positions, so the existing illustration fits — re-using cuts new
 * SVG payload to zero).
 *
 * Show Code emits as `fetch_signal` (same tool key as SignalViewer) —
 * the Python/MATLAB snippet generators don't need a new entry,
 * because the call sequence is identical at the SDK level: fetch the
 * 2-channel signal and plot x vs y. A future iteration can split this
 * into a dedicated `fetch_trajectory` tool once the snippet
 * generators are ready to render the trajectory-specific MATLAB
 * preamble.
 */
import { Activity } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Field } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';
import { TrajectoryChart } from '@/components/ndi/charts/TrajectoryChart';
import { isValidDocId } from '@/lib/workspace/doc-id-validation';
import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

import { PanelCard } from './PanelCard';
import { PanelEmptyState } from './canvas/PanelEmptyState';
import { ShowCodeButton } from './ShowCodeButton';

interface BehavioralTrackPanelProps {
  datasetId: string;
}

interface ChartPayload {
  datasetId: string;
  docId: string;
  /**
   * 2026-05-19 pair-mode follow-up. When set, the chart treats `docId`
   * as the X-axis source and this id as the Y-axis source — needed
   * for datasets like Haley that store X and Y in SEPARATE element_epoch
   * documents instead of two channels of one document. Unset = single
   * mode (existing behaviour).
   */
  yDocId?: string;
  downsample: number;
  t0?: number;
  t1?: number;
  file?: string;
  title?: string;
  xChannel?: string;
  yChannel?: string;
}

function parseFloatOrUndefined(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function BehavioralTrackPanel({ datasetId }: BehavioralTrackPanelProps) {
  const { selection } = useWorkspaceSelection();
  // Session is the relevant selection dim — same as SignalViewer.
  // When the user picks a different session the card briefly pulses
  // to acknowledge the silent re-fetch.
  const pulse = usePanelChangeIndicator([selection.session]);

  const [docId, setDocId] = useState<string>(selection.session ?? '');
  // 2026-05-19 pair-mode follow-up. Optional Y-axis document for
  // datasets that store X+Y in separate single-channel element_epoch
  // documents (Haley etc.). Empty = single-mode (chart picks 2
  // channels from `docId`); set = pair-mode.
  const [yDocId, setYDocId] = useState('');
  const [downsample, setDownsample] = useState('2000');
  const [t0, setT0] = useState('');
  const [t1, setT1] = useState('');
  const [file, setFile] = useState('');
  const [title, setTitle] = useState('');
  // Explicit x/y channel selection — leave blank to let the chart
  // pick automatically (prefers literal "x"/"y" names, falls back to
  // first two in document order). In pair-mode the chart uses the
  // first channel of each fetched document.
  const [xChannel, setXChannel] = useState('');
  const [yChannel, setYChannel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [isAutoFilled, setIsAutoFilled] = useState<boolean>(
    selection.session !== null,
  );

  const [payload, setPayload] = useState<ChartPayload | null>(null);

  // Bridge selection → form. Same idiom as SignalViewer — never blank
  // the field when selection goes null, so a typed value survives.
  /* eslint-disable react-hooks/set-state-in-effect -- selection-bar bridge */
  useEffect(() => {
    if (selection.session) {
      setDocId(selection.session);
      setIsAutoFilled(true);
    }
  }, [selection.session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-run after debounce when the docId is auto-filled and valid.
  const lastAutoRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAutoFilled) return;
    const id = docId.trim();
    if (!isValidDocId(id)) return;
    if (lastAutoRunRef.current === id) return;
    const ds = parseFloatOrUndefined(downsample) ?? 2000;
    const handle = setTimeout(() => {
      lastAutoRunRef.current = id;
      setError(null);
      const yIdTrimmed = yDocId.trim();
      setPayload({
        datasetId,
        docId: id,
        yDocId: yIdTrimmed && isValidDocId(yIdTrimmed) ? yIdTrimmed : undefined,
        downsample: ds,
        t0: parseFloatOrUndefined(t0),
        t1: parseFloatOrUndefined(t1),
        file: file.trim() || undefined,
        title: title.trim() || undefined,
        xChannel: xChannel.trim() || undefined,
        yChannel: yChannel.trim() || undefined,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [
    isAutoFilled,
    docId,
    yDocId,
    downsample,
    t0,
    t1,
    file,
    title,
    xChannel,
    yChannel,
    datasetId,
  ]);

  function handleRun(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const id = docId.trim();
    if (!id) {
      setError(
        'Document ID is required. Pick a session in the left rail or paste a Mongo _id (24 hex) or NDI ndiId (16+16 hex).',
      );
      return;
    }
    if (!isValidDocId(id)) {
      setError(
        'Document ID must be a 24-char hex Mongo id OR a 16+16 hex NDI id.',
      );
      return;
    }
    const ds = parseFloatOrUndefined(downsample);
    if (ds !== undefined && (ds < 100 || ds > 5000)) {
      setError('Downsample must be between 100 and 5000 points per channel.');
      return;
    }
    const yIdTrimmed = yDocId.trim();
    if (yIdTrimmed && !isValidDocId(yIdTrimmed)) {
      setError(
        'Y document ID must be a 24-char hex Mongo id OR a 16+16 hex NDI id (or leave it blank).',
      );
      return;
    }
    lastAutoRunRef.current = id;
    setPayload({
      datasetId,
      docId: id,
      yDocId: yIdTrimmed || undefined,
      downsample: ds ?? 2000,
      t0: parseFloatOrUndefined(t0),
      t1: parseFloatOrUndefined(t1),
      file: file.trim() || undefined,
      title: title.trim() || undefined,
      xChannel: xChannel.trim() || undefined,
      yChannel: yChannel.trim() || undefined,
    });
  }

  function onDocIdChange(value: string) {
    setDocId(value);
    if (isAutoFilled && value !== selection.session) {
      setIsAutoFilled(false);
    }
  }

  const docIdTrimmed = docId.trim();
  const showEmptyState = !payload && !error && docIdTrimmed.length === 0;

  return (
    <PanelCard
      icon={Activity}
      title="Behavioral track"
      subtitle="Plot a 2D position trajectory from any position-bearing document. Colored by time progression — start cool, end warm."
      headingId="panel-behavioral-track"
      id="behavioral-track"
      pulse={pulse}
      footer={
        <>
          <MarketingButton
            type="submit"
            variant="cta"
            size="sm"
            onClick={handleRun}
          >
            Run
          </MarketingButton>
          <ShowCodeButton
            toolName="fetch_signal"
            args={payload ?? { datasetId }}
            disabled={payload === null}
          />
        </>
      }
    >
      {isAutoFilled && docId && (
        <span
          className="inline-block text-[10.5px] tracking-eyebrow uppercase text-brand-blue/80 font-bold"
          data-testid="behavioral-track-auto-hint"
        >
          Auto from selection
        </span>
      )}

      <form onSubmit={handleRun} noValidate className="space-y-3">
        <details className="rounded-md border border-border-subtle bg-bg-canvas px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-medium text-fg-secondary">
            Advanced — manual override
          </summary>
          <div className="mt-3 space-y-3">
            <Field
              label="Document ID (X axis)"
              name="docId"
              value={docId}
              onChange={(e) => onDocIdChange(e.target.value)}
              placeholder="e.g. 68d6e54703a03f5cfdac8eff"
              hint="An NDI document ID — either a Mongo _id (24 hex) or an NDI ndiId (16+16 hex). In single mode this doc provides both X and Y (2-channel position trace). In pair mode (Y ID below set) this doc provides X only."
              required
            />
            <Field
              label="Y document ID (optional, pair mode)"
              name="yDocId"
              value={yDocId}
              onChange={(e) => setYDocId(e.target.value)}
              placeholder="leave blank for single-doc mode"
              hint="Optional. When set, this doc supplies the Y axis and the doc above supplies X. Needed for datasets like Haley where X and Y position are stored as SEPARATE single-channel element_epoch documents."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="File (optional)"
                name="file"
                value={file}
                onChange={(e) => setFile(e.target.value)}
                placeholder="e.g. position_track.nbf_1"
                hint="For multi-file binary documents only."
              />
              <Field
                label="Chart title (optional)"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Plate 5 — accept-reject trial"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="X channel (optional)"
                name="xChannel"
                value={xChannel}
                onChange={(e) => setXChannel(e.target.value)}
                placeholder="auto-detect"
                hint="Leave blank to use the first channel. Explicit names override (e.g. 'pos_x')."
              />
              <Field
                label="Y channel (optional)"
                name="yChannel"
                value={yChannel}
                onChange={(e) => setYChannel(e.target.value)}
                placeholder="auto-detect"
                hint="Leave blank to use the second channel."
              />
            </div>
          </div>
        </details>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Downsample"
            name="downsample"
            type="number"
            value={downsample}
            onChange={(e) => setDownsample(e.target.value)}
            hint="Max points per channel (100-5000)."
          />
          <Field
            label="t0 (seconds)"
            name="t0"
            type="number"
            value={t0}
            onChange={(e) => setT0(e.target.value)}
            hint="Window start. Leave blank for epoch start."
          />
          <Field
            label="t1 (seconds)"
            name="t1"
            type="number"
            value={t1}
            onChange={(e) => setT1(e.target.value)}
            hint="Window end. Leave blank for epoch end."
          />
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          {error}
        </div>
      )}

      {showEmptyState && (
        <PanelEmptyState
          illustration="scatter"
          title="Plot an XY trajectory"
          hint={
            <>
              Pick a session in the left rail or paste a document ID below.
              The track will be colored from start (cool) to end (warm).
            </>
          }
          testId="behavioral-track-empty"
        />
      )}

      {payload && (
        <div className="rounded-md border border-border-subtle bg-bg-canvas p-3">
          <TrajectoryChart
            key={`${payload.docId}-${payload.yDocId ?? ''}-${payload.downsample}-${payload.t0 ?? ''}-${payload.t1 ?? ''}-${payload.file ?? ''}-${payload.xChannel ?? ''}-${payload.yChannel ?? ''}`}
            {...payload}
          />
        </div>
      )}
    </PanelCard>
  );
}

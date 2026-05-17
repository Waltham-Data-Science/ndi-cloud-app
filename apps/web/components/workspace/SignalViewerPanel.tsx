'use client';

/**
 * SignalViewerPanel — workspace panel for plotting a downsampled
 * timeseries from any NDI binary document (voltage trace, position
 * track, multi-channel sweep, etc.).
 *
 * Pattern reference for the other chart panels (Spike Activity,
 * Behavioral Compare, Treatment Timeline) — the shape is:
 *
 *   1. Parameter form: typed inputs for the chart payload + optional
 *      browse-to-Document-Explorer escape hatch
 *   2. Run button: stages the form values into a `payload` state that
 *      the chart component re-fetches against (SignalChart owns its
 *      own data fetch via apiFetch — no per-panel useMutation needed,
 *      letting us avoid duplicating the auth/timeout/cancel plumbing)
 *   3. Result area: SignalChart from `@/components/ndi/charts/SignalChart` —
 *      same component the chat surface uses. Loading + error + empty
 *      states are handled inside the chart
 *   4. Footer: Run + Show code
 *
 * Why we reuse SignalChart instead of writing a new chart:
 *
 *   - Same backend response shape (signal_service.downsample_timeseries)
 *   - Same uPlot mount + multi-trace + colorbar rendering paths
 *   - Same auth-scoped apiFetch (works for both private + public datasets)
 *   - Zero net new chart code; only the parameter form is new
 *
 * Selection wiring (one-canvas redesign 2026-05-16): the docId form
 * field is auto-filled from `useWorkspaceSelection().session` because
 * the signal trace consumes element_epoch / epochdata documents —
 * those live under the "session" dimension in the multi-key selection
 * model (see `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md`).
 * When the form is in its auto-filled state and the selection becomes
 * complete, we debounce ~400ms and auto-run. Manual edits flip the
 * `isAutoFilled` flag and suppress further auto-runs so the user's
 * typed value isn't clobbered.
 *
 * The freeform manual docId/file/title inputs live under a collapsed
 * `<details>` block — they remain accessible for power users + debugging
 * but no longer dominate the panel's primary attention.
 */
import { Waves } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { SignalChart } from '@/components/ndi/charts/SignalChart';
import { Field } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';
import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

import { PanelCard } from './PanelCard';
import { PanelEmptyState } from './canvas/PanelEmptyState';
import { ShowCodeButton } from './ShowCodeButton';

interface SignalViewerPanelProps {
  datasetId: string;
}

/**
 * Available coloring modes for the panel's small dropdown. `''`
 * represents the default null-coloring (single solid stroke per trace);
 * the other three map directly to MultiTraceChart's `ColorByMode`. The
 * empty string surface keeps the native `<select>` element idiomatic
 * (no JSON-encoding into the value attribute needed).
 */
type ColorByOption = '' | 'time' | 'index' | 'value';

interface ChartPayload {
  datasetId: string;
  docId: string;
  downsample: number;
  t0?: number;
  t1?: number;
  file?: string;
  title?: string;
  colorBy?: 'time' | 'index' | 'value';
}

function parseFloatOrUndefined(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const HEX_24 = /^[0-9a-fA-F]{24}$/;

export function SignalViewerPanel({ datasetId }: SignalViewerPanelProps) {
  const { selection } = useWorkspaceSelection();
  // H7 pulse: signal viewer's only selection dep is `session`. When
  // the user picks a different session in the picker rail the card
  // briefly rings to acknowledge the silent re-fetch.
  const pulse = usePanelChangeIndicator([selection.session]);

  // Seed from the selection bar when present. We DON'T clear the field
  // when selection goes back to null — the user might have typed a
  // value manually and shouldn't lose it just because the selection
  // bar got cleared elsewhere.
  const [docId, setDocId] = useState<string>(selection.session ?? '');
  const [downsample, setDownsample] = useState('2000');
  const [t0, setT0] = useState('');
  const [t1, setT1] = useState('');
  const [file, setFile] = useState('');
  const [title, setTitle] = useState('');
  const [colorBy, setColorBy] = useState<ColorByOption>('');
  const [error, setError] = useState<string | null>(null);

  // Tracks whether the docId currently in the form came from the
  // selection bar (true) vs. typed by the user (false). The hint pill
  // and the auto-run debouncer both gate on this — when the user has
  // edited the field we never auto-run or claim "auto from selection."
  const [isAutoFilled, setIsAutoFilled] = useState<boolean>(
    selection.session !== null,
  );

  // The CURRENTLY-RENDERED chart payload. When the user clicks "Run",
  // we stage form values into this state, which re-keys SignalChart
  // and triggers its own apiFetch. Decoupling form state from chart
  // payload means partial-typed values don't re-fetch on every keystroke.
  const [payload, setPayload] = useState<ChartPayload | null>(null);

  // Selection-change effect: when a new session id arrives from the
  // selection bar (e.g. user clicked a row in the picker rail), pre-fill
  // the docId and mark the form as auto-filled. Never blank the field —
  // preserving the user's manual value is part of the contract.
  //
  // The set-state-in-effect rule's recommended alternatives (external
  // store, render-time derivation) don't fit here — the selection bar
  // is external React state shared via a hook, and we need to bridge it
  // into local form state that the user can also edit independently.
  // Matches the QueryBuilder URL/seed-hydration pattern in this repo.
  /* eslint-disable react-hooks/set-state-in-effect -- selection-bar bridge to local form state */
  useEffect(() => {
    if (selection.session) {
      setDocId(selection.session);
      setIsAutoFilled(true);
    }
  }, [selection.session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-run debouncer. Triggers Run when the docId is auto-filled and
  // valid. 400ms is enough to suppress rapid re-fires during a cascade
  // of selection writes (e.g. when the user clicks through several
  // rows quickly) but short enough to feel instant on a settle.
  //
  // Uses a ref to track the last-run id so we don't fire twice for the
  // same auto-fill — important because React 19 may re-run the effect
  // for non-functional reasons.
  const lastAutoRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAutoFilled) return;
    const id = docId.trim();
    if (!HEX_24.test(id)) return;
    if (lastAutoRunRef.current === id) return;
    const ds = parseFloatOrUndefined(downsample) ?? 2000;
    const handle = setTimeout(() => {
      lastAutoRunRef.current = id;
      setError(null);
      setPayload({
        datasetId,
        docId: id,
        downsample: ds,
        t0: parseFloatOrUndefined(t0),
        t1: parseFloatOrUndefined(t1),
        file: file.trim() || undefined,
        title: title.trim() || undefined,
        colorBy: colorBy === '' ? undefined : colorBy,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [isAutoFilled, docId, downsample, t0, t1, file, title, colorBy, datasetId]);

  function handleRun(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const id = docId.trim();
    if (!id) {
      setError('Document ID is required. Paste a 24-char hex ID from the Document Explorer.');
      return;
    }
    if (!HEX_24.test(id)) {
      setError('Document ID must be a 24-char hex string.');
      return;
    }
    const ds = parseFloatOrUndefined(downsample);
    if (ds !== undefined && (ds < 100 || ds > 5000)) {
      setError('Downsample must be between 100 and 5000 points per channel.');
      return;
    }
    // Manual Run from the form button counts as the user committing
    // to the value — suppress further auto-runs against the same id.
    lastAutoRunRef.current = id;
    setPayload({
      datasetId,
      docId: id,
      downsample: ds ?? 2000,
      t0: parseFloatOrUndefined(t0),
      t1: parseFloatOrUndefined(t1),
      file: file.trim() || undefined,
      title: title.trim() || undefined,
      colorBy: colorBy === '' ? undefined : colorBy,
    });
  }

  // Editing the docId by hand flips the auto-fill flag off — the hint
  // pill disappears and we stop auto-running. Other fields don't gate
  // auto-run, so editing them doesn't flip the flag.
  function onDocIdChange(value: string) {
    setDocId(value);
    if (isAutoFilled && value !== selection.session) {
      setIsAutoFilled(false);
    }
  }

  // Empty-state vs error-state vs result-state branching for the
  // result area. Empty state shows only when the user hasn't typed
  // anything manually AND no auto-fill has staged a payload. Once
  // they've typed something invalid, we let the existing error block
  // do its job (don't replace a real error message with an
  // illustration).
  const docIdTrimmed = docId.trim();
  const showEmptyState =
    !payload && !error && docIdTrimmed.length === 0;

  return (
    <PanelCard
      icon={Waves}
      title="Signal viewer"
      subtitle="Plot a downsampled trace from any NDI binary document (voltage, position, multi-channel sweep)."
      headingId="panel-signal-viewer"
      id="signal-viewer"
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
          data-testid="signal-viewer-auto-hint"
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
              label="Document ID"
              name="docId"
              value={docId}
              onChange={(e) => onDocIdChange(e.target.value)}
              placeholder="e.g. 68d6e54703a03f5cfdac8eff"
              hint="A 24-char hex NDI document ID. Common classes: element_epoch, daqreader_*_epochdata_ingested."
              required
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="File (optional)"
                name="file"
                value={file}
                onChange={(e) => setFile(e.target.value)}
                placeholder="e.g. ai_group1_seg.nbf_1"
                hint="For multi-file binary documents only."
              />
              <Field
                label="Chart title (optional)"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Patch-Vm sweep 5"
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
        {/* Color-by dropdown — small inline control that lets the user
            pick a continuous coloring mode for the rendered trace(s).
            Default "" maps to colorBy=null in the payload (no visual
            change vs. the historical rendering); the three other
            options engage the per-segment renderer in MultiTraceChart. */}
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
            Color by
          </span>
          <select
            name="colorBy"
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as ColorByOption)}
            data-testid="signal-viewer-colorby"
            aria-label="Color by"
            className="rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[13px] text-fg-primary focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-colors"
          >
            <option value="">None (default)</option>
            <option value="time">Time progression</option>
            <option value="index">Sample index</option>
            <option value="value">Amplitude</option>
          </select>
          <span className="text-[11.5px] text-fg-muted">
            Colors each trace point along the chosen axis using a viridis ramp.
          </span>
        </label>
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
          illustration="line-trace"
          title="Plot a signal trace"
          hint={
            <>
              Pick a session in the left rail or paste a document ID
              below.
            </>
          }
          testId="signal-viewer-empty"
        />
      )}

      {payload && (
        <div className="rounded-md border border-border-subtle bg-bg-canvas p-3">
          {/* SignalChart owns the data fetch — re-keying on docId
              ensures the chart fully re-mounts on Run, avoiding any
              stale-state bleed between consecutive runs against
              different documents. */}
          <SignalChart key={`${payload.docId}-${payload.downsample}-${payload.t0 ?? ''}-${payload.t1 ?? ''}-${payload.file ?? ''}-${payload.colorBy ?? ''}`} {...payload} colorBy={payload.colorBy ?? null} />
        </div>
      )}
    </PanelCard>
  );
}

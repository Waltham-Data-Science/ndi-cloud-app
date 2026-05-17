'use client';

/**
 * PsthPanel — workspace panel for peri-stimulus time histograms.
 * Joins a vmspikesummary spike train with a stimulus_presentation /
 * stimulus_response event train and bins spikes around each onset.
 *
 * Mirrors SpikeActivityPanel's mutation + Skeleton + error envelope
 * shape; the chart is the new PsthChart component. Show-Code emits
 * the `psth` tool snippet for Python and MATLAB.
 *
 * Selection wiring (one-canvas redesign 2026-05-16): both the
 * unitDocId and stimulusDocId form fields are auto-filled from
 * `useWorkspaceSelection()` — the unit (vmspikesummary id) and the
 * stimulus (stimulus_presentation id) are first-class dimensions in
 * the multi-key selection model. When BOTH are set and the form is
 * still in its auto-filled state, the panel debounces ~400ms and
 * auto-runs. Manual edits to either field flip the auto-fill flag and
 * suppress further auto-runs. See
 * `apps/web/docs/design/2026-05-16-workspace-canvas-redesign.md` for
 * the selection-keys → panels mapping.
 */
import { Activity } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { Field } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';
import { PsthChart } from '@/components/ndi/charts/PsthChart';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError, apiFetch } from '@/lib/api/client';
import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';
import type { PsthToolResult } from '@/lib/ndi/tools/psth';

import { PanelCard } from './PanelCard';
import { PanelEmptyState } from './canvas/PanelEmptyState';
import { ShowCodeButton } from './ShowCodeButton';

interface PsthPanelProps {
  datasetId: string;
}

interface FormState {
  unitDocId: string;
  stimulusDocId: string;
  t0: string;
  t1: string;
  binSizeMs: string;
}

interface RequestBody {
  unitDocId: string;
  stimulusDocId: string;
  t0?: number;
  t1?: number;
  binSizeMs?: number;
}

const DEFAULT_FORM_NO_SELECTION: FormState = {
  unitDocId: '',
  stimulusDocId: '',
  t0: '-0.5',
  t1: '1.5',
  binSizeMs: '20',
};

const HEX_24 = /^[0-9a-fA-F]{24}$/;

// Endpoint envelope: success carries chart_payload; the soft-error
// shape is `{ error: string }` returned under a 200 by the wrapper
// route when zod validation fails. The PsthToolResult success shape
// still nests its diagnostic in `empty_hint` (kept inside the chart
// area rather than promoted to a top-level error block).
type EndpointResponse = PsthToolResult | { error: string };

function isErrorEnvelope(r: EndpointResponse): r is { error: string } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'error' in r &&
    typeof (r as { error: unknown }).error === 'string' &&
    !('chart_payload' in r)
  );
}

function buildRequestBody(form: FormState): RequestBody | { error: string } {
  const unitDocId = form.unitDocId.trim();
  if (!unitDocId) {
    return { error: 'Unit document ID is required (24-character hex id).' };
  }
  if (!HEX_24.test(unitDocId)) {
    return { error: 'Unit document ID must be a 24-character hex string.' };
  }

  const stimulusDocId = form.stimulusDocId.trim();
  if (!stimulusDocId) {
    return {
      error: 'Stimulus document ID is required (24-character hex id).',
    };
  }
  if (!HEX_24.test(stimulusDocId)) {
    return {
      error: 'Stimulus document ID must be a 24-character hex string.',
    };
  }

  const body: RequestBody = { unitDocId, stimulusDocId };

  const t0Trim = form.t0.trim();
  if (t0Trim) {
    const t0 = Number(t0Trim);
    if (!Number.isFinite(t0)) {
      return { error: 'Window start (t0) must be a number (seconds).' };
    }
    body.t0 = t0;
  }
  const t1Trim = form.t1.trim();
  if (t1Trim) {
    const t1 = Number(t1Trim);
    if (!Number.isFinite(t1)) {
      return { error: 'Window end (t1) must be a number (seconds).' };
    }
    body.t1 = t1;
  }
  if (
    body.t0 !== undefined &&
    body.t1 !== undefined &&
    body.t1 <= body.t0
  ) {
    return { error: 'Window end must be greater than window start.' };
  }

  const binTrim = form.binSizeMs.trim();
  if (binTrim) {
    const bin = Number(binTrim);
    if (!Number.isFinite(bin) || bin <= 0) {
      return {
        error: 'Bin size must be a positive number (milliseconds).',
      };
    }
    body.binSizeMs = bin;
  }

  return body;
}

export function PsthPanel({ datasetId }: PsthPanelProps) {
  const { selection } = useWorkspaceSelection();
  // H7 pulse: PSTH cares about both unit + stimulus; either one
  // changing should ring the card. Empty deps array (unset) doesn't
  // count as a change after the first render.
  const pulse = usePanelChangeIndicator([
    selection.unit,
    selection.stimulus,
  ]);

  // Initial seed from the selection bar. If neither dimension is set
  // we fall back to the no-selection defaults. The non-id fields
  // (t0/t1/binSizeMs) always start from the no-selection defaults —
  // they're tuning knobs, not selection-driven.
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM_NO_SELECTION,
    unitDocId: selection.unit ?? '',
    stimulusDocId: selection.stimulus ?? '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-fill flag: true while BOTH ids in the form came from the
  // selection bar and haven't been edited. Goes false the moment the
  // user types over either id field.
  const [isAutoFilled, setIsAutoFilled] = useState<boolean>(
    selection.unit !== null && selection.stimulus !== null,
  );

  const mutation = useMutation<EndpointResponse, Error, RequestBody>({
    mutationFn: (body) =>
      apiFetch<EndpointResponse>(
        `/api/datasets/${encodeURIComponent(datasetId)}/psth`,
        { method: 'POST', body },
      ),
  });

  // Pull updates from the selection bar into the form. Never blanks
  // a field when selection clears — preserves the user's typed value.
  //
  // set-state-in-effect disable: same reasoning as the QueryBuilder
  // URL/seed-hydration pattern — selection is external React state we
  // bridge into local form state that the user can also edit. The
  // recommended alternatives (external store, render-time derivation)
  // don't fit the dual edit-source contract.
  /* eslint-disable react-hooks/set-state-in-effect -- selection-bar bridge to local form state */
  useEffect(() => {
    if (selection.unit) {
      setForm((f) =>
        f.unitDocId === selection.unit ? f : { ...f, unitDocId: selection.unit ?? '' },
      );
    }
  }, [selection.unit]);

  useEffect(() => {
    if (selection.stimulus) {
      setForm((f) =>
        f.stimulusDocId === selection.stimulus
          ? f
          : { ...f, stimulusDocId: selection.stimulus ?? '' },
      );
    }
  }, [selection.stimulus]);

  // Re-arm the auto-filled flag whenever the selection completes both
  // dimensions and the form mirrors that exact pairing. This lets the
  // panel auto-run on a fresh "select unit, then select stimulus"
  // cascade without requiring the user to reload.
  useEffect(() => {
    if (
      selection.unit &&
      selection.stimulus &&
      form.unitDocId === selection.unit &&
      form.stimulusDocId === selection.stimulus
    ) {
      setIsAutoFilled(true);
    }
  }, [selection.unit, selection.stimulus, form.unitDocId, form.stimulusDocId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRun = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      setFormError(null);
      const built = buildRequestBody(form);
      if ('error' in built) {
        setFormError(built.error);
        return;
      }
      mutation.mutate(built);
    },
    [form, mutation],
  );
  // NB: stale-state reset on dataset change happens at the parent
  // (`workspace-client.tsx` keys the panel stack by `datasetId`).

  // Auto-run when context becomes complete + auto-filled. Debounced
  // 400ms so a rapid selection cascade settles before firing. Uses a
  // ref-tracked "last run pair" key so the same pairing doesn't fire
  // twice even if React re-runs the effect.
  const lastAutoRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAutoFilled) return;
    const unit = form.unitDocId.trim();
    const stim = form.stimulusDocId.trim();
    if (!HEX_24.test(unit) || !HEX_24.test(stim)) return;
    const key = `${unit}|${stim}`;
    if (lastAutoRunRef.current === key) return;
    const handle = setTimeout(() => {
      lastAutoRunRef.current = key;
      handleRun();
    }, 400);
    return () => clearTimeout(handle);
  }, [isAutoFilled, form.unitDocId, form.stimulusDocId, handleRun]);

  // Pull the success-shape result out of the mutation envelope.
  const result = useMemo<PsthToolResult | null>(() => {
    const data = mutation.data;
    if (!data || isErrorEnvelope(data)) return null;
    return data;
  }, [mutation.data]);

  const errorEnvelope =
    mutation.data && isErrorEnvelope(mutation.data) ? mutation.data : null;
  const networkError = mutation.error;
  const isRunning = mutation.isPending;
  const hasSuccessRun = !!result && !isRunning;

  // Args object for Show-Code — reflects the parameters the user
  // typed. We always include datasetId so the snippet renders a
  // complete reproducible call.
  const showCodeArgs = useMemo(() => {
    const built = buildRequestBody(form);
    return 'error' in built ? { datasetId } : { datasetId, ...built };
  }, [form, datasetId]);

  // Editing either id field by hand drops auto-fill.
  function onUnitChange(value: string) {
    setForm((f) => ({ ...f, unitDocId: value }));
    if (isAutoFilled && value !== selection.unit) {
      setIsAutoFilled(false);
    }
  }
  function onStimulusChange(value: string) {
    setForm((f) => ({ ...f, stimulusDocId: value }));
    if (isAutoFilled && value !== selection.stimulus) {
      setIsAutoFilled(false);
    }
  }

  const showAutoHint =
    isAutoFilled && !!form.unitDocId && !!form.stimulusDocId;

  // Illustrated empty state: shown when no request is in flight, no
  // result is back yet, no errors are surfaced, and the user hasn't
  // typed anything manually into either id field. Once they start
  // typing the existing validation surface takes over.
  const showEmptyState =
    !isRunning &&
    !networkError &&
    !errorEnvelope &&
    !result &&
    !formError &&
    form.unitDocId.trim().length === 0 &&
    form.stimulusDocId.trim().length === 0;

  return (
    <PanelCard
      icon={Activity}
      title="PSTH"
      subtitle="Peri-stimulus time histogram. Aligns spike times to stimulus onsets and bins them — the standard neural-response visualization."
      headingId="panel-psth"
      id="psth"
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
            toolName="psth"
            args={showCodeArgs}
            result={result ?? undefined}
            disabled={!hasSuccessRun}
          />
        </>
      }
    >
      {showAutoHint && (
        <span
          className="inline-block text-[10.5px] tracking-eyebrow uppercase text-brand-blue/80 font-bold"
          data-testid="psth-auto-hint"
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
              label="Unit document ID"
              name="unitDocId"
              value={form.unitDocId}
              onChange={(e) => onUnitChange(e.target.value)}
              placeholder="e.g. 68d6e54703a03f5cfdac8eff"
              hint="A 24-char hex vmspikesummary document ID (the unit you want to bin)."
              required
            />
            <Field
              label="Stimulus document ID"
              name="stimulusDocId"
              value={form.stimulusDocId}
              onChange={(e) => onStimulusChange(e.target.value)}
              placeholder="e.g. 68d6e54703a03f5cfdac8f00"
              hint="A 24-char hex stimulus_presentation or stimulus_response document ID."
              required
            />
          </div>
        </details>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="t0 (seconds)"
            name="t0"
            type="number"
            value={form.t0}
            onChange={(e) => setForm((f) => ({ ...f, t0: e.target.value }))}
            hint="Window start, relative to onset."
          />
          <Field
            label="t1 (seconds)"
            name="t1"
            type="number"
            value={form.t1}
            onChange={(e) => setForm((f) => ({ ...f, t1: e.target.value }))}
            hint="Window end, relative to onset."
          />
          <Field
            label="Bin size (ms)"
            name="binSizeMs"
            type="number"
            value={form.binSizeMs}
            onChange={(e) =>
              setForm((f) => ({ ...f, binSizeMs: e.target.value }))
            }
            hint="Temporal resolution per bin."
          />
        </div>
      </form>

      {formError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          {formError}
        </div>
      )}

      <div className="mt-1">
        {showEmptyState && (
          <PanelEmptyState
            illustration="histogram"
            title="Build a PSTH"
            hint={<>Pick a unit AND a stimulus.</>}
            testId="psth-empty"
          />
        )}
        {isRunning && <LoadingState />}
        {!isRunning && networkError && (
          <ErrorBlock message={describeNetworkError(networkError)} />
        )}
        {!isRunning && errorEnvelope && (
          <ErrorBlock message={errorEnvelope.error} />
        )}
        {!isRunning && result && (
          <ResultArea datasetId={datasetId} result={result} />
        )}
      </div>
    </PanelCard>
  );
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2"
      data-testid="psth-loading"
    >
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-[200px] w-full" />
      <span className="sr-only">Running PSTH computation.</span>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
    >
      {message}
    </div>
  );
}

interface ResultAreaProps {
  datasetId: string;
  result: PsthToolResult;
}

function ResultArea({ datasetId, result }: ResultAreaProps) {
  const payload = result.chart_payload;
  const hasBins = payload.binCenters.length > 0;

  // empty_hint surfaces the friendly per-error-kind copy; the chart
  // area degrades to an inline status block when there's nothing to
  // bin (no events, decode failure, empty window, etc.).
  if (!hasBins) {
    return (
      <div
        role="status"
        className="rounded-md border border-border-subtle bg-bg-canvas px-3 py-4 text-[13px] text-fg-secondary"
      >
        {result.empty_hint?.reason ?? 'No PSTH data for these inputs.'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <PsthChart
        datasetId={datasetId}
        binCenters={payload.binCenters}
        counts={payload.counts}
        meanRateHz={payload.meanRateHz}
        binSizeMs={payload.binSizeMs}
        t0={payload.t0}
        t1={payload.t1}
        unitName={payload.unitName}
        title={payload.title}
      />
      <p className="text-[12px] text-fg-secondary text-center">
        {result.n_spikes.toLocaleString()} spike{result.n_spikes === 1 ? '' : 's'} /{' '}
        {result.n_trials.toLocaleString()} trial{result.n_trials === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function describeNetworkError(err: Error): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return err.message || 'Invalid request.';
    if (err.status === 401)
      return 'Sign in to compute PSTH for private datasets.';
    if (err.status === 404) return 'Dataset not found.';
    return err.message || 'Failed to compute PSTH.';
  }
  return err.message || 'Network error contacting the PSTH service.';
}

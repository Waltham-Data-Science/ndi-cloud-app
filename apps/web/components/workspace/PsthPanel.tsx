'use client';

/**
 * PsthPanel — workspace panel for peri-stimulus time histograms.
 * Joins a vmspikesummary spike train with a stimulus_presentation /
 * stimulus_response event train and bins spikes around each onset.
 *
 * Mirrors SpikeActivityPanel's mutation + Skeleton + error envelope
 * shape; the chart is the new PsthChart component. Show-Code emits
 * the `psth` tool snippet for Python and MATLAB.
 */
import { Activity } from 'lucide-react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type FormEvent } from 'react';

import { Field } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';
import { PsthChart } from '@/components/ndi/charts/PsthChart';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { PsthToolResult } from '@/lib/ndi/tools/psth';

import { PanelCard } from './PanelCard';
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

const DEFAULT_FORM: FormState = {
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
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation<EndpointResponse, Error, RequestBody>({
    mutationFn: (body) =>
      apiFetch<EndpointResponse>(
        `/api/datasets/${encodeURIComponent(datasetId)}/psth`,
        { method: 'POST', body },
      ),
  });

  const handleRun = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
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

  return (
    <PanelCard
      icon={Activity}
      title="PSTH"
      subtitle="Peri-stimulus time histogram. Aligns spike times to stimulus onsets and bins them — the standard neural-response visualization."
      headingId="panel-psth"
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
          <Link
            href={`/datasets/${datasetId}/documents?class=vmspikesummary`}
            className="ml-auto text-[12.5px] text-brand-blue hover:underline"
          >
            Browse units →
          </Link>
          <Link
            href={`/datasets/${datasetId}/documents?class=stimulus_presentation`}
            className="text-[12.5px] text-brand-blue hover:underline"
          >
            Browse stimuli →
          </Link>
        </>
      }
    >
      <form onSubmit={handleRun} noValidate className="space-y-3">
        <Field
          label="Unit document ID"
          name="unitDocId"
          value={form.unitDocId}
          onChange={(e) =>
            setForm((f) => ({ ...f, unitDocId: e.target.value }))
          }
          placeholder="e.g. 68d6e54703a03f5cfdac8eff"
          hint="A 24-char hex vmspikesummary document ID (the unit you want to bin)."
          required
        />
        <Field
          label="Stimulus document ID"
          name="stimulusDocId"
          value={form.stimulusDocId}
          onChange={(e) =>
            setForm((f) => ({ ...f, stimulusDocId: e.target.value }))
          }
          placeholder="e.g. 68d6e54703a03f5cfdac8f00"
          hint="A 24-char hex stimulus_presentation or stimulus_response document ID."
          required
        />
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

'use client';

/**
 * SpikeActivityPanel — workspace GUI panel for spike-raster + ISI
 * histogram rendering. Mirrors the chat's `fetch_spike_summary` tool
 * loop but driven by a parameter form + Run button instead of an LLM
 * tool call. Embeds the same `SpikeRaster` + `IsiHistogram` chart
 * components the chat uses; offers a "Show code" affordance that opens
 * the existing Python/MATLAB modal with a single recorded tool call.
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback, useId, useMemo, useState } from 'react';

import { CodeExportButton } from '@/components/ai/CodeExportButton';
import { IsiHistogram } from '@/components/charts/IsiHistogram';
import { SpikeRaster } from '@/components/charts/SpikeRaster';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { RecordedToolCall } from '@/lib/ai/code-export/types';
import type {
  FetchSpikeSummaryToolResult,
  IsiHistogramChartPayload,
  SpikeRasterChartPayload,
} from '@/lib/ai/tools/fetch-spike-summary';

export interface SpikeActivityPanelProps {
  datasetId: string;
}

type KindRadio = 'raster' | 'isi_histogram' | 'both';

interface FormState {
  unitDocId: string;
  unitNameMatch: string;
  t0: string;
  t1: string;
  maxUnits: string;
  kind: KindRadio;
}

interface RequestBody {
  kind: KindRadio;
  unitDocId?: string;
  unitNameMatch?: string;
  tWindow?: [number, number];
  maxUnits?: number;
}

const DEFAULT_FORM: FormState = {
  unitDocId: '',
  unitNameMatch: '',
  t0: '',
  t1: '',
  maxUnits: '10',
  kind: 'both',
};

const MAX_UNITS_HARD = 50;

// Tool-result envelope OR error envelope — the workspace endpoint
// returns both shapes under a 200 response. `ToolError` shape is
// `{ error: string }` (single key); the success shape always carries
// at least `kind` and `chart_payloads`.
type EndpointResponse =
  | FetchSpikeSummaryToolResult
  | { error: string };

function isErrorEnvelope(
  r: EndpointResponse,
): r is { error: string } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'error' in r &&
    typeof (r as { error: unknown }).error === 'string' &&
    !('chart_payloads' in r)
  );
}

function buildRequestBody(form: FormState): RequestBody | { error: string } {
  // Build the body the way the chat tool's invocation site does:
  // optional fields are OMITTED when blank so the zod schema's
  // `.optional()` path fires instead of `''` failing `min(1)`.
  const body: RequestBody = { kind: form.kind };

  const unitDocId = form.unitDocId.trim();
  if (unitDocId) body.unitDocId = unitDocId;

  const unitNameMatch = form.unitNameMatch.trim();
  if (unitNameMatch) body.unitNameMatch = unitNameMatch;

  const maxUnitsTrim = form.maxUnits.trim();
  if (maxUnitsTrim) {
    const n = Number(maxUnitsTrim);
    if (!Number.isInteger(n) || n <= 0 || n > MAX_UNITS_HARD) {
      return {
        error: `Max units must be a positive integer ≤ ${MAX_UNITS_HARD}.`,
      };
    }
    body.maxUnits = n;
  }

  const t0Trim = form.t0.trim();
  const t1Trim = form.t1.trim();
  if (t0Trim || t1Trim) {
    if (!t0Trim || !t1Trim) {
      return {
        error: 'Time window requires both start and end values (or leave both blank).',
      };
    }
    const t0 = Number(t0Trim);
    const t1 = Number(t1Trim);
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) {
      return { error: 'Time window values must be numbers (seconds).' };
    }
    if (t1 <= t0) {
      return { error: 'Time window end must be greater than start.' };
    }
    body.tWindow = [t0, t1];
  }

  return body;
}

export function SpikeActivityPanel({ datasetId }: SpikeActivityPanelProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const headingId = useId();

  const mutation = useMutation<
    EndpointResponse,
    Error,
    RequestBody
  >({
    mutationFn: (body) =>
      apiFetch<EndpointResponse>(
        `/api/datasets/${encodeURIComponent(datasetId)}/spike-summary`,
        { method: 'POST', body },
      ),
  });

  const handleRun = useCallback(() => {
    setFormError(null);
    const result = buildRequestBody(form);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    mutation.mutate(result);
  }, [form, mutation]);

  // Pull the two chart payloads out of the latest response. The
  // backend returns `chart_payloads: SpikeChartPayload[]` with 0, 1,
  // or 2 entries depending on `kind`. We discriminate on the
  // payload's own `kind` field so the order is irrelevant.
  const charts = useMemo(() => {
    const data = mutation.data;
    if (!data || isErrorEnvelope(data)) return null;
    const result = data;
    let raster: SpikeRasterChartPayload | null = null;
    let isi: IsiHistogramChartPayload | null = null;
    for (const p of result.chart_payloads) {
      if (p.kind === 'raster') raster = p;
      else if (p.kind === 'isi_histogram') isi = p;
    }
    return { raster, isi, result };
  }, [mutation.data]);

  const recordedToolCalls: RecordedToolCall[] = useMemo(() => {
    // Construct the args object the chat tool would have seen. We
    // include the resolved request body (only the fields actually
    // sent) plus `datasetId` so the snippet renders a reproducible
    // call.
    const built = buildRequestBody(form);
    const args =
      'error' in built
        ? { datasetId, kind: form.kind }
        : { datasetId, ...built };
    return [
      {
        toolName: 'fetch_spike_summary',
        args,
        // `result` is undefined when no run has happened yet OR when
        // the run errored — the snippet generator handles both.
        result:
          mutation.data && !isErrorEnvelope(mutation.data)
            ? mutation.data
            : undefined,
      },
    ];
  }, [form, datasetId, mutation.data]);

  const errorEnvelope =
    mutation.data && isErrorEnvelope(mutation.data) ? mutation.data : null;
  const networkError = mutation.error;
  const isRunning = mutation.isPending;
  const hasSuccessRun =
    !!mutation.data && !isErrorEnvelope(mutation.data) && !mutation.isPending;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border border-border-strong bg-bg-surface p-4"
    >
      <header className="mb-3">
        <h2
          id={headingId}
          className="text-base font-semibold text-fg-primary m-0"
        >
          Spike activity
        </h2>
        <p className="text-sm text-fg-muted m-0 mt-1">
          Spike raster + ISI histogram for one or more units.
        </p>
      </header>

      <ParameterForm
        form={form}
        onChange={setForm}
        disabled={isRunning}
        formError={formError}
        onRun={handleRun}
      />

      <div className="mt-4">
        {isRunning && <LoadingState />}
        {!isRunning && networkError && (
          <ErrorBlock message={describeNetworkError(networkError)} />
        )}
        {!isRunning && errorEnvelope && (
          <ErrorBlock message={errorEnvelope.error} />
        )}
        {!isRunning &&
          charts &&
          (charts.raster || charts.isi || charts.result.unit_count === 0) && (
            <ResultArea
              datasetId={datasetId}
              raster={charts.raster}
              isi={charts.isi}
              emptyHint={charts.result.empty_hint?.reason}
              unitCount={charts.result.unit_count}
            />
          )}
      </div>

      {hasSuccessRun && (
        <div className="mt-4 flex justify-end">
          <CodeExportButton toolCalls={recordedToolCalls} />
        </div>
      )}
    </section>
  );
}

interface ParameterFormProps {
  form: FormState;
  onChange: (next: FormState) => void;
  disabled: boolean;
  formError: string | null;
  onRun: () => void;
}

function ParameterForm({
  form,
  onChange,
  disabled,
  formError,
  onRun,
}: ParameterFormProps) {
  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      onChange({ ...form, [key]: value });
    },
    [form, onChange],
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
      className="space-y-3"
    >
      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="sr-only">Spike-summary parameters</legend>

        <TextField
          label="Unit document ID"
          hint="24-character hex id — fetches a single vmspikesummary document."
          value={form.unitDocId}
          onChange={(v) => set('unitDocId', v)}
          placeholder="optional"
        />

        <TextField
          label="Unit name match"
          hint='Case-insensitive substring on unit names (e.g. "Saline", "BNST").'
          value={form.unitNameMatch}
          onChange={(v) => set('unitNameMatch', v)}
          placeholder="optional"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Time window start (s)"
            value={form.t0}
            onChange={(v) => set('t0', v)}
            placeholder="optional"
            inputMode="decimal"
          />
          <TextField
            label="Time window end (s)"
            value={form.t1}
            onChange={(v) => set('t1', v)}
            placeholder="optional"
            inputMode="decimal"
          />
        </div>

        <TextField
          label="Max units"
          hint={`Defaults to 10. Max ${MAX_UNITS_HARD}. Ignored when a unit document ID is set.`}
          value={form.maxUnits}
          onChange={(v) => set('maxUnits', v)}
          placeholder="10"
          inputMode="numeric"
        />

        <RadioGroup
          label="Charts to render"
          name="spike-activity-kind"
          value={form.kind}
          onChange={(v) => set('kind', v)}
          options={[
            { value: 'raster', label: 'Raster only' },
            { value: 'isi_histogram', label: 'ISI histogram only' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </fieldset>

      {formError && <ErrorBlock message={formError} />}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-md bg-ndi-teal px-4 py-2 text-sm font-semibold text-white hover:bg-ndi-teal/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? 'Running…' : 'Run'}
        </button>
      </div>
    </form>
  );
}

interface TextFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
}

function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  inputMode,
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-sm font-semibold text-fg-primary"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={hintId}
        className="w-full rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-sm text-fg-primary focus:outline-none focus:border-ndi-teal focus:ring-2 focus:ring-ndi-teal/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {hint && (
        <p id={hintId} className="text-xs text-fg-muted m-0">
          {hint}
        </p>
      )}
    </div>
  );
}

interface RadioOption {
  value: KindRadio;
  label: string;
}

interface RadioGroupProps {
  label: string;
  name: string;
  value: KindRadio;
  onChange: (next: KindRadio) => void;
  options: RadioOption[];
}

function RadioGroup({
  label,
  name,
  value,
  onChange,
  options,
}: RadioGroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-fg-primary">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-3"
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className="inline-flex items-center gap-2 text-sm text-fg-primary cursor-pointer"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="h-4 w-4 text-ndi-teal focus:ring-ndi-teal/40"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2"
      data-testid="spike-activity-loading"
    >
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-[200px] w-full" />
      <span className="sr-only">Loading spike-summary result.</span>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </div>
  );
}

interface ResultAreaProps {
  datasetId: string;
  raster: SpikeRasterChartPayload | null;
  isi: IsiHistogramChartPayload | null;
  emptyHint?: string;
  unitCount: number;
}

function ResultArea({
  datasetId,
  raster,
  isi,
  emptyHint,
  unitCount,
}: ResultAreaProps) {
  if (unitCount === 0 || (!raster && !isi)) {
    return (
      <div
        role="status"
        className="rounded-md border border-border-subtle bg-bg-surface-subtle px-3 py-4 text-sm text-fg-muted"
      >
        {emptyHint ?? 'No spike data matched these parameters.'}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {raster && (
        <div className="min-w-0">
          <SpikeRaster
            datasetId={datasetId}
            units={raster.units}
            tWindow={raster.tWindow}
            title={raster.title}
          />
        </div>
      )}
      {isi && (
        <div className="min-w-0">
          <IsiHistogram
            datasetId={datasetId}
            intervals={isi.intervals}
            unitName={isi.unitName}
            logBins={isi.logBins}
            title={isi.title}
          />
        </div>
      )}
    </div>
  );
}

function describeNetworkError(err: Error): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return err.message || 'Invalid request.';
    if (err.status === 401)
      return 'Sign in to view spike summaries for private datasets.';
    if (err.status === 404) return 'Dataset not found.';
    return err.message || 'Failed to fetch spike summary.';
  }
  return err.message || 'Network error contacting the spike-summary service.';
}

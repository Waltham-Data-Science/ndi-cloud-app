'use client';

/**
 * SpikeActivityPanel — workspace GUI panel for spike-raster + ISI
 * histogram rendering. Mirrors the chat's `fetch_spike_summary` tool
 * loop but driven by a parameter form + Run button instead of an LLM
 * tool call. Embeds the same `SpikeRaster` + `IsiHistogram` chart
 * components the chat uses.
 *
 * Migrated 2026-05-15 (Stream 4.2 + 4.4) to the canonical workspace
 * panel pattern — PanelCard chrome, `<Button>` for Run, and
 * `<ShowCodeButton>` for the code-export affordance. Previously this
 * file used a bespoke `<section>` with `<h2>` (instead of PanelCard's
 * `<h3>`) and a raw `<button>` styled with literal Tailwind class
 * strings, breaking heading-level outline and visual consistency
 * with the other 6 panels.
 *
 * Selection wiring (one-canvas redesign 2026-05-16): the unitDocId
 * form field is auto-filled from `useWorkspaceSelection().unit`. When
 * the unit dimension is set and the form is in its auto-filled state,
 * the panel debounces ~400ms and auto-runs. Manual edits to the unit
 * field drop the auto-fill flag and suppress further auto-runs. The
 * other fields (time window, max units, kind radio) are tuning knobs
 * and don't influence auto-fill state.
 *
 * F-4 (2026-05-18): Converted from `useMutation` → `useQuery` keyed
 * on the committed request body. Identical picks (same unit twice in
 * a row from the selection bar) no longer re-fire the network call —
 * TanStack Query dedups by queryKey hash. The "Run" button forces an
 * explicit refetch when the committed args are unchanged.
 */
import { useQuery } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { Activity } from 'lucide-react';

import { IsiHistogram } from '@/components/ndi/charts/IsiHistogram';
import { SpikeRaster } from '@/components/ndi/charts/SpikeRaster';
import { PanelCard } from '@/components/workspace/PanelCard';
import { PanelEmptyState } from '@/components/workspace/canvas/PanelEmptyState';
import { ShowCodeButton } from '@/components/workspace/ShowCodeButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError, apiFetch } from '@/lib/api/client';
import { isValidDocId } from '@/lib/workspace/doc-id-validation';
import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';
import type {
  FetchSpikeSummaryToolResult,
  IsiHistogramChartPayload,
  SpikeRasterChartPayload,
} from '@/lib/ndi/tools/fetch-spike-summary';

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

const DEFAULT_FORM_BASE: Omit<FormState, 'unitDocId'> = {
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
type EndpointResponse = FetchSpikeSummaryToolResult | { error: string };

function isErrorEnvelope(r: EndpointResponse): r is { error: string } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'error' in r &&
    typeof (r as { error: unknown }).error === 'string' &&
    !('chart_payloads' in r)
  );
}

/**
 * Shallow-compare two RequestBody values to decide whether they map to
 * the same useQuery key (post-F-4). Handles the `tWindow` tuple slot
 * explicitly so [0, 60] vs undefined are distinguishable. Returns
 * true when the bodies would hash to the same queryKey under TanStack
 * Query's deterministic stringification.
 */
function requestBodyEqual(a: RequestBody, b: RequestBody): boolean {
  if (a.kind !== b.kind) return false;
  if (a.unitDocId !== b.unitDocId) return false;
  if (a.unitNameMatch !== b.unitNameMatch) return false;
  if (a.maxUnits !== b.maxUnits) return false;
  const at = a.tWindow;
  const bt = b.tWindow;
  if (at === undefined && bt === undefined) return true;
  if (at === undefined || bt === undefined) return false;
  return at[0] === bt[0] && at[1] === bt[1];
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
        error:
          'Time window requires both start and end values (or leave both blank).',
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
  const { selection } = useWorkspaceSelection();
  // H7 pulse: spike activity tracks the `unit` selection only.
  const pulse = usePanelChangeIndicator([selection.unit]);

  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM_BASE,
    unitDocId: selection.unit ?? '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isAutoFilled, setIsAutoFilled] = useState<boolean>(
    selection.unit !== null,
  );
  // Stable literal id — matches the convention used by the other
  // 4 panels ("panel-signal-viewer" etc.) and what the smoke audit
  // (2026-05-16) flagged as the canonical pattern. Pre-fix this
  // used useId() which produces values like `_r_b_` — technically
  // valid but harder to debug in the a11y tree.
  const headingId = 'panel-spike-activity';

  // F-4: committed args drive the useQuery key. The form holds the
  // current input; committedArgs holds the last user-validated body.
  // useQuery dedups identical committedArgs (same key hash) so a
  // repeat selection-pick with the same unit doesn't re-hit the
  // network. The Run button forces an explicit refetch when args
  // are unchanged.
  const [committedArgs, setCommittedArgs] = useState<RequestBody | null>(null);

  const query = useQuery<EndpointResponse, Error>({
    queryKey: [
      'spike-summary',
      datasetId,
      committedArgs?.kind ?? null,
      committedArgs?.unitDocId ?? null,
      committedArgs?.unitNameMatch ?? null,
      committedArgs?.tWindow?.[0] ?? null,
      committedArgs?.tWindow?.[1] ?? null,
      committedArgs?.maxUnits ?? null,
    ],
    queryFn: ({ signal }) =>
      apiFetch<EndpointResponse>(
        `/api/datasets/${encodeURIComponent(datasetId)}/spike-summary`,
        { method: 'POST', body: committedArgs!, signal },
      ),
    enabled: committedArgs !== null,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });

  // Selection-bar wiring: pull updates into the form when a unit gets
  // selected. Never blanks the field on a selection clear — preserves
  // any manually-typed value.
  //
  // set-state-in-effect disable: selection is external React state we
  // bridge into local form state the user can also edit. Same pattern
  // as the QueryBuilder URL/seed-hydration carve-out.
  /* eslint-disable react-hooks/set-state-in-effect -- selection-bar bridge to local form state */
  useEffect(() => {
    if (selection.unit) {
      setForm((f) =>
        f.unitDocId === selection.unit ? f : { ...f, unitDocId: selection.unit ?? '' },
      );
      setIsAutoFilled(true);
    }
  }, [selection.unit]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const refetch = query.refetch;
  const handleRun = useCallback(() => {
    setFormError(null);
    const result = buildRequestBody(form);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    // F-4: identical committed args → queryKey hash unchanged →
    // useQuery won't refetch on its own. An explicit Run press is the
    // user's intent to re-hit the network, so call refetch() directly
    // when the body matches; otherwise commit the new args and let
    // useQuery auto-fire on the new key.
    if (
      committedArgs !== null &&
      requestBodyEqual(committedArgs, result)
    ) {
      refetch();
    } else {
      setCommittedArgs(result);
    }
  }, [form, committedArgs, refetch]);
  // NB: stale-state reset on dataset change happens at the parent
  // (`workspace-client.tsx` keys the panel stack by `datasetId`).

  // Auto-run when the unit is auto-filled + valid. Debounced 400ms.
  // The committed args naturally dedup repeat fires via useQuery's
  // queryKey hash — no lastAutoRunRef needed post-F-4. The ref-based
  // pre-F-4 guard was a workaround for useMutation always firing on
  // mutate(); useQuery skips identical-key fetches by design.
  useEffect(() => {
    if (!isAutoFilled) return;
    const unit = form.unitDocId.trim();
    if (!isValidDocId(unit)) return;
    const handle = setTimeout(() => {
      const built = buildRequestBody({ ...form, unitDocId: unit });
      if ('error' in built) return;
      setCommittedArgs((prev) => {
        // Bail out early if the candidate body matches prev — preserves
        // ref equality so consumers that depend on committedArgs don't
        // re-run. The useQuery key would dedup anyway but skipping the
        // state update is cheaper.
        if (prev !== null && requestBodyEqual(prev, built)) return prev;
        return built;
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [isAutoFilled, form]);

  function onUnitChange(value: string) {
    setForm((f) => ({ ...f, unitDocId: value }));
    if (isAutoFilled && value !== selection.unit) {
      setIsAutoFilled(false);
    }
  }

  // Pull the two chart payloads out of the latest response. The
  // backend returns `chart_payloads: SpikeChartPayload[]` with 0, 1,
  // or 2 entries depending on `kind`. We discriminate on the
  // payload's own `kind` field so the order is irrelevant.
  const charts = useMemo(() => {
    const data = query.data;
    if (!data || isErrorEnvelope(data)) return null;
    const result = data;
    let raster: SpikeRasterChartPayload | null = null;
    let isi: IsiHistogramChartPayload | null = null;
    for (const p of result.chart_payloads) {
      if (p.kind === 'raster') raster = p;
      else if (p.kind === 'isi_histogram') isi = p;
    }
    return { raster, isi, result };
  }, [query.data]);

  // Args for ShowCodeButton — only meaningful after a successful run.
  const showCodeArgs = useMemo(() => {
    const built = buildRequestBody(form);
    return 'error' in built
      ? { datasetId, kind: form.kind }
      : { datasetId, ...built };
  }, [form, datasetId]);

  const errorEnvelope =
    query.data && isErrorEnvelope(query.data) ? query.data : null;
  const networkError = query.error;
  const isRunning = query.isFetching;
  const hasSuccessRun =
    !!query.data && !isErrorEnvelope(query.data) && !query.isFetching;
  const showAutoHint = isAutoFilled && !!form.unitDocId;
  // Illustrated empty state: no run pending, no run completed, nothing
  // typed manually, no validation error showing. Surface the raster
  // preview + hint.
  const showEmptyState =
    !isRunning &&
    !networkError &&
    !errorEnvelope &&
    !charts &&
    !formError &&
    form.unitDocId.trim().length === 0 &&
    form.unitNameMatch.trim().length === 0;

  return (
    <PanelCard
      icon={Activity}
      title="Spike activity"
      subtitle="Spike raster + ISI histogram for one or more units."
      headingId={headingId}
      id="spike-activity"
      pulse={pulse}
      footer={
        <>
          <Button
            type="button"
            variant="primary"
            onClick={handleRun}
            disabled={isRunning}
            data-testid="spike-activity-run"
          >
            {isRunning ? 'Running…' : 'Run'}
          </Button>
          {hasSuccessRun && (
            <ShowCodeButton
              toolName="fetch_spike_summary"
              args={showCodeArgs}
              result={
                query.data && !isErrorEnvelope(query.data)
                  ? query.data
                  : undefined
              }
            />
          )}
        </>
      }
    >
      {showAutoHint && (
        <span
          className="inline-block text-[10.5px] tracking-eyebrow uppercase text-brand-blue/80 font-bold"
          data-testid="spike-activity-auto-hint"
        >
          Auto from selection
        </span>
      )}

      <ParameterForm
        form={form}
        onUnitChange={onUnitChange}
        onChange={setForm}
        disabled={isRunning}
        formError={formError}
        onRun={handleRun}
      />

      <div>
        {showEmptyState && (
          <PanelEmptyState
            illustration="raster"
            title="Plot spike activity"
            hint={<>Pick a unit (vmspikesummary document).</>}
            testId="spike-activity-empty"
          />
        )}
        {isRunning && <LoadingState />}
        {!isRunning && networkError && (
          <ErrorBlock message={describeNetworkError(networkError)} />
        )}
        {!isRunning && errorEnvelope && (
          <ErrorBlock message={errorEnvelope.error} />
        )}
        {!isRunning &&
          charts &&
          (charts.raster ||
            charts.isi ||
            charts.result.unit_count === 0) && (
            <ResultArea
              datasetId={datasetId}
              raster={charts.raster}
              isi={charts.isi}
              emptyHint={charts.result.empty_hint?.reason}
              unitCount={charts.result.unit_count}
            />
          )}
      </div>
    </PanelCard>
  );
}

interface ParameterFormProps {
  form: FormState;
  onUnitChange: (value: string) => void;
  onChange: (next: FormState) => void;
  disabled: boolean;
  formError: string | null;
  onRun: () => void;
}

function ParameterForm({
  form,
  onUnitChange,
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

        {/* The unit document ID lives under "Advanced — manual override"
            because the primary intake is the selection-bar auto-fill.
            Keep accessible (debugging, power users) but don't dominate
            the primary attention. The other tuning knobs (window,
            max units, kind) remain prominent. */}
        <details className="rounded-md border border-border-subtle bg-bg-canvas px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] font-medium text-fg-secondary">
            Advanced — manual override
          </summary>
          <div className="mt-3 space-y-3">
            <TextField
              label="Unit document ID"
              hint="Mongo _id (24 hex) or NDI ndiId (16+16 hex) — fetches a single vmspikesummary document."
              value={form.unitDocId}
              onChange={onUnitChange}
              placeholder="optional"
            />

            <TextField
              label="Unit name match"
              hint='Case-insensitive substring on unit names (e.g. "Saline", "BNST").'
              value={form.unitNameMatch}
              onChange={(v) => set('unitNameMatch', v)}
              placeholder="optional"
            />
          </div>
        </details>

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

      {/* Hidden submit so Enter triggers Run; visible button lives in the
          PanelCard footer. */}
      <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
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
      <label htmlFor={id} className="text-[13px] font-medium text-fg-primary">
        {label}
      </label>
      <Input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={hintId}
      />
      {hint && (
        <p id={hintId} className="text-[11.5px] text-fg-secondary m-0">
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
      <span className="text-[13px] font-medium text-fg-primary">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-3"
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className="inline-flex items-center gap-2 text-[13px] text-fg-primary cursor-pointer"
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
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
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
        className="rounded-md border border-border-subtle bg-bg-surface-subtle px-3 py-4 text-[13px] text-fg-secondary"
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

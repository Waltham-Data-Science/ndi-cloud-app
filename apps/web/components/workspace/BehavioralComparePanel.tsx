'use client';

/**
 * BehavioralComparePanel — workspace panel that drives
 * `/api/datasets/:id/tabular_query` (same backend as the chat's
 * `tabular_query` tool). Form → Run → ViolinChart + summary table →
 * Show code. Mirrors SignalViewerPanel. The empty-result UX
 * surfaces the backend's _meta.columns hint as one-click retry
 * buttons — the chat handled this in its prompt loop; we expose it
 * as UI.
 *
 * F-4 (2026-05-18): Converted from `useMutation` → `useQuery` keyed
 * on the committed args. Two consecutive Runs with the same form
 * values no longer re-hit the network — TanStack Query dedups by
 * queryKey hash. The Run button forces an explicit refetch when args
 * are unchanged; the empty-hint column-pick button stages a new
 * groupBy + commits, so it always fires a new fetch.
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';

import { ViolinChart } from '@/components/ndi/charts/ViolinChart';
import { PanelCard } from '@/components/workspace/PanelCard';
import { ShowCodeButton } from '@/components/workspace/ShowCodeButton';
import {
  DerivedColumnControls,
  useDerivedColumns,
} from '@/components/workspace/canvas/DerivedColumnControls';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiError, apiFetch } from '@/lib/api/client';
import {
  formatDerivedCell,
  type DerivedColumn,
} from '@/lib/workspace/derived-columns';
import { usePanelChangeIndicator } from '@/lib/workspace/use-panel-change-indicator';

export interface BehavioralComparePanelProps {
  datasetId: string;
}

interface RunArgs {
  variableNameContains: string;
  groupBy?: string;
  groupOrder?: string[];
  title?: string;
}

interface GroupSummary {
  name: string;
  count: number;
  mean: number;
  median: number;
  std: number;
  // Wider chat-tool fields the wrapper returns. Not currently shown
  // in the table but kept on the type so future column-addition work
  // doesn't have to re-thread the shape.
  min?: number;
  max?: number;
  q1?: number;
  q3?: number;
}

interface EmptyHint {
  reason: string;
  available_columns?: string[];
  available_variable_names?: string[];
}

/**
 * Response shape of the workspace wrapper at
 * `POST /api/datasets/[id]/tabular-query`. Mirrors
 * `TabularQueryToolResult` from `@/lib/ndi/tools/tabular-query` (kept
 * structural so this panel doesn't depend on the chat tool's
 * citation / references typing).
 */
interface RunResult {
  groups_summary: GroupSummary[];
  chart_payload: {
    datasetId: string;
    variableNameContains: string;
    groupBy?: string;
    groupOrder?: string[];
    title?: string;
  };
  empty_hint?: EmptyHint;
}

/**
 * `{ error: string }` envelope the wrapper returns on
 * handler-level failures (timeout, upstream 5xx, invalid input).
 * The wrapper still emits HTTP 200 + this body so the panel
 * discriminates on the presence of `error` rather than catching.
 */
function isErrorEnvelope(r: unknown): r is { error: string } {
  return (
    typeof r === 'object' &&
    r !== null &&
    'error' in r &&
    typeof (r as { error: unknown }).error === 'string' &&
    !('groups_summary' in r)
  );
}

/**
 * Compare two RunArgs structurally — used post-F-4 to decide whether
 * an explicit Run press should refetch (same args, cache would hit)
 * or commit new args (different args, useQuery fires automatically).
 * groupOrder is compared element-wise.
 */
function runArgsEqual(a: RunArgs, b: RunArgs): boolean {
  if (a.variableNameContains !== b.variableNameContains) return false;
  if (a.groupBy !== b.groupBy) return false;
  if (a.title !== b.title) return false;
  const ao = a.groupOrder;
  const bo = b.groupOrder;
  if (ao === undefined && bo === undefined) return true;
  if (ao === undefined || bo === undefined) return false;
  if (ao.length !== bo.length) return false;
  for (let i = 0; i < ao.length; i++) {
    if (ao[i] !== bo[i]) return false;
  }
  return true;
}

async function runTabularQuery(
  datasetId: string,
  args: RunArgs,
  signal?: AbortSignal,
): Promise<RunResult> {
  // Migrated 2026-05-15 (Stream 4.1): was a GET to the Vercel
  // rewrite at /api/datasets/:id/tabular_query (underscore-spelled
  // FastAPI path). Now POSTs to the dedicated workspace wrapper at
  // /api/datasets/:id/tabular-query, which forwards auth headers and
  // the inbound x-request-id via toolContextFromRequest. The wrapper
  // calls the chat-side tabularQueryHandler so chat + workspace
  // render identical stats / chart payloads off one code path.
  // F-4 (2026-05-18): accepts the TanStack Query `signal` so a
  // cancelled / superseded query cancels its in-flight fetch instead
  // of racing the next one.
  const url = `/api/datasets/${encodeURIComponent(datasetId)}/tabular-query`;
  const body: Record<string, unknown> = {
    variableNameContains: args.variableNameContains,
  };
  if (args.groupBy) body.groupBy = args.groupBy;
  if (args.groupOrder && args.groupOrder.length > 0) {
    body.groupOrder = args.groupOrder;
  }
  if (args.title) body.title = args.title;

  const res = await apiFetch<RunResult | { error: string }>(url, {
    method: 'POST',
    body,
    signal,
  });
  if (isErrorEnvelope(res)) {
    // Map the wrapper's `{ error: "<msg>" }` envelope into a thrown
    // ApiError so the panel's existing isError branch lights up. The
    // wrapper has already logged a structured event server-side; this
    // throw just routes the message into the existing ErrorBox.
    throw new ApiError(500, {
      code: 'tabular_query_failed',
      message: res.error,
    });
  }
  return res;
}

export function BehavioralComparePanel({
  datasetId,
}: BehavioralComparePanelProps) {
  // H7 pulse: dataset-wide panel — empty deps means no pulse will
  // fire. Call the hook anyway so the wiring is consistent with the
  // other panels (cheap, deterministic, makes future selection-aware
  // expansion a one-line change).
  const pulse = usePanelChangeIndicator([]);

  const [variableNameContains, setVariableNameContains] = useState('');
  const [groupBy, setGroupBy] = useState('');
  const [groupOrderInput, setGroupOrderInput] = useState('');
  const [title, setTitle] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Derived columns live for the lifetime of this panel instance —
  // not persisted to URL / localStorage. The parent keys the panel
  // stack by datasetId so a dataset switch already remounts and
  // clears these; on a re-run within the same dataset we KEEP the
  // derived columns since they're still valid against the new
  // groups_summary rows (same shape from the chat-tool wrapper).
  const derived = useDerivedColumns();

  // F-4: committed args drive the useQuery key. handleRun stages the
  // current form into committedArgs; useQuery auto-fires when args
  // change. Two consecutive Runs with same args call refetch()
  // explicitly so the network round-trip happens on demand.
  const [committedArgs, setCommittedArgs] = useState<RunArgs | null>(null);

  const query = useQuery<RunResult, Error>({
    queryKey: [
      'tabular-query',
      datasetId,
      committedArgs?.variableNameContains ?? null,
      committedArgs?.groupBy ?? null,
      committedArgs?.groupOrder ?? null,
      committedArgs?.title ?? null,
    ],
    queryFn: ({ signal }) => runTabularQuery(datasetId, committedArgs!, signal),
    enabled: committedArgs !== null,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
  // NB: stale-state reset on dataset change happens at the parent
  // (`workspace-client.tsx` keys the panel stack by `datasetId` so
  // React full-remounts the tree). No per-panel effect needed.

  // lastArgs is now just the committed args — the panel renders the
  // ShowCodeButton with whatever args produced the visible result.
  const lastArgs: RunArgs | null = committedArgs;

  const refetch = query.refetch;
  const handleRun = useCallback(() => {
    const trimmed = variableNameContains.trim();
    if (!trimmed) {
      setValidationError('Variable name is required.');
      return;
    }
    setValidationError(null);
    const groupOrder = groupOrderInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const args: RunArgs = {
      variableNameContains: trimmed,
      ...(groupBy.trim() ? { groupBy: groupBy.trim() } : {}),
      ...(groupOrder.length > 0 ? { groupOrder } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
    };
    // F-4: explicit Run → refetch when args are unchanged so the
    // network call still fires; otherwise commit new args.
    if (committedArgs !== null && runArgsEqual(committedArgs, args)) {
      refetch();
    } else {
      setCommittedArgs(args);
    }
  }, [variableNameContains, groupBy, groupOrderInput, title, committedArgs, refetch]);

  const retryWithColumn = useCallback(
    (column: string) => {
      setGroupBy(column);
      const trimmed = variableNameContains.trim();
      if (!trimmed) return;
      const groupOrder = groupOrderInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const args: RunArgs = {
        variableNameContains: trimmed,
        groupBy: column,
        ...(groupOrder.length > 0 ? { groupOrder } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
      };
      // Empty-hint pick is by construction a NEW column → args differ
      // → new key, new fetch. Use refetch() as a safety net if it ever
      // matches (e.g. user clicks the same pick twice).
      if (committedArgs !== null && runArgsEqual(committedArgs, args)) {
        refetch();
      } else {
        setCommittedArgs(args);
      }
    },
    [variableNameContains, groupOrderInput, title, committedArgs, refetch],
  );

  const showResult =
    query.isFetching || query.isError || query.isSuccess;
  const hasSuccess =
    query.isSuccess &&
    !!query.data &&
    query.data.groups_summary.length > 0;
  const hasEmpty =
    query.isSuccess &&
    !!query.data &&
    query.data.groups_summary.length === 0 &&
    !!query.data.empty_hint;

  return (
    <PanelCard
      icon={BarChart3}
      title="Behavioral comparison"
      subtitle="Compare a measurement across groups (e.g. Saline vs CNO) as a violin chart."
      headingId="behavioral-compare-panel-heading"
      id="behavioral-compare"
      pulse={pulse}
      footer={
        <>
          <Button type="button" variant="primary" onClick={handleRun} disabled={query.isFetching} data-testid="behavioral-compare-run">
            {query.isFetching ? 'Running…' : 'Run'}
          </Button>
          {hasSuccess && lastArgs && (
            <ShowCodeButton toolName="tabular_query" args={{ datasetId, ...lastArgs }} result={query.data} />
          )}
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleRun();
        }}
        data-testid="behavioral-compare-form"
      >
        <TextField
          label="Variable name contains"
          required
          hint="Substring match against the table's variable names."
          placeholder="e.g. ElevatedPlusMaze, FearPotentiatedStartle, Chemotaxis"
          value={variableNameContains}
          onChange={setVariableNameContains}
          testId="behavioral-compare-variable-input"
          errorId="behavioral-compare-variable-error"
          error={validationError}
        />
        <TextField
          label="Group by"
          hint="Substring match against the grouping column key."
          placeholder="e.g. Treatment, Strain, Genotype, Stimulation"
          value={groupBy}
          onChange={setGroupBy}
          testId="behavioral-compare-groupby-input"
        />
        <TextField
          label="Group order"
          hint="Comma-separated explicit left-to-right ordering."
          placeholder="e.g. Saline, CNO"
          value={groupOrderInput}
          onChange={setGroupOrderInput}
          testId="behavioral-compare-grouporder-input"
        />
        <TextField
          label="Title"
          hint="Optional chart title."
          placeholder="EPM open-arm entries by treatment"
          value={title}
          onChange={setTitle}
          testId="behavioral-compare-title-input"
        />
        {/* Hidden submit so Enter triggers run; visible button lives in footer. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>

      {showResult && (
        <div className="pt-2" data-testid="behavioral-compare-result">
          {query.isFetching && (
            <div aria-label="Loading behavioral comparison" className="space-y-2">
              <Skeleton className="h-[360px] w-full rounded-md" />
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          )}
          {!query.isFetching && query.isError && <ErrorBox error={query.error} />}
          {!query.isFetching && hasEmpty && query.data?.empty_hint && (
            <EmptyHintBox
              hint={query.data.empty_hint}
              onPick={retryWithColumn}
            />
          )}
          {!query.isFetching && hasSuccess && query.data && (
            <SuccessView
              result={query.data}
              derivedColumns={derived.derivedColumns}
              onAddDerived={derived.add}
              onRemoveDerived={derived.remove}
            />
          )}
        </div>
      )}
    </PanelCard>
  );
}

function TextField(props: {
  label: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  errorId?: string;
  error?: string | null;
}) {
  const { label, required, hint, placeholder, value, onChange, testId, errorId, error } = props;
  return (
    <label className="block text-[13px] font-medium text-fg-primary">
      <span className="flex items-baseline gap-1">
        <span>{label}</span>
        {required && <span className="text-red-600" aria-label="required">*</span>}
      </span>
      <div className="mt-1">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && errorId ? errorId : undefined}
          data-testid={testId}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-[12px] font-normal text-red-600">
          {error}
        </p>
      )}
      {hint && !error && (
        <span className="mt-1 block text-[11.5px] font-normal text-fg-secondary">{hint}</span>
      )}
    </label>
  );
}

function ErrorBox({ error }: { error: unknown }) {
  let message = 'Something went wrong while running the query.';
  let requestId: string | null = null;
  if (error instanceof ApiError) {
    message = error.message ?? message;
    requestId = error.requestId ?? null;
  } else if (error instanceof Error) {
    message = error.message;
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900"
      data-testid="behavioral-compare-error"
    >
      <p className="font-medium">{message}</p>
      {requestId && (
        <p className="mt-1 font-mono text-[11px] text-amber-800">
          Request ID: {requestId}
        </p>
      )}
    </div>
  );
}

function EmptyHintBox({
  hint,
  onPick,
}: {
  hint: EmptyHint;
  onPick: (column: string) => void;
}) {
  const columns = hint.available_columns ?? [];
  const variableNames = hint.available_variable_names ?? [];
  return (
    <div
      role="status"
      className="rounded-md border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-900"
      data-testid="behavioral-compare-empty-hint"
    >
      <p className="font-medium">No matching groups returned.</p>
      <p className="mt-1 text-[12.5px]">{hint.reason}</p>
      {columns.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-medium">
            Retry with one of these columns as <span className="font-mono">groupBy</span>:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="behavioral-compare-empty-columns">
            {columns.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onPick(c)}
                className="rounded-full border border-blue-300 bg-white px-2.5 py-1 text-[12px] font-mono text-blue-800 hover:bg-blue-100"
                data-testid="behavioral-compare-empty-column-pick"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      {variableNames.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-medium">Available variable names (try a different substring):</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-[11.5px]">
            {variableNames.slice(0, 8).map((v) => <li key={v}>{v}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

const BASE_HEADERS = ['Group', 'n', 'Mean', 'Median', 'Std'] as const;
const NUM_CLS = 'py-1.5 pr-3 text-right font-mono tabular-nums';

/**
 * Column names exposed to user-typed derived-column formulas. These
 * match the JSON keys on each GroupSummary row, so a user typing
 * `std / mean` references the same numeric the table column shows.
 * `count` is the integer N — most useful for normalising by sample
 * size.
 */
const DERIVED_COLUMN_HINT = [
  'count',
  'mean',
  'median',
  'std',
  'min',
  'max',
  'q1',
  'q3',
] as const;

function SuccessView({
  result,
  derivedColumns,
  onAddDerived,
  onRemoveDerived,
}: {
  result: RunResult;
  derivedColumns: ReadonlyArray<DerivedColumn>;
  onAddDerived: (column: DerivedColumn) => void;
  onRemoveDerived: (id: string) => void;
}) {
  const { chart_payload, groups_summary } = result;
  return (
    <div data-testid="behavioral-compare-success">
      <ViolinChart
        datasetId={chart_payload.datasetId}
        variableNameContains={chart_payload.variableNameContains}
        groupBy={chart_payload.groupBy}
        groupOrder={chart_payload.groupOrder}
        title={chart_payload.title}
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[12.5px]" data-testid="behavioral-compare-summary-table">
          <thead>
            <tr className="border-b border-border-subtle text-left text-fg-secondary">
              {BASE_HEADERS.map((h, i) => (
                <th key={h} className={`py-1.5 pr-3 font-medium${i === 0 ? '' : ' text-right'}`}>
                  {h}
                </th>
              ))}
              {derivedColumns.map((c) => (
                <th
                  key={c.id}
                  className="py-1.5 pr-3 font-medium text-right"
                  title={`Derived: ${c.label} = ${c.formula}`}
                  data-testid="behavioral-compare-derived-header"
                  data-derived-id={c.id}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className="italic">{c.label}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups_summary.map((g) => (
              <tr key={g.name} className="border-b border-border-subtle/60 last:border-b-0">
                <td className="py-1.5 pr-3 font-mono text-fg-primary">{g.name}</td>
                <td className={NUM_CLS}>{g.count}</td>
                <td className={NUM_CLS}>{fmt(g.mean)}</td>
                <td className={NUM_CLS}>{fmt(g.median)}</td>
                <td className={NUM_CLS}>{fmt(g.std)}</td>
                {derivedColumns.map((c) => {
                  const v = c.evaluator(
                    g as unknown as Record<string, unknown>,
                  );
                  return (
                    <td
                      key={c.id}
                      className={NUM_CLS}
                      data-testid="behavioral-compare-derived-cell"
                      data-derived-id={c.id}
                    >
                      {formatDerivedCell(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3" data-testid="behavioral-compare-derived-controls">
        <DerivedColumnControls
          derivedColumns={derivedColumns}
          onAdd={onAddDerived}
          onRemove={onRemoveDerived}
          availableColumns={DERIVED_COLUMN_HINT}
        />
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  if (abs >= 1000 || abs < 0.01) return n.toExponential(2);
  return n.toFixed(3);
}

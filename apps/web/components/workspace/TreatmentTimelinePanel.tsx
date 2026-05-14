'use client';

/**
 * TreatmentTimelinePanel — the /my workspace's Gantt-style treatment-timeline
 * widget. Mirrors the panel shape established by SignalViewerPanel
 * (parent-built canonical template): header + parameter form + Run button +
 * result area + Show-Code affordance.
 *
 * Backend contract — same endpoint the chat-side `treatment_timeline` tool
 * targets, via the FastAPI proxy:
 *
 *   POST /api/datasets/:id/treatment-timeline
 *   body: { title?: string, maxSubjects?: number }
 *   →    TreatmentTimelineResult (see lib/ai/tools/treatment-timeline.ts)
 *
 * On success the response carries:
 *   - `chart_payload` — forwarded straight into <GanttChart/>
 *   - `temporal_source` — drives the "order, not time" warning callout
 *   - `total_subjects` / `total_treatments` — small caption beneath the chart
 *   - `empty_hint` — surfaced plainly when no rows had a usable
 *     subject+treatment pair (the chart never paints in that branch)
 *
 * Loading + error + empty are first-class states; Run is disabled while the
 * mutation is in flight so a double-click doesn't fire two requests. The
 * `Show Code` button only appears once the panel has a successful result —
 * before that, there's no toolCall to export.
 */

import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';
import { GanttChart, type GanttChartItem } from '@/components/charts/GanttChart';
import { CodeExportButton } from '@/components/ai/CodeExportButton';
import { Skeleton } from '@/components/ui/Skeleton';
import type { RecordedToolCall } from '@/lib/ai/code-export/types';

export interface TreatmentTimelinePanelProps {
  datasetId: string;
}

interface TreatmentTimelineRequestBody {
  title?: string;
  maxSubjects?: number;
}

/**
 * Mirrors `TreatmentTimelineResult` from
 * `lib/ai/tools/treatment-timeline.ts`. Kept structural (only the fields the
 * panel renders) so it stays decoupled from the tool's reference / citation
 * schema — those land in chat, not this workspace surface.
 */
interface TreatmentTimelineResponse {
  chart_payload: {
    datasetId: string;
    title?: string;
    xLabel?: string;
    items: GanttChartItem[];
  };
  total_subjects: number;
  total_treatments: number;
  temporal_source: 'explicit' | 'ordinal' | 'mixed';
  empty_hint?: {
    reason: string;
    available_columns?: string[];
  };
}

const DEFAULT_MAX_SUBJECTS = 30;
const MAX_SUBJECTS_CAP = 100;

export function TreatmentTimelinePanel({ datasetId }: TreatmentTimelinePanelProps) {
  const titleId = useId();
  const maxSubjectsId = useId();
  const [title, setTitle] = useState('');
  const [maxSubjects, setMaxSubjects] = useState('');
  // Hold the last-run params in state (not a ref) so render-time consumers
  // — specifically the Show-Code button's toolCall arg — read a stable
  // value that is set together with the mutation result. Storing this in
  // useState rather than a ref keeps React happy under the
  // react-hooks/refs rule (refs aren't read during render).
  const [lastRunArgs, setLastRunArgs] = useState<
    TreatmentTimelineRequestBody & { datasetId: string }
  >({ datasetId });

  const mutation = useMutation<TreatmentTimelineResponse, Error, TreatmentTimelineRequestBody>({
    mutationFn: (body) =>
      apiFetch<TreatmentTimelineResponse>(
        `/api/datasets/${encodeURIComponent(datasetId)}/treatment-timeline`,
        { method: 'POST', body },
      ),
  });

  function onRun() {
    const body: TreatmentTimelineRequestBody = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 0) body.title = trimmedTitle;
    const parsedMax = parseMaxSubjects(maxSubjects);
    if (parsedMax !== null) body.maxSubjects = parsedMax;
    setLastRunArgs({ datasetId, ...body });
    mutation.mutate(body);
  }

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4"
      aria-label="Treatment timeline panel"
      data-testid="treatment-timeline-panel"
    >
      <header className="mb-3">
        <h2 className="text-base font-semibold text-gray-900">Treatment timeline</h2>
        <p className="text-[13px] text-gray-600">
          Gantt-style view of which subjects received which treatments and when.
        </p>
      </header>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mutation.isPending) onRun();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={titleId} className="text-[12px] font-medium text-gray-700">
            Title <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Chart title"
            maxLength={160}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-[13px] focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={maxSubjectsId} className="text-[12px] font-medium text-gray-700">
            Max subjects <span className="text-gray-400">(default {DEFAULT_MAX_SUBJECTS})</span>
          </label>
          <input
            id={maxSubjectsId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SUBJECTS_CAP}
            step={1}
            value={maxSubjects}
            onChange={(e) => setMaxSubjects(e.target.value)}
            placeholder={String(DEFAULT_MAX_SUBJECTS)}
            className="rounded-md border border-gray-300 px-2.5 py-1.5 text-[13px] focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
          />
        </div>
      </form>

      <div className="mt-3">
        <button
          type="button"
          onClick={onRun}
          disabled={mutation.isPending}
          className="rounded-md bg-brand-navy px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="treatment-timeline-run"
        >
          {mutation.isPending ? 'Running…' : 'Run'}
        </button>
      </div>

      <ResultArea
        isPending={mutation.isPending}
        isError={mutation.isError}
        error={mutation.error}
        data={mutation.data}
        datasetId={datasetId}
      />

      {mutation.isSuccess && mutation.data && (
        <div className="mt-3 flex justify-end" data-testid="treatment-timeline-show-code-row">
          <CodeExportButton
            toolCalls={buildToolCall(lastRunArgs)}
            question="Treatment timeline (workspace panel)"
          />
        </div>
      )}
    </section>
  );
}

interface ResultAreaProps {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: TreatmentTimelineResponse | undefined;
  datasetId: string;
}

/**
 * Result area — pulled out so the loading / error / empty / success
 * branches don't clutter the form scaffolding. Branch order:
 *   1. Pending  → skeleton placeholder
 *   2. Error    → friendly inline error
 *   3. Empty    → empty_hint surfaced plainly
 *   4. Success  → temporal-source warning (if applicable) + GanttChart + meta
 *
 * Before any Run has fired (data === undefined, !isPending, !isError) we
 * render nothing — the form alone is enough surface to communicate intent.
 */
function ResultArea({ isPending, isError, error, data, datasetId }: ResultAreaProps) {
  if (isPending) {
    return (
      <div className="mt-4 space-y-2" aria-label="Loading treatment timeline" data-testid="treatment-timeline-loading">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-[240px] w-full" />
      </div>
    );
  }
  if (isError) {
    const msg = error?.message ?? 'Failed to load treatment timeline';
    return (
      <div
        role="alert"
        className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900"
        data-testid="treatment-timeline-error"
      >
        Couldn&apos;t run treatment timeline: {msg}
      </div>
    );
  }
  if (!data) return null;

  const isEmpty = !data.chart_payload?.items || data.chart_payload.items.length === 0;
  if (isEmpty && data.empty_hint) {
    return (
      <div
        role="status"
        className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-[13px] text-gray-700"
        data-testid="treatment-timeline-empty"
      >
        <p className="font-medium text-gray-900">No treatment timeline data to display.</p>
        <p className="mt-1">{data.empty_hint.reason}</p>
        {data.empty_hint.available_columns && data.empty_hint.available_columns.length > 0 && (
          <p className="mt-1 text-[12px] text-gray-500">
            Available columns: {data.empty_hint.available_columns.join(', ')}
          </p>
        )}
      </div>
    );
  }

  const needsTemporalWarning =
    data.temporal_source === 'ordinal' || data.temporal_source === 'mixed';

  return (
    <div className="mt-4" data-testid="treatment-timeline-result">
      {needsTemporalWarning && (
        <div
          role="status"
          className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
          data-testid="treatment-timeline-ordinal-warning"
        >
          <WarnIcon />
          <span>
            Bars show administration ORDER, not real time — this dataset doesn&apos;t
            record per-treatment timestamps.
          </span>
        </div>
      )}

      <GanttChart
        datasetId={datasetId}
        title={data.chart_payload.title}
        xLabel={data.chart_payload.xLabel}
        items={data.chart_payload.items}
      />

      <p className="mt-2 text-[12px] text-gray-500" data-testid="treatment-timeline-meta">
        {data.total_subjects} subject{data.total_subjects === 1 ? '' : 's'},{' '}
        {data.total_treatments} treatment{data.total_treatments === 1 ? '' : 's'}
      </p>
    </div>
  );
}

/**
 * Parse the maxSubjects form value. Empty / non-numeric / out-of-range
 * inputs collapse to `null` so the request body simply omits the field —
 * the backend's default (30) takes over. Values above the cap (100) are
 * clamped rather than rejected because the failure mode of "user typed 200,
 * got 100" is more useful than a form error in this lightweight panel.
 */
function parseMaxSubjects(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return Math.min(n, MAX_SUBJECTS_CAP);
}

/**
 * Build the synthetic tool-call list passed to CodeExportButton so the
 * generated Python / MATLAB snippet mirrors what this panel ran. The
 * `treatment_timeline` toolName matches the canonical NDI-python wrapper
 * that the code-export generators know how to emit.
 */
function buildToolCall(
  args: TreatmentTimelineRequestBody & { datasetId: string },
): RecordedToolCall[] {
  // Strip empty fields so the snippet doesn't render `title: ""` lines.
  const cleanedArgs: Record<string, unknown> = { datasetId: args.datasetId };
  if (args.title) cleanedArgs.title = args.title;
  if (typeof args.maxSubjects === 'number') cleanedArgs.maxSubjects = args.maxSubjects;
  return [{ toolName: 'treatment_timeline', args: cleanedArgs }];
}

/**
 * Tiny inline triangle-bang icon used to call out the ordinal-timing
 * caveat. Inlined rather than pulled from lucide-react because the panel
 * surfaces only one icon and dragging in lucide for a single glyph isn't
 * worth the bundle hit.
 */
function WarnIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width="14"
      height="14"
      className="mt-0.5 shrink-0 text-amber-700"
      fill="currentColor"
    >
      <path d="M10 2.5 1.5 17h17L10 2.5Zm0 4.5a.8.8 0 0 1 .8.8v4a.8.8 0 0 1-1.6 0v-4a.8.8 0 0 1 .8-.8Zm0 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  );
}


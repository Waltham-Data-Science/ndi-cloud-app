'use client';

/**
 * TreatmentTimelinePanel — Gantt-style treatment-timeline widget in the
 * /my workspace. Same backend contract as the chat's
 * `treatment_timeline` tool (POST /api/datasets/:id/treatment-timeline),
 * driven by a parameter form here instead of the LLM tool loop.
 *
 * Migrated 2026-05-15 (Stream 4.2 + 4.4) to the canonical workspace
 * panel pattern — PanelCard chrome, `<Button>` for Run, and
 * `<ShowCodeButton>` for the code-export affordance. Previously this
 * file used a bespoke `<section>` with raw Tailwind color literals
 * (`text-gray-900`, `border-gray-200`, `bg-brand-navy`) and `<h2>`,
 * breaking heading-level outline and visual consistency with the
 * other 6 panels.
 *
 * Dataset-wide (no selection wiring): the treatment timeline is
 * dataset-scoped — there's no subject/session/probe/etc. context to
 * read from. The one-canvas redesign (2026-05-16) leaves this panel
 * out of the selection model but ADDS an auto-run-on-mount so the
 * user lands on a populated chart without needing to click Run.
 *
 * Auto-run defaults: the chat-tool input schema (`treatmentTimelineInput`
 * in `lib/ndi/tools/treatment-timeline.ts`) only takes `title` +
 * `maxSubjects`. Both are optional — backend picks sensible defaults
 * for `maxSubjects` (30) and infers `temporal_source` from the
 * dataset's actual columns. We auto-run with an EMPTY body so the
 * backend's auto-discovery path takes over; this is the simplest fix
 * for the "no treatments on Francesconi" complaint without shipping
 * a `panel-defaults` endpoint (deferred per the design doc).
 *
 * TODO(panel-defaults): if the backend gains a
 * /api/datasets/:id/panel-defaults/treatment-timeline endpoint (see
 * §"Default form discovery" in the canvas redesign doc), wire it
 * into the auto-run path so the discovered groupBy / subjectColumn
 * land in the request body. For v1, empty-body auto-run is enough.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';

import { apiFetch } from '@/lib/api/client';
import {
  GanttChart,
  type GanttChartItem,
} from '@/components/ndi/charts/GanttChart';
import { PanelCard } from '@/components/workspace/PanelCard';
import { ShowCodeButton } from '@/components/workspace/ShowCodeButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';

export interface TreatmentTimelinePanelProps {
  datasetId: string;
}

interface TreatmentTimelineRequestBody {
  title?: string;
  maxSubjects?: number;
}

/**
 * Mirrors `TreatmentTimelineResult` from
 * `lib/ndi/tools/treatment-timeline.ts`. Kept structural (only the fields
 * the panel renders) so it stays decoupled from the tool's reference /
 * citation schema — those land in chat, not this workspace surface.
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

export function TreatmentTimelinePanel({
  datasetId,
}: TreatmentTimelinePanelProps) {
  // Stable literal ids — match the convention the other 5 panels
  // use ("panel-signal-viewer" etc.). Phase F smoke (2026-05-16)
  // flagged that the prior `useId()` values like `_r_b_` leaked into
  // the a11y tree as `aria-labelledby`, which is technically valid
  // but harder to debug than a meaningful literal. Form-field ids
  // still use useId since they're scoped to a single panel and
  // collision-safe even when the panel is rendered twice.
  const headingId = 'panel-treatment-timeline';
  const titleId = useId();
  const maxSubjectsId = useId();
  const [title, setTitle] = useState('');
  const [maxSubjects, setMaxSubjects] = useState('');
  // Hold last-run args in state (not a ref) so render-time consumers
  // — specifically ShowCodeButton — read a stable value that is set
  // together with the mutation result. useState rather than a ref
  // keeps React happy under the react-hooks/refs rule (refs aren't
  // read during render).
  const [lastRunArgs, setLastRunArgs] = useState<
    TreatmentTimelineRequestBody & { datasetId: string }
  >({ datasetId });

  const mutation = useMutation<
    TreatmentTimelineResponse,
    Error,
    TreatmentTimelineRequestBody
  >({
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
  // NB: stale-state reset on dataset change happens at the parent
  // (`workspace-client.tsx` keys the panel stack by `datasetId`).

  // Auto-run on mount. Empty body → backend's defaults pick a
  // sensible groupBy + subjectColumn from the dataset's actual schema.
  // This is the fix for the Francesconi "no treatments" report — the
  // panel used to require a click + had a default `maxSubjects=30`
  // that wasn't the issue; the real win is letting the backend
  // discover columns automatically on the first call.
  //
  // Guarded by a ref so it only fires once per panel mount; further
  // user-driven Run clicks go through `onRun()` as before. The parent
  // keys the panel stack by `datasetId` (workspace-client.tsx) so a
  // dataset change remounts the panel and re-fires the auto-run.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    setLastRunArgs({ datasetId });
    mutation.mutate({});
    // mutation is intentionally omitted — including it would re-run
    // the effect on every render because React Query returns a new
    // mutation object reference each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const hasSuccess = mutation.isSuccess && mutation.data !== undefined;

  return (
    <PanelCard
      icon={CalendarRange}
      title="Treatment timeline"
      subtitle="Gantt-style view of which subjects received which treatments and when."
      headingId={headingId}
      id="treatment-timeline"
      footer={
        <>
          <Button
            type="button"
            variant="primary"
            onClick={onRun}
            disabled={mutation.isPending}
            data-testid="treatment-timeline-run"
          >
            {mutation.isPending ? 'Running…' : 'Run'}
          </Button>
          {hasSuccess && (
            <ShowCodeButton
              toolName="treatment_timeline"
              args={cleanArgs(lastRunArgs)}
              result={mutation.data}
            />
          )}
        </>
      }
    >
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mutation.isPending) onRun();
        }}
        data-testid="treatment-timeline-form"
      >
        <label
          htmlFor={titleId}
          className="block text-[13px] font-medium text-fg-primary"
        >
          <span className="flex items-baseline gap-1">
            <span>Title</span>
            <span className="text-fg-secondary text-[11.5px] font-normal">
              (optional)
            </span>
          </span>
          <div className="mt-1">
            <Input
              id={titleId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chart title"
              maxLength={160}
            />
          </div>
        </label>

        <label
          htmlFor={maxSubjectsId}
          className="block text-[13px] font-medium text-fg-primary"
        >
          <span className="flex items-baseline gap-1">
            <span>Max subjects</span>
            <span className="text-fg-secondary text-[11.5px] font-normal">
              (default {DEFAULT_MAX_SUBJECTS})
            </span>
          </span>
          <div className="mt-1">
            <Input
              id={maxSubjectsId}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SUBJECTS_CAP}
              step={1}
              value={maxSubjects}
              onChange={(e) => setMaxSubjects(e.target.value)}
              placeholder={String(DEFAULT_MAX_SUBJECTS)}
            />
          </div>
        </label>

        {/* Hidden submit so Enter triggers Run; visible button lives in footer. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>

      <ResultArea
        isPending={mutation.isPending}
        isError={mutation.isError}
        error={mutation.error}
        data={mutation.data}
        datasetId={datasetId}
      />
    </PanelCard>
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
function ResultArea({
  isPending,
  isError,
  error,
  data,
  datasetId,
}: ResultAreaProps) {
  if (isPending) {
    return (
      <div
        className="space-y-2"
        aria-label="Loading treatment timeline"
        data-testid="treatment-timeline-loading"
      >
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
        className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900"
        data-testid="treatment-timeline-error"
      >
        Couldn&apos;t run treatment timeline: {msg}
      </div>
    );
  }
  if (!data) return null;

  const isEmpty =
    !data.chart_payload?.items || data.chart_payload.items.length === 0;
  if (isEmpty) {
    // Backend may return `items: []` WITHOUT an `empty_hint` (the hint
    // field is optional on the response schema). Use the hint reason
    // when provided, fall back to a generic message otherwise — the
    // alternative was to drop through to the success branch and render
    // an empty GanttChart, which is visibly broken.
    return (
      <div
        role="status"
        className="rounded-md border border-border-subtle bg-bg-surface-subtle p-3 text-[13px] text-fg-secondary"
        data-testid="treatment-timeline-empty"
      >
        <p className="font-medium text-fg-primary">
          No treatment timeline data to display.
        </p>
        <p className="mt-1">
          {data.empty_hint?.reason ??
            'No treatment rows were returned for this dataset.'}
        </p>
        {data.empty_hint?.available_columns &&
          data.empty_hint.available_columns.length > 0 && (
            <p className="mt-1 text-[12px] text-fg-muted">
              Available columns: {data.empty_hint.available_columns.join(', ')}
            </p>
          )}
      </div>
    );
  }

  const needsTemporalWarning =
    data.temporal_source === 'ordinal' || data.temporal_source === 'mixed';

  return (
    <div data-testid="treatment-timeline-result">
      {needsTemporalWarning && (
        <div
          role="status"
          className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
          data-testid="treatment-timeline-ordinal-warning"
        >
          <WarnIcon />
          <span>
            Bars show administration ORDER, not real time — this dataset
            doesn&apos;t record per-treatment timestamps.
          </span>
        </div>
      )}

      <GanttChart
        datasetId={datasetId}
        title={data.chart_payload.title}
        xLabel={data.chart_payload.xLabel}
        items={data.chart_payload.items}
      />

      <p
        className="mt-2 text-[12px] text-fg-secondary"
        data-testid="treatment-timeline-meta"
      >
        {data.total_subjects} subject{data.total_subjects === 1 ? '' : 's'},{' '}
        {data.total_treatments} treatment
        {data.total_treatments === 1 ? '' : 's'}
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
 * Build the cleaned args object passed to ShowCodeButton so the
 * generated Python / MATLAB snippet mirrors what this panel ran.
 * Strip empty fields so the snippet doesn't render `title: ""` lines.
 */
function cleanArgs(
  args: TreatmentTimelineRequestBody & { datasetId: string },
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = { datasetId: args.datasetId };
  if (args.title) cleaned.title = args.title;
  if (typeof args.maxSubjects === 'number') {
    cleaned.maxSubjects = args.maxSubjects;
  }
  return cleaned;
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

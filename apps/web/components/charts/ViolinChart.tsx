'use client';

/**
 * ViolinChart — Plotly-rendered violin + jitter + IQR for
 * categorical-by-group comparisons (Dabrowska EPM, Bhar condition,
 * any other ontologyTableRow aggregation).
 *
 * Mounted from the chat's Markdown renderer when the LLM emits a
 * fenced code block tagged "violin-chart" with a JSON payload:
 *
 *     ```violin-chart
 *     {
 *       "datasetId": "67f7...",
 *       "variableNameContains": "ElevatedPlusMaze_OpenArmNorth_Entries",
 *       "groupBy": "treatment_group",
 *       "title": "EPM open-arm entries by treatment"
 *     }
 *     ```
 *
 * The component fetches its own data from the FastAPI tabular-query
 * endpoint and renders Plotly. The chart payload is small (a few
 * filter strings) so it survives the LLM's context budget; the real
 * data (potentially hundreds of rows per group) lives on the
 * backend.
 *
 * Replaces the legacy `apps/web/components/app/ViolinPlot.tsx` for
 * any chat path. The Document Explorer keeps using the old component
 * until the Phase 2 migration; this component is the canonical
 * version going forward.
 */

import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { Data, Layout } from 'plotly.js';

import { apiFetch } from '@/lib/api/client';
import { documentExplorerUrl, datasetOverviewUrl } from '@/lib/ai/references';
import type { PlotlyMountHandle } from './PlotlyMount';

const PlotlyMount = dynamic(
  () => import('./PlotlyMount').then((m) => m.PlotlyMount),
  {
    ssr: false,
    loading: () => (
      <div className="h-[360px] flex items-center justify-center text-[12px] text-gray-500">
        Loading chart…
      </div>
    ),
  },
);

export interface ViolinChartProps {
  datasetId: string;
  /**
   * Substring matched against the `ontologyTableRow.variableNames`
   * field. The backend resolves this to the matching tabular
   * documents and pulls their rows.
   */
  variableNameContains: string;
  /**
   * Column to group rows by (e.g., "treatment_group", "strain",
   * "condition"). The backend computes per-group stats.
   */
  groupBy?: string;
  /**
   * Optional restriction of group values to show. When unset, all
   * groups in the data appear. Useful for "compare Saline vs CNO"
   * even when there are extra groups in the data.
   */
  groupOrder?: string[];
  /** Optional axis labels; the backend has defaults from the data. */
  yLabel?: string;
  xLabel?: string;
  title?: string;
}

// Server returns this shape from POST /tabular_query. Matches the
// `ViolinGroup` interface in the legacy `ViolinPlot.tsx` so the same
// payload shape works across the planned Phase 2 migration.
interface BackendGroup {
  name: string;
  values: number[];
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
}

interface BackendTabularResponse {
  groups: BackendGroup[];
  yLabel?: string;
  xLabel?: string;
  /** Optional citation back to the source ontologyTableRow document. */
  source?: {
    dataset_id: string;
    document_id?: string;
    variable_name?: string;
  };
}

const PALETTE = [
  '#0284c7',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#eab308',
];

const STALE_MS = 60_000;

export function ViolinChart({
  datasetId,
  variableNameContains,
  groupBy,
  groupOrder,
  yLabel,
  xLabel,
  title,
}: ViolinChartProps) {
  const exportRef = useRef<PlotlyMountHandle>(null);

  const queryKey = useMemo(
    () => [
      'violin-chart',
      datasetId,
      variableNameContains,
      groupBy,
      (groupOrder ?? []).join('|'),
    ],
    [datasetId, variableNameContains, groupBy, groupOrder],
  );

  const url = useMemo(() => {
    const params = new URLSearchParams({
      variableNameContains,
      ...(groupBy ? { groupBy } : {}),
    });
    if (groupOrder && groupOrder.length > 0) {
      params.set('groupOrder', groupOrder.join(','));
    }
    return `/api/datasets/${datasetId}/tabular_query?${params.toString()}`;
  }, [datasetId, variableNameContains, groupBy, groupOrder]);

  const { data, isLoading, isError, error } = useQuery<BackendTabularResponse>({
    queryKey,
    queryFn: ({ signal }) => apiFetch<BackendTabularResponse>(url, { signal }),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 5,
    retry: 0,
  });

  const plotly = useMemo(() => {
    if (!data?.groups || data.groups.length === 0) return null;

    // Filter + order groups per groupOrder if supplied; otherwise keep
    // backend ordering.
    const groups = groupOrder
      ? groupOrder
          .map((name) => data.groups.find((g) => g.name === name))
          .filter((g): g is BackendGroup => !!g)
      : data.groups;

    const traces: Data[] = groups.map((g, i) => ({
      type: 'violin',
      name: g.name,
      y: g.values,
      box: { visible: true, width: 0.25 },
      meanline: { visible: false },
      points: 'all',
      jitter: 0.4,
      pointpos: 0,
      marker: {
        size: 4,
        opacity: g.values.length > 100 ? 0.35 : 0.6,
        color: PALETTE[i % PALETTE.length],
      },
      line: { color: PALETTE[i % PALETTE.length] },
      fillcolor: PALETTE[i % PALETTE.length] + '40', // 25% alpha
      hoveron: 'violins+points',
      hoverinfo: 'y+name',
      scalemode: 'count',
    }));

    // Some violin-specific layout properties (violingap, violinmode,
    // violingroupgap) are valid Plotly JS but lag the @types/plotly.js
    // strict typing. We extend the type permissively rather than
    // patching the upstream `.d.ts`.
    const layout: Partial<Layout> & Record<string, unknown> = {
      title: title ? { text: title, font: { size: 14 } } : undefined,
      yaxis: {
        title: { text: yLabel ?? data.yLabel ?? '', font: { size: 12 } },
        zeroline: false,
      },
      xaxis: {
        title: { text: xLabel ?? data.xLabel ?? '', font: { size: 12 } },
        tickangle: groups.length > 4 ? -30 : 0,
      },
      showlegend: false, // group names are already on the x-axis
      margin: { t: title ? 36 : 20, r: 20, b: 56, l: 60 },
      height: 380,
      paper_bgcolor: 'white',
      plot_bgcolor: 'white',
      font: { family: 'ui-sans-serif, system-ui', size: 11 },
      violingap: 0.3,
      violinmode: 'group',
    };

    return { traces, layout };
  }, [data, groupOrder, title, yLabel, xLabel]);

  // a834 P1 #I-6 accessibility audit (2026-05-14): screen readers
  // announced this figure as "graphic" with no description. Title
  // wins; otherwise we compose a domain-specific fallback from the
  // ontology variable + groupBy column so SR users still get context.
  const ariaLabel =
    title ??
    `Violin plot of ${variableNameContains}` +
      (groupBy ? ` by ${groupBy}` : '');

  return (
    <figure
      className="my-4 p-3 rounded-md border border-gray-200 bg-white"
      aria-label={ariaLabel}
    >
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? variableNameContains}
        </span>
        {data?.groups && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
            {data.groups.length} group{data.groups.length === 1 ? '' : 's'}
          </span>
        )}
      </figcaption>

      <ChartBody
        isLoading={isLoading}
        isError={isError}
        error={error}
        hasData={!!plotly}
        plotly={plotly}
        exportRef={exportRef}
      />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {data?.groups
            ? `${data.groups.reduce((s, g) => s + g.count, 0).toLocaleString()} total observations`
            : ''}
        </span>
        <Link
          href={
            data?.source?.document_id
              ? documentExplorerUrl(datasetId, data.source.document_id)
              : datasetOverviewUrl(datasetId)
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-blue hover:underline shrink-0 ml-2"
        >
          View source document →
        </Link>
      </div>
    </figure>
  );
}

ViolinChart.displayName = 'ViolinChart';

interface ChartBodyProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  hasData: boolean;
  plotly: { traces: Data[]; layout: Partial<Layout> } | null;
  exportRef: React.Ref<PlotlyMountHandle>;
}

function ChartBody({ isLoading, isError, error, hasData, plotly, exportRef }: ChartBodyProps) {
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Failed to load data';
    return (
      <div
        role="alert"
        className="h-[200px] flex items-center justify-center text-center px-4 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded"
      >
        Couldn&apos;t load the data: {msg}
      </div>
    );
  }
  if (isLoading || !plotly) {
    return (
      <div className="h-[360px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 rounded">
        Loading data…
      </div>
    );
  }
  if (!hasData) {
    return (
      <div
        role="status"
        className="h-[200px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded"
      >
        No matching groups in this dataset.
      </div>
    );
  }
  return (
    <PlotlyMount
      ref={exportRef}
      data={plotly.traces}
      layout={plotly.layout}
      className="w-full"
    />
  );
}

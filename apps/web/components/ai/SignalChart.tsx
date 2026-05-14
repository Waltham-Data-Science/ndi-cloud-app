'use client';

/**
 * SignalChart — embedded chart for the experimental Ask chat.
 *
 * Mounted from the chat's Markdown renderer when the LLM emits a
 * fenced code block tagged "signal-chart" with a JSON payload:
 *
 *     ```signal-chart
 *     {"datasetId":"...","docId":"...","downsample":2000,"title":"..."}
 *     ```
 *
 * MULTI-TRACE + COLORBAR (added 2026-05-14)
 * ----------------------------------------
 * The backend `fetch_signal` response shape already carries
 * `channels: {name: [values]}` — so any document with a multi-channel
 * decode (Dabrowska I-V sweeps, electrode arrays) produces multiple
 * traces naturally. This component renders all of them in one panel
 * with auto-colored series.
 *
 *   - Numeric-suffix channel names (`ch0, ch1, ch2`) OR fully numeric
 *     parses (`voltage_+10pA → 10`) → Viridis perceptual ramp.
 *   - Otherwise → categorical PALETTE (Tab10-style, accessible).
 *
 * When the LLM passes a `colorbar` prop in the fence payload (with
 * label + min + max), a vertical colorbar is drawn to the right of the
 * uPlot canvas. Single-channel docs render no legend / no colorbar so
 * the pre-existing EPM voltage-trace example is unchanged.
 *
 * Rendering uses uPlot directly here (rather than delegating to
 * TimeseriesChart) because the chat-side chart needs different
 * semantics: chat-side users may request a specific channel subset
 * via the colorbar metadata, the legend layout matches the chat
 * figure-caption style, and the chart doesn't need to detect
 * electrophysiology sweeps (the LLM has already chosen the right
 * docId via fetch_signal). The 1-channel path stays delegate-to-
 * TimeseriesChart so the existing EPM example renders identically.
 *
 * Loading + error + empty states are first-class: a malformed binary
 * shouldn't crash the chat thread. The footer includes a citation
 * link to the Document Explorer for the source NDI document so the
 * user can drill into the raw record.
 */
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

import { apiFetch } from '@/lib/api/client';
import type { TimeseriesData } from '@/lib/api/binary';
import { documentExplorerUrl } from '@/lib/ai/references';

// uPlot pulls a non-trivial CSS bundle + reads from `window`; dynamic
// import keeps it out of the initial chat-page bundle and skips SSR.
const TimeseriesChart = dynamic(
  () => import('@/components/app/TimeseriesChart').then((m) => m.TimeseriesChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] flex items-center justify-center text-[12px] text-gray-500">
        Loading chart…
      </div>
    ),
  },
);

// Multi-trace renderer lives in its own client-only module so its
// uPlot import (plus a fresh `window` access) doesn't drag uPlot into
// the SSR pass when ONLY the 1-channel delegate path runs.
const MultiTraceChart = dynamic(
  () => import('./MultiTraceChart').then((m) => m.MultiTraceChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] flex items-center justify-center text-[12px] text-gray-500">
        Loading chart…
      </div>
    ),
  },
);

export interface SignalChartColorbarSpec {
  /** Axis label rendered to the right of the colorbar (e.g. "Injection (pA)"). */
  label: string;
  /** Numeric min of the ramp (bottom of the bar). */
  min: number;
  /** Numeric max of the ramp (top of the bar). */
  max: number;
  /** Colormap name. Defaults to "viridis" for perceptual + colorblind-safe. */
  scale?: 'viridis' | 'plasma' | 'cool-warm';
}

export interface SignalChartProps {
  datasetId: string;
  docId: string;
  downsample?: number;
  t0?: number;
  t1?: number;
  /**
   * Optional file-name selector for multi-file binary documents.
   * Must match what the LLM passed to fetch_signal so the chart's
   * re-fetch grabs the same data file.
   */
  file?: string;
  title?: string;
  /**
   * When present AND the fetched response has 2+ channels, render a
   * vertical colorbar to the right of the plot showing the colormap
   * scale. Omit (or set to undefined) for categorical multi-channel
   * data (e.g. ai+ao+stim) where a discrete legend is more useful.
   */
  colorbar?: SignalChartColorbarSpec;
}

/**
 * Backend response shape (mirrors signal_service.downsample_timeseries
 * plus the source provenance field added by the router). We pluck the
 * subset TimeseriesChart needs and keep the source for the citation
 * footer.
 */
interface SignalResponse extends TimeseriesData {
  downsampled?: boolean;
  original_sample_count?: number;
  t0_seconds?: number | null;
  t1_seconds?: number | null;
  source?: {
    dataset_id: string;
    document_id: string;
    doc_class: string | null;
    doc_name: string | null;
  };
}

const STALE_MS = 60_000; // 1 minute — signal data is immutable per doc.

export function SignalChart({
  datasetId,
  docId,
  downsample = 2000,
  t0,
  t1,
  file,
  title,
  colorbar,
}: SignalChartProps) {
  const url = useMemo(() => {
    const qs = new URLSearchParams({ downsample: String(downsample) });
    if (typeof t0 === 'number') qs.set('t0', String(t0));
    if (typeof t1 === 'number') qs.set('t1', String(t1));
    if (typeof file === 'string' && file.length > 0) qs.set('file', file);
    return `/api/datasets/${datasetId}/documents/${docId}/signal?${qs.toString()}`;
  }, [datasetId, docId, downsample, t0, t1, file]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['signal-chart', datasetId, docId, downsample, t0, t1, file],
    queryFn: ({ signal }) => apiFetch<SignalResponse>(url, { signal }),
    staleTime: STALE_MS,
    gcTime: STALE_MS * 5,
    retry: 0,
  });

  return (
    <figure className="my-4 p-3 rounded-md border border-gray-200 bg-white">
      <figcaption className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-gray-900 truncate flex-1 min-w-0">
          {title ?? data?.source?.doc_name ?? 'Signal'}
        </span>
        {data?.format && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 shrink-0">
            {data.format}
          </span>
        )}
      </figcaption>

      <ChartBody
        data={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        colorbar={colorbar}
      />

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
        <span className="truncate">
          {data?.downsampled && data.original_sample_count
            ? `Downsampled from ${data.original_sample_count.toLocaleString()} samples to ${data.sample_count.toLocaleString()}`
            : data?.sample_count
              ? `${data.sample_count.toLocaleString()} samples`
              : ''}
        </span>
        <Link
          href={documentExplorerUrl(datasetId, docId)}
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

interface ChartBodyProps {
  data: SignalResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  colorbar?: SignalChartColorbarSpec;
}

// Explicit displayName so the Markdown component's child-identity
// check (which detects SignalChart wrapped in <pre>) is robust to
// production minification.
SignalChart.displayName = 'SignalChart';

/**
 * Inner body — split out so the figure's caption + footer render
 * consistently across loading / error / empty states.
 */
function ChartBody({ data, isLoading, isError, error, colorbar }: ChartBodyProps) {
  // Error branch FIRST — on rejection `data` is undefined and
  // `isLoading` is already false, but a "loading || !data" check
  // would mask the error and leave the spinner spinning forever.
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Failed to load signal';
    return (
      <div
        role="alert"
        className="h-[180px] flex items-center justify-center text-center px-4 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded"
      >
        Couldn&apos;t load the signal: {msg}
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="h-[300px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 rounded">
        Loading signal…
      </div>
    );
  }
  if (data.error) {
    // Backend soft-error envelope (decoder couldn't handle the format,
    // missing file, vlt library not installed, etc.).
    return (
      <div
        role="status"
        className="h-[180px] flex items-center justify-center text-center px-4 text-[13px] text-gray-700 bg-gray-50 border border-gray-200 rounded"
      >
        {data.error}
      </div>
    );
  }
  if (!data.timestamps || data.sample_count === 0) {
    return (
      <div
        role="status"
        className="h-[180px] flex items-center justify-center text-[13px] text-gray-500 bg-gray-50 border border-gray-200 rounded"
      >
        No samples in the requested window.
      </div>
    );
  }
  // 1-channel docs keep the original TimeseriesChart delegate — so the
  // EPM-example regression-free behavior is identical to before.
  // Multi-channel (or single-channel-but-colorbar-requested) routes
  // through the new MultiTraceChart which owns auto-color-ramp +
  // legend + colorbar.
  const channelCount = Object.keys(data.channels ?? {}).length;
  if (channelCount <= 1 && !colorbar) {
    return <TimeseriesChart data={data} height={300} />;
  }
  return <MultiTraceChart data={data} height={300} colorbar={colorbar} />;
}

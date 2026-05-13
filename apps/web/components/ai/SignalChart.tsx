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
 * The component fetches its own data from the FastAPI signal endpoint
 * (the same endpoint the `fetch_signal` tool hit on the server side)
 * via TanStack Query — so a re-render after the user clicks a citation
 * chip and returns won't trigger a refetch.
 *
 * Rendering delegates to `TimeseriesChart` which is the production
 * uPlot wrapper already used by the Document Explorer. Reusing it
 * here means the chat-side chart inherits sweep detection, NaN
 * splitting, and the turbo-colormap automatically — no parallel
 * implementation to drift out of sync.
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

export interface SignalChartProps {
  datasetId: string;
  docId: string;
  downsample?: number;
  t0?: number;
  t1?: number;
  title?: string;
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
  title,
}: SignalChartProps) {
  const url = useMemo(() => {
    const qs = new URLSearchParams({ downsample: String(downsample) });
    if (typeof t0 === 'number') qs.set('t0', String(t0));
    if (typeof t1 === 'number') qs.set('t1', String(t1));
    return `/api/datasets/${datasetId}/documents/${docId}/signal?${qs.toString()}`;
  }, [datasetId, docId, downsample, t0, t1]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['signal-chart', datasetId, docId, downsample, t0, t1],
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
}

// Explicit displayName so the Markdown component's child-identity
// check (which detects SignalChart wrapped in <pre>) is robust to
// production minification.
SignalChart.displayName = 'SignalChart';

/**
 * Inner body — split out so the figure's caption + footer render
 * consistently across loading / error / empty states.
 */
function ChartBody({ data, isLoading, isError, error }: ChartBodyProps) {
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
  // Pass through to the production uPlot wrapper.
  return <TimeseriesChart data={data} height={300} />;
}

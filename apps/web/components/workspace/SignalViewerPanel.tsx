'use client';

/**
 * SignalViewerPanel — workspace panel for plotting a downsampled
 * timeseries from any NDI binary document (voltage trace, position
 * track, multi-channel sweep, etc.).
 *
 * Pattern reference for the other chart panels (Spike Activity,
 * Behavioral Compare, Treatment Timeline) — the shape is:
 *
 *   1. Parameter form: typed inputs for the chart payload + optional
 *      browse-to-Document-Explorer escape hatch
 *   2. Run button: stages the form values into a `payload` state that
 *      the chart component re-fetches against (SignalChart owns its
 *      own data fetch via apiFetch — no per-panel useMutation needed,
 *      letting us avoid duplicating the auth/timeout/cancel plumbing)
 *   3. Result area: SignalChart from `@/components/ndi/charts/SignalChart` —
 *      same component the chat surface uses. Loading + error + empty
 *      states are handled inside the chart
 *   4. Footer: Run + Show code
 *
 * Why we reuse SignalChart instead of writing a new chart:
 *
 *   - Same backend response shape (signal_service.downsample_timeseries)
 *   - Same uPlot mount + multi-trace + colorbar rendering paths
 *   - Same auth-scoped apiFetch (works for both private + public datasets)
 *   - Zero net new chart code; only the parameter form is new
 *
 * Future enhancement: replace the freeform docId text input with a
 * dropdown populated from `query_documents(class=element_epoch)` or
 * `daqreader_*_epochdata_ingested`. For V1 the freeform input + a
 * "Browse documents →" deeplink to the Document Explorer is enough.
 */
import { Waves } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { SignalChart } from '@/components/ndi/charts/SignalChart';
import { Field } from '@/components/marketing/AuthForm';
import { MarketingButton } from '@/components/marketing/Button';

import { PanelCard } from './PanelCard';
import { ShowCodeButton } from './ShowCodeButton';

interface SignalViewerPanelProps {
  datasetId: string;
}

interface ChartPayload {
  datasetId: string;
  docId: string;
  downsample: number;
  t0?: number;
  t1?: number;
  file?: string;
  title?: string;
}

function parseFloatOrUndefined(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function SignalViewerPanel({ datasetId }: SignalViewerPanelProps) {
  const [docId, setDocId] = useState('');
  const [downsample, setDownsample] = useState('2000');
  const [t0, setT0] = useState('');
  const [t1, setT1] = useState('');
  const [file, setFile] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The CURRENTLY-RENDERED chart payload. When the user clicks "Run",
  // we stage form values into this state, which re-keys SignalChart
  // and triggers its own apiFetch. Decoupling form state from chart
  // payload means partial-typed values don't re-fetch on every keystroke.
  const [payload, setPayload] = useState<ChartPayload | null>(null);

  function handleRun(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const id = docId.trim();
    if (!id) {
      setError('Document ID is required. Paste a 24-char hex ID from the Document Explorer.');
      return;
    }
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      setError('Document ID must be a 24-char hex string.');
      return;
    }
    const ds = parseFloatOrUndefined(downsample);
    if (ds !== undefined && (ds < 100 || ds > 5000)) {
      setError('Downsample must be between 100 and 5000 points per channel.');
      return;
    }
    setPayload({
      datasetId,
      docId: id,
      downsample: ds ?? 2000,
      t0: parseFloatOrUndefined(t0),
      t1: parseFloatOrUndefined(t1),
      file: file.trim() || undefined,
      title: title.trim() || undefined,
    });
  }

  return (
    <PanelCard
      icon={Waves}
      title="Signal viewer"
      subtitle="Plot a downsampled trace from any NDI binary document (voltage, position, multi-channel sweep)."
      headingId="panel-signal-viewer"
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
            toolName="fetch_signal"
            args={payload ?? { datasetId }}
            disabled={payload === null}
          />
          <Link
            href={`/datasets/${datasetId}/documents?class=element_epoch`}
            className="ml-auto text-[12.5px] text-brand-blue hover:underline"
          >
            Browse documents to find an ID →
          </Link>
        </>
      }
    >
      <form onSubmit={handleRun} noValidate className="space-y-3">
        <Field
          label="Document ID"
          name="docId"
          value={docId}
          onChange={(e) => setDocId(e.target.value)}
          placeholder="e.g. 68d6e54703a03f5cfdac8eff"
          hint="A 24-char hex NDI document ID. Common classes: element_epoch, daqreader_*_epochdata_ingested."
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Downsample"
            name="downsample"
            type="number"
            value={downsample}
            onChange={(e) => setDownsample(e.target.value)}
            hint="Max points per channel (100-5000)."
          />
          <Field
            label="t0 (seconds)"
            name="t0"
            type="number"
            value={t0}
            onChange={(e) => setT0(e.target.value)}
            hint="Window start. Leave blank for epoch start."
          />
          <Field
            label="t1 (seconds)"
            name="t1"
            type="number"
            value={t1}
            onChange={(e) => setT1(e.target.value)}
            hint="Window end. Leave blank for epoch end."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="File (optional)"
            name="file"
            value={file}
            onChange={(e) => setFile(e.target.value)}
            placeholder="e.g. ai_group1_seg.nbf_1"
            hint="For multi-file binary documents only."
          />
          <Field
            label="Chart title (optional)"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Patch-Vm sweep 5"
          />
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          {error}
        </div>
      )}

      {payload && (
        <div className="rounded-md border border-border-subtle bg-bg-canvas p-3">
          {/* SignalChart owns the data fetch — re-keying on docId
              ensures the chart fully re-mounts on Run, avoiding any
              stale-state bleed between consecutive runs against
              different documents. */}
          <SignalChart key={`${payload.docId}-${payload.downsample}-${payload.t0 ?? ''}-${payload.t1 ?? ''}-${payload.file ?? ''}`} {...payload} />
        </div>
      )}
    </PanelCard>
  );
}

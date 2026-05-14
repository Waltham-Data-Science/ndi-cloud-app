'use client';

/**
 * /my/workspace/[id] — client orchestrator.
 *
 * Owns:
 *   - Auth gate (redirect to /login when session resolves to null)
 *   - Hero band (dataset name + back-to-/my link)
 *   - Vertical stack of the 5 workspace panels
 *
 * The 5 panels live in `@/components/workspace/*Panel.tsx`. Each is
 * independent — they don't share state, they each own their own data
 * fetch, and they all converge on the same FastAPI proxy at
 * `/api/datasets/.../...`. Adding a 6th panel later is one import +
 * one render line here.
 *
 * Panel order is intentional: orientation first (Structure), then
 * single-document drilldown (Signal, Spike Activity), then cross-
 * document analysis (Behavioral Compare, Treatment Timeline). Reads
 * top-to-bottom as a "what's here → look at one piece → compare
 * across pieces" arc.
 */
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { BehavioralComparePanel } from '@/components/workspace/BehavioralComparePanel';
import { DatasetStructurePanel } from '@/components/workspace/DatasetStructurePanel';
import { SignalViewerPanel } from '@/components/workspace/SignalViewerPanel';
import { SpikeActivityPanel } from '@/components/workspace/SpikeActivityPanel';
import { TreatmentTimelinePanel } from '@/components/workspace/TreatmentTimelinePanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDataset } from '@/lib/api/datasets';
import { useSession } from '@/lib/auth/use-session';

interface WorkspaceClientProps {
  datasetId: string;
}

export function WorkspaceClient({ datasetId }: WorkspaceClientProps) {
  const router = useRouter();
  const session = useSession();
  const dataset = useDataset(datasetId);

  // Auth gate: anonymous visitors get pushed to /login with returnTo.
  // Matches the existing /my + /my-account pattern.
  useEffect(() => {
    if (!session.isLoading && session.user === null) {
      router.replace(
        `/login?returnTo=${encodeURIComponent(`/my/workspace/${datasetId}`)}`,
      );
    }
  }, [session.isLoading, session.user, router, datasetId]);

  if (session.isLoading) {
    return (
      <div className="px-7 py-12 bg-bg-canvas">
        <div className="mx-auto max-w-[1200px] space-y-4">
          <Skeleton className="h-16 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (session.user === null) {
    return (
      <div className="px-7 py-20 bg-bg-canvas flex items-center justify-center">
        <p className="text-sm text-fg-muted">Redirecting to sign in…</p>
      </div>
    );
  }

  // Header dataset-name resolution. While the detail fetch is in
  // flight we show the bare id; on resolve we swap to the name. The
  // shell paints immediately so the panels below can load in parallel.
  const datasetName = dataset.data?.name ?? datasetId;

  return (
    <>
      {/* ── Hero band ──────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'var(--grad-depth)' }}
        aria-labelledby="workspace-hero"
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "url('/brand/ndicloud-emblem.svg')",
            backgroundSize: '120px',
            backgroundRepeat: 'repeat',
            opacity: 0.05,
          }}
        />
        <div className="relative mx-auto max-w-[1200px] px-7 py-10 md:py-12">
          <Link
            href="/my"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-white/60 hover:text-white/90 transition-colors mb-3"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            My workspace
          </Link>

          <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3 flex items-center gap-2">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue-3" />
            WORKSPACE
            <span aria-hidden className="opacity-30 px-1">|</span>
            <span className="font-mono normal-case tracking-normal text-[10.5px] text-white/85">
              {datasetId.length > 24 ? `${datasetId.slice(0, 8)}…${datasetId.slice(-4)}` : datasetId}
            </span>
          </div>

          <h1
            id="workspace-hero"
            className="text-white font-display font-extrabold tracking-tight leading-tight text-[1.75rem] md:text-[2rem] mb-2 max-w-4xl break-words"
          >
            {datasetName}
          </h1>
          <p className="text-white/70 text-[13.5px] leading-relaxed max-w-[640px]">
            Plot signals, compare measurements across groups, and copy out the
            Python/MATLAB equivalent of every action. Each panel runs against
            this dataset and can be re-parameterized without touching code.
          </p>
        </div>
      </section>

      {/* ── Panels ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1200px] px-7 py-8 bg-bg-canvas">
        <div className="space-y-5">
          <DatasetStructurePanel datasetId={datasetId} />
          <SignalViewerPanel datasetId={datasetId} />
          <SpikeActivityPanel datasetId={datasetId} />
          <BehavioralComparePanel datasetId={datasetId} />
          <TreatmentTimelinePanel datasetId={datasetId} />
        </div>

        {/* Bottom escalation link to the existing Document Explorer —
            for anything the panels above don't cover yet. Mirrors the
            scoping doc's "clear escalation path to the API". */}
        <div className="mt-8 rounded-md border border-dashed border-border-subtle bg-bg-surface px-4 py-3 text-[13px] text-fg-secondary">
          Need something the panels don&rsquo;t cover yet? The full document
          tree, dependencies, and raw data are in the{' '}
          <Link
            href={`/datasets/${datasetId}/documents`}
            className="text-brand-blue hover:underline"
          >
            Document Explorer
          </Link>
          , and every &ldquo;Show code&rdquo; button copies a runnable Python
          or MATLAB snippet you can extend in your own environment.
        </div>
      </section>
    </>
  );
}

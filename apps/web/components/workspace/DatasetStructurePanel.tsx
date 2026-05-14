'use client';

/**
 * DatasetStructurePanel — orientation panel for the /my workspace.
 *
 * Pre-built first-impression view of "what's in this dataset" before
 * the user picks an element/unit/epoch to plot. Distinct from the
 * other panels in two ways:
 *
 *   1. NO parameter form / no Run button. The data loads automatically
 *      on mount (the panel IS the result).
 *   2. NO chart. Renders structured text + count chips + small lists.
 *
 * Surfaces three slices, all from already-implemented backend hooks
 * (the chat tools talk to the same endpoints; we're just reading them
 * from the browser here with cookie-forwarded auth):
 *
 *   · Dataset header: name, DOI, license, contributors
 *   · Counts: subjects, elements, epochs, documents
 *   · Species + brain regions + strains as ontology pills
 *
 * The Show Code button bundles a get_dataset_summary + class-counts
 * call pair so users can drop a runnable Python/MATLAB snippet of the
 * same data into their own environment.
 */
import { Layers } from 'lucide-react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/Skeleton';
import { useClassCounts, useDataset, useDatasetSummary } from '@/lib/api/datasets';
import { formatNumber } from '@/lib/format';

import { PanelCard } from './PanelCard';
import { ShowCodeButton } from './ShowCodeButton';

interface DatasetStructurePanelProps {
  datasetId: string;
}

function CountChip({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-left transition-colors hover:border-brand-blue/40 hover:bg-brand-blue/5">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold text-fg-primary">{value}</div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block no-underline">
        {inner}
      </Link>
    );
  }
  return inner;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-medium text-brand-blue ring-1 ring-inset ring-brand-blue/20">
      {children}
    </span>
  );
}

export function DatasetStructurePanel({ datasetId }: DatasetStructurePanelProps) {
  const dataset = useDataset(datasetId);
  const summary = useDatasetSummary(datasetId);
  const counts = useClassCounts(datasetId);

  const isLoading = dataset.isLoading || summary.isLoading || counts.isLoading;
  const isError = dataset.isError || summary.isError || counts.isError;

  // Top-of-card counts. We pull from summary.counts (curated +
  // labeled). `classCounts` (raw per-class breakdown) feeds the
  // collapsible "all classes" list below + the total-docs chip when
  // summary hasn't resolved yet.
  const subjectCount = summary.data?.counts?.subjects ?? null;
  const elementCount = summary.data?.counts?.elements ?? null;
  const epochCount = summary.data?.counts?.epochs ?? null;
  const totalDocs =
    summary.data?.counts?.totalDocuments ??
    counts.data?.totalDocuments ??
    null;

  // `species`/`brainRegions`/`strains` on DatasetSummary can be null
  // (extraction didn't run) or `[]` (extraction ran, no values). We
  // collapse both to `[]` for the render — the surface UX is
  // identical ("no chips visible") and we don't need to distinguish
  // the two states here.
  const species = summary.data?.species ?? [];
  const brainRegions = summary.data?.brainRegions ?? [];
  const strains = summary.data?.strains ?? [];

  // Sorted "all classes" list for the footer — most-frequent class
  // first so power users see the meaningful ones (element_epoch,
  // ontologyTableRow, …) before the small ones (sorting, treatment).
  const classCountRows = counts.data?.classCounts
    ? Object.entries(counts.data.classCounts)
        .map(([name, n]) => ({ name, n: n ?? 0 }))
        .sort((a, b) => b.n - a.n)
    : [];

  return (
    <PanelCard
      icon={Layers}
      title="Dataset structure"
      subtitle="Orientation view of what's in this dataset — subjects, elements, epochs, and per-class document counts."
      headingId="panel-dataset-structure"
      footer={
        <ShowCodeButton
          toolName="get_dataset_summary"
          args={{ datasetId }}
          result={summary.data ?? undefined}
        />
      }
    >
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {isError && !isLoading && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
        >
          Couldn&rsquo;t load the dataset structure. The dataset may not exist or you may not have access.
        </div>
      )}

      {!isLoading && !isError && dataset.data && (
        <>
          {/* ── Header strip: name + DOI + license + contributors ─────── */}
          <div>
            <h4 className="text-[15px] font-semibold text-fg-primary leading-tight">
              {dataset.data.name ?? datasetId}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-fg-secondary">
              {dataset.data.license && (
                <span>License: <span className="font-mono">{dataset.data.license}</span></span>
              )}
              {dataset.data.doi && (
                <a
                  href={
                    dataset.data.doi.startsWith('http')
                      ? dataset.data.doi
                      : `https://doi.org/${dataset.data.doi}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-blue hover:underline"
                >
                  DOI ↗
                </a>
              )}
              {dataset.data.contributors && dataset.data.contributors.length > 0 && (
                <span>
                  {dataset.data.contributors.length} contributor
                  {dataset.data.contributors.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          {/* ── Counts grid ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <CountChip
              label="Subjects"
              value={subjectCount !== null ? formatNumber(subjectCount) : '—'}
              href={`/datasets/${datasetId}/tables/subject`}
            />
            <CountChip
              label="Elements"
              value={elementCount !== null ? formatNumber(elementCount) : '—'}
              href={`/datasets/${datasetId}/tables/element`}
            />
            <CountChip
              label="Epochs"
              value={epochCount !== null ? formatNumber(epochCount) : '—'}
              href={`/datasets/${datasetId}/tables/element_epoch`}
            />
            <CountChip
              label="Total docs"
              value={totalDocs !== null ? formatNumber(totalDocs) : '—'}
              href={`/datasets/${datasetId}/documents`}
            />
          </div>

          {/* ── Biology pills ─────────────────────────────────────────── */}
          {(species.length > 0 || brainRegions.length > 0 || strains.length > 0) && (
            <div className="space-y-2">
              {species.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-fg-muted">Species</span>
                  {species.map((s) => (
                    <Pill key={s.ontologyId ?? s.label}>{s.label}</Pill>
                  ))}
                </div>
              )}
              {brainRegions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-fg-muted">Brain regions</span>
                  {brainRegions.slice(0, 8).map((r) => (
                    <Pill key={r.ontologyId ?? r.label}>{r.label}</Pill>
                  ))}
                  {brainRegions.length > 8 && (
                    <span className="text-[11px] text-fg-muted">+{brainRegions.length - 8} more</span>
                  )}
                </div>
              )}
              {strains.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-fg-muted">Strains</span>
                  {strains.slice(0, 6).map((s) => (
                    <Pill key={s.ontologyId ?? s.label}>{s.label}</Pill>
                  ))}
                  {strains.length > 6 && (
                    <span className="text-[11px] text-fg-muted">+{strains.length - 6} more</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── All-classes table ─────────────────────────────────────── */}
          {classCountRows.length > 0 && (
            <details className="rounded-md border border-border-subtle bg-bg-canvas p-3 text-[12.5px]">
              <summary className="cursor-pointer font-medium text-fg-secondary">
                All document classes ({classCountRows.length})
              </summary>
              <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {classCountRows.map((row) => (
                  <li key={row.name} className="flex items-center justify-between font-mono">
                    <Link
                      href={`/datasets/${datasetId}/tables/${row.name}`}
                      className="truncate text-fg-secondary hover:text-brand-blue hover:underline"
                      title={row.name}
                    >
                      {row.name}
                    </Link>
                    <span className="ml-2 shrink-0 text-fg-muted">{formatNumber(row.n)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </PanelCard>
  );
}

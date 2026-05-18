'use client';

/**
 * WorkspaceProvenanceBand — compact biology + methods band for the
 * Overview tab.
 *
 * Phase B of the workspace redesign. The hero band already carries
 * cardinal facts (license, DOI, document count, subjects, size).
 * The stat-tiles row carries counts (subjects, sessions, probes,
 * epochs, documents, species). This band fills in the experimental
 * context the user wants to verify before launching an analysis:
 *
 *   - Brain regions (UBERON pills)
 *   - Strains (WBStrain / NCBITaxon-strain pills)
 *   - Sexes (PATO pills)
 *   - Probe types (free-text chips — no canonical ontology)
 *   - Paper DOIs (linked)
 *
 * Each row hides when the underlying field is null or empty so the
 * band only shows rows that actually carry data. Pills/chips use
 * the same `OntologyTermPill` style as the dataset-detail pages so
 * navigation between catalog detail and workspace feels consistent.
 *
 * For datasets where extraction has not yet completed, the band
 * renders a small "Provenance still synthesising…" placeholder
 * pointing users at the dataset-detail page (which surfaces the
 * synthesizer-warning explanations).
 */
import Link from 'next/link';

import { Skeleton } from '@/components/ui/Skeleton';
import { useDatasetSummary } from '@/lib/api/datasets';
import { ontologyUrl } from '@/lib/ontology/url-builder';

interface WorkspaceProvenanceBandProps {
  datasetId: string;
}

interface OntologyTerm {
  label: string;
  ontologyId: string | null;
}

/**
 * One labeled row inside the band. Renders nothing if values is null
 * or empty — the parent doesn't have to check before passing.
 */
function ProvenanceRow({
  label,
  values,
  asChips = false,
}: {
  label: string;
  values: OntologyTerm[] | string[] | null | undefined;
  /**
   * Chips instead of pills — used for free-text probe types that
   * don't carry an ontology id. Visually slighter, no link.
   */
  asChips?: boolean;
}) {
  if (!values || values.length === 0) return null;

  return (
    <div className="grid grid-cols-[120px_1fr] max-[640px]:grid-cols-1 gap-x-5 gap-y-1.5 items-baseline py-2.5 border-t first:border-t-0 border-border-subtle">
      <div className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => {
          if (typeof v === 'string') {
            return (
              <span
                key={`${label}-${i}-${v}`}
                className="inline-flex items-center text-[11.5px] font-mono text-fg-muted bg-bg-muted px-2 py-0.5 rounded"
              >
                {v}
              </span>
            );
          }
          const term = v;
          if (!term.ontologyId) {
            // No ontology id — render as a quiet chip (matches the
            // free-text style).
            return (
              <span
                key={`${label}-${i}-${term.label}`}
                className={
                  asChips
                    ? 'inline-flex items-center text-[11.5px] font-mono text-fg-muted bg-bg-muted px-2 py-0.5 rounded'
                    : 'inline-flex items-center text-[11.5px] font-medium text-fg-secondary bg-bg-muted px-2 py-0.5 rounded-full ring-1 ring-inset ring-border-subtle'
                }
              >
                {term.label}
              </span>
            );
          }
          const href = ontologyUrl(term.ontologyId);
          return (
            <a
              key={`${label}-${i}-${term.ontologyId}`}
              href={href ?? '#'}
              target={href ? '_blank' : undefined}
              rel={href ? 'noopener noreferrer' : undefined}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-800 bg-brand-50 px-2 py-0.5 rounded-full ring-1 ring-inset ring-brand-200 hover:bg-brand-100 transition-colors"
              title={term.ontologyId}
            >
              {term.label}
              <span className="font-mono text-[10px] text-brand-800/70">
                {term.ontologyId}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function WorkspaceProvenanceBand({
  datasetId,
}: WorkspaceProvenanceBandProps) {
  const summary = useDatasetSummary(datasetId);

  if (summary.isLoading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-sm space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[120px_1fr] gap-x-5 py-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary.data) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface p-6 text-[13.5px] leading-relaxed text-fg-secondary">
        Provenance still synthesising — the dataset summary endpoint hasn&rsquo;t
        resolved yet. Refresh in a moment, or open the{' '}
        <Link
          href={`/datasets/${datasetId}/overview`}
          className="text-ndi-teal hover:underline font-semibold"
        >
          dataset detail page
        </Link>{' '}
        for the full synthesiser output (with warning explanations if
        any stage failed).
      </div>
    );
  }

  const { brainRegions, strains, sexes, probeTypes, citation } = summary.data;

  // Bail entirely if none of the rows have content — keeps the
  // page tidy for datasets with only counts. Rare in practice;
  // every published dataset we ship has at least one biology
  // facet populated.
  const hasAnyContent =
    (brainRegions && brainRegions.length > 0) ||
    (strains && strains.length > 0) ||
    (sexes && sexes.length > 0) ||
    (probeTypes && probeTypes.length > 0) ||
    (citation.paperDois && citation.paperDois.length > 0);

  if (!hasAnyContent) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-sm">
      <div className="space-y-0">
        <ProvenanceRow label="Brain regions" values={brainRegions} />
        <ProvenanceRow label="Strains" values={strains} />
        <ProvenanceRow label="Sexes" values={sexes} />
        <ProvenanceRow
          label="Probe types"
          values={probeTypes}
          asChips
        />
        {citation.paperDois && citation.paperDois.length > 0 && (
          <div className="grid grid-cols-[120px_1fr] max-[640px]:grid-cols-1 gap-x-5 gap-y-1.5 items-baseline py-2.5 border-t border-border-subtle">
            <div className="text-[10.5px] font-bold tracking-eyebrow uppercase text-fg-muted">
              Paper DOIs
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {citation.paperDois.map((doi) => (
                <a
                  key={doi}
                  href={`https://doi.org/${doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-mono text-ndi-teal hover:underline"
                >
                  {doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

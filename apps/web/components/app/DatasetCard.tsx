/**
 * DatasetCard — wide-format catalog card.
 *
 * Ported from `ndi-data-browser-v2/frontend/src/components/datasets/DatasetCard.tsx`.
 * Substitution: `react-router-dom` `Link` → `next/link` `Link`. The data-browser
 * card prefers `summary.species` / `summary.brainRegions` (synthesizer output)
 * over the raw record, falling back to raw fields when the synthesizer hasn't
 * indexed the dataset yet — Phase 3a carries that two-tier render unchanged.
 *
 * Lives under `components/app/` (not `components/marketing/`) since it's an
 * app-route consumer of the data-browser primitives. ESLint enforces the
 * MUI exclusion in `components/app/**`; this card uses only Tailwind +
 * lucide-react + the ported `components/ui/*` primitives.
 */
import Link from 'next/link';
import type { CSSProperties } from 'react';

import type { DatasetRecord } from '@/lib/api/datasets';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardTitle } from '@/components/ui/Card';
import {
  cleanAbstract,
  cleanDatasetName,
  formatBytes,
  formatDate,
  truncate,
} from '@/lib/format';

interface DatasetCardProps {
  dataset: DatasetRecord;
}

const HOVER_STYLE: CSSProperties = {
  transitionDuration: 'var(--duration-base)',
  transitionTimingFunction: 'var(--ease-out)',
};

export function DatasetCard({ dataset }: DatasetCardProps) {
  // Strip cloud-side cosmetic noise before render: leading "Dataset:"
  // prefix on names (legacy admin-UI artifact, inconsistent across
  // entries) and the in-flight "DATASET BEING PROCESSED." marker that
  // some abstracts ship with. See `cleanDatasetName` / `cleanAbstract`
  // in `lib/format.ts` for the full rationale.
  const displayName = cleanDatasetName(dataset.name);
  const { text: abstractText, processing } = cleanAbstract(
    dataset.abstract ?? dataset.description,
  );
  const contributors = (dataset.contributors ?? [])
    .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' '))
    .filter(Boolean);

  const summary = dataset.summary ?? null;

  return (
    <Link
      href={`/datasets/${dataset.id}/overview`}
      // `cursor-pointer` is redundant on `<a>` per the spec, but Safari
      // and Firefox briefly drop it during the navigation pending state
      // (between click and the route's loading.tsx painting), so the
      // user — already waiting on a slow-cloud detail fetch — sees the
      // cursor revert to the default arrow mid-click. Forcing it via
      // Tailwind keeps the cursor consistent for the whole click→paint
      // window. Pairs with the route-level loading.tsx (audit #1) so
      // the click registers immediately AND looks clickable.
      className="block group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-3 rounded-lg"
      aria-label={`Open dataset ${displayName}`}
    >
      <Card
        // Audit #16: hover affordance was previously a 1 px Y-translate
        // + soft shadow. On dense catalogs at 1280 px+ the lift was
        // imperceptible and the card looked unclickable. Bumping the
        // lift to 2 px + adding a ring-2 + brand-tinted shadow under
        // hover makes the affordance visceral without the card jumping
        // around. `transition-all` covers ring + shadow + transform.
        className="transition-all group-hover:-translate-y-[2px] group-hover:shadow-lg group-hover:ring-2 group-hover:ring-brand-blue-3/30 group-hover:border-brand-blue-3/40"
        style={HOVER_STYLE}
      >
        <CardBody className="p-6 md:p-7">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* Status pill: PUBLISHED (green) vs DRAFT (amber/secondary).
                Previously always showed "● Published" — a draft dataset
                visible in /my would visually misrepresent itself as
                live (publishing-workflow safety regression flagged by
                visual-comparison audit #15). */}
            {dataset.isPublished === false ? (
              <Badge variant="secondary" title="Draft — not yet published">
                ● Draft
              </Badge>
            ) : (
              <Badge variant="pub">● Published</Badge>
            )}
            {dataset.license && (
              <Badge variant="outline" className="font-mono normal-case">
                {dataset.license}
              </Badge>
            )}
            {dataset.branchName && dataset.branchName !== 'original' && (
              <Badge variant="teal" className="font-mono normal-case">
                {dataset.branchName}
              </Badge>
            )}
            {dataset.publishStatus && dataset.publishStatus !== 'published' && (
              <Badge variant="secondary">{dataset.publishStatus}</Badge>
            )}
            {/* Surface the cloud-side "DATASET BEING PROCESSED" marker as
                a discrete badge instead of letting it leak into the
                abstract paragraph as ALL-CAPS body copy that reads like
                an error. */}
            {processing && (
              <Badge variant="secondary" title="Synthesizer enrichment in progress">
                Processing
              </Badge>
            )}
          </div>

          <CardTitle
            as="h3"
            className="text-[1.2rem] leading-snug mb-2 group-hover:text-ndi-teal transition-colors"
          >
            {displayName}
          </CardTitle>

          {(contributors.length > 0 || dataset.uploadedAt || dataset.createdAt) && (
            <p className="text-[13px] text-fg-secondary mb-4">
              {contributors.length > 0 && (
                <>
                  {contributors.slice(0, 3).join(', ')}
                  {contributors.length > 3 && ` +${contributors.length - 3}`}
                </>
              )}
              {contributors.length > 0 && (dataset.uploadedAt || dataset.createdAt) && (
                <span className="mx-2 text-fg-muted">·</span>
              )}
              {(dataset.uploadedAt || dataset.createdAt) && (
                <span className="text-fg-muted">
                  {formatDate(dataset.uploadedAt || dataset.createdAt!)}
                </span>
              )}
            </p>
          )}

          <div className="border-t border-b border-border-subtle/70 py-3 mb-4 flex flex-wrap gap-x-8 gap-y-3 text-[13px]">
            <MetaCell label="Species">
              {summary?.species && summary.species.length > 0 ? (
                <span className="font-mono">
                  {truncate(summary.species.map((s) => s.label).join(', '), 40)}
                </span>
              ) : dataset.species ? (
                <span className="font-mono">{truncate(dataset.species, 40)}</span>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </MetaCell>
            <MetaCell label="Region">
              {summary?.brainRegions && summary.brainRegions.length > 0 ? (
                <span className="font-mono">
                  {truncate(
                    summary.brainRegions.map((r) => r.label).join(', '),
                    40,
                  )}
                </span>
              ) : dataset.brainRegions ? (
                <span className="font-mono">
                  {truncate(dataset.brainRegions, 40)}
                </span>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </MetaCell>
            <MetaCell label="Documents">
              {summary?.counts.totalDocuments != null ? (
                <span className="font-mono">
                  {summary.counts.totalDocuments.toLocaleString('en-US')}
                </span>
              ) : dataset.documentCount != null ? (
                <span className="font-mono">
                  {dataset.documentCount.toLocaleString('en-US')}
                </span>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </MetaCell>
            {summary && summary.counts.subjects > 0 && (
              <MetaCell label="Subjects">
                <span className="font-mono">
                  {summary.counts.subjects.toLocaleString('en-US')}
                </span>
              </MetaCell>
            )}
            {dataset.totalSize != null && dataset.totalSize > 0 && (
              <MetaCell label="Size">
                <span className="font-mono">{formatBytes(dataset.totalSize)}</span>
              </MetaCell>
            )}
            {dataset.doi && (
              <MetaCell label="DOI">
                <span className="font-mono truncate inline-block max-w-[260px] align-bottom">
                  {dataset.doi.replace(/^https?:\/\//, '')}
                </span>
              </MetaCell>
            )}
          </div>

          {abstractText && (
            <p className="text-[13.5px] text-fg-secondary leading-relaxed line-clamp-2">
              {abstractText}
            </p>
          )}
        </CardBody>
      </Card>
    </Link>
  );
}

function MetaCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-fg-muted">
        {label}
      </span>
      <span className="text-fg-primary font-medium">{children}</span>
    </div>
  );
}

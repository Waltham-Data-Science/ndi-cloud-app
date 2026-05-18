'use client';

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
 *
 * # Click-pending visual feedback (audit 2026-04-27 #1, take 2)
 *
 * The original audit's `useLinkStatus` recommendation. Batch A shipped
 * `loading.tsx` instead, which doesn't activate during a layout-level
 * `await` — Next.js's `loading.tsx` is the Suspense fallback for the
 * PAGE, not the LAYOUT, so a top-level layout `await` blocks the page
 * (and its loading fallback) entirely. Verified visually: clicking
 * Sophie on production froze the catalog for 6+ s with NO visual
 * feedback at all.
 *
 * `useLinkStatus()` is the canonical fix. It's pure client-side state
 * — Next.js's router maintains a "pending" flag for each in-flight
 * navigation, and the hook reads it. The card's inner content renders
 * a "pending" treatment the moment the click is registered, holds it
 * for the entire navigation, and clears it when the new page mounts.
 * The user always sees the click "took."
 *
 * Constraint: `useLinkStatus()` only works in components that are
 * DESCENDANTS of a `<Link>`. We split the inner content into
 * `<DatasetCardInner>` so the hook lives below the `<Link>` boundary.
 */
import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import { Loader2 } from 'lucide-react';
import type { CSSProperties } from 'react';

import type { DatasetRecord } from '@/lib/api/datasets';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { isDefaultBranch } from '@/lib/dataset-filters';
import {
  cleanAbstract,
  cleanDatasetName,
  formatBytes,
  formatDate,
  truncate,
} from '@/lib/format';
import { normalizeLicense } from '@/lib/license-normalize';

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

  return (
    <Link
      href={`/datasets/${dataset.id}/overview`}
      className="block group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-3 rounded-lg"
      aria-label={`Open dataset ${displayName}`}
    >
      <DatasetCardInner dataset={dataset} displayName={displayName} />
    </Link>
  );
}

/**
 * Inner content split out so we can call `useLinkStatus()` — the hook
 * requires a Link-descendant context. The `pending` flag flips to true
 * the moment the user clicks the card, then back to false when the
 * destination route mounts. Total time can be 6+ s on slow datasets
 * where the cloud's `/document-class-counts` is timing out.
 *
 * The pending treatment:
 *   - Card opacity drops to 80% so it visually recedes
 *   - A brand-tinted ring stays prominent so the click target is still
 *     identified
 *   - A "Loading…" pill with spinner pops at the top-right of the card
 *     — the unambiguous "yes the click registered" signal
 *   - aria-busy + aria-live announce the pending state to SR users
 */
function DatasetCardInner({
  dataset,
  displayName,
}: {
  dataset: DatasetRecord;
  displayName: string;
}) {
  const { pending } = useLinkStatus();

  const { text: abstractText, processing } = cleanAbstract(
    dataset.abstract ?? dataset.description,
  );
  const contributors = (dataset.contributors ?? [])
    .map((c) => [c.firstName, c.lastName].filter(Boolean).join(' '))
    .filter(Boolean);
  const summary = dataset.summary ?? null;
  // Fold `CC-BY 4.0` / `CC-BY-4.0` / `Creative Commons Attribution 4.0`
  // → canonical `CC-BY-4.0` so the badge text matches across all
  // datasets. See `lib/license-normalize.ts`. `null` if the cloud
  // record has no license at all (the badge then doesn't render).
  const normalizedLicense = normalizeLicense(dataset.license);

  return (
    <Card
      // Audit #16 hover affordance preserved (2 px lift + ring + shadow).
      // Pending state stacks on top: stronger ring + dimmed body + visible
      // spinner. A future tweak could swap to a top-of-page progress bar
      // (NProgress style) if the per-card treatment ever feels noisy.
      className={cn(
        'relative transition-all',
        'group-hover:-translate-y-[2px] group-hover:shadow-lg',
        'group-hover:ring-2 group-hover:ring-brand-blue-3/30 group-hover:border-brand-blue-3/40',
        pending && [
          'opacity-80 ring-2 ring-brand-blue-3/60',
          // Disable the hover-translate while pending so the card
          // doesn't bounce when the cursor moves over it mid-load.
          'group-hover:translate-y-0',
        ],
      )}
      style={HOVER_STYLE}
      aria-busy={pending || undefined}
    >
      {/* Pending pill — top-right corner, brand-blue with spinner. Only
          rendered when pending; takes itself out of layout when not. */}
      {pending && (
        <div
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-brand-blue-3 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md"
          role="status"
          aria-live="polite"
          data-testid="dataset-card-pending"
        >
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Loading…
        </div>
      )}
      {/* Padding ramp: p-5 (20px) on phones <640px so the card body
          doesn't crowd the meta strip at <375px viewports (px-7 page
          padding + p-6 card padding was leaving ~216px content at
          320px), p-6 on small tablets, p-7 on md+ desktops. */}
      <CardBody className="p-5 sm:p-6 md:p-7">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Status pill: PUBLISHED (green) / DRAFT (amber) / PROCESSING.
              2026-04-28 — these were previously stacked: Published +
              Processing rendered side-by-side whenever the synthesizer
              was still indexing a published dataset, which read as a
              contradiction ("is it published or not?"). Reviewer
              flagged. New rule: when `processing` is true we show
              ONLY the Processing pill — same pill spot, same chip
              semantics, no stacking. Once enrichment lands, the
              Published/Draft pill returns. */}
          {processing ? (
            <Badge variant="secondary" title="Synthesizer enrichment in progress">
              ● Processing
            </Badge>
          ) : dataset.isPublished === false ? (
            <Badge variant="secondary" title="Draft — not yet published">
              ● Draft
            </Badge>
          ) : (
            <Badge variant="pub">● Published</Badge>
          )}
          {normalizedLicense && (
            <Badge variant="outline" className="font-mono normal-case">
              {normalizedLicense}
            </Badge>
          )}
          {!isDefaultBranch(dataset.branchName) && (
            <Badge variant="teal" className="font-mono normal-case">
              {dataset.branchName}
            </Badge>
          )}
          {/* `publishStatus` is the cloud's lifecycle field (`in-review`,
              `processing`, `draft`, etc.). The Processing rendering
              above already covers the "synthesizer running" case; if
              the cloud reports a non-published lifecycle status that
              ISN'T just synthesizer-processing, surface that distinct
              status here. Skipping when `processing` is also set
              avoids the same double-pill the abstract-flag path used
              to hit. */}
          {!processing &&
            dataset.publishStatus &&
            dataset.publishStatus !== 'published' && (
              <Badge variant="secondary">{dataset.publishStatus}</Badge>
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
              {/* Truncate width was a fixed `max-w-[260px]` which overflowed
                  the card at viewports <375px (after `px-7` page padding
                  + `p-6` card padding eats ~104px, the inner column is
                  ~216px at 320px viewport). Switched to a responsive
                  ramp: 180px on small phones, 260px from sm: upward.
                  `truncate` clips the rest with an ellipsis. */}
              <span className="font-mono truncate inline-block max-w-[180px] sm:max-w-[260px] align-bottom">
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

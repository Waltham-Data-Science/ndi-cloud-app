'use client';

/**
 * Dataset detail hero — renders dataset name, byline (contributors +
 * date), license + DOI badges, and a `HeroFact` strip with quick-glance
 * facts (species/region/docs/subjects/size/license) below the h1.
 *
 * Phase 6.6 REBUILD-2: ported the source `HeroFact` strip from
 * `ndi-data-browser-v2/frontend/src/pages/DatasetDetailPage.tsx:398-424`
 * + `HeroFact` definition at lines 430-454. The original Phase 3b port
 * shipped a "minimum-viable hero" without the fact strip; the audit
 * flagged this as a deferred-implicit gap (the comment noted "Phase 3+
 * polish layers" but no STATE entry enumerated it). Audience benefit:
 * users browsing dataset detail pages get an immediate quick-glance
 * read on subject count, size, and license without having to wait for
 * the Overview tab content to load.
 *
 * Uses `useDataset()` directly (no prefetch from the layout RSC because
 * App Router layouts don't share fetched data with their children's
 * routes). Renders skeletons during load; falls back to dataset id as
 * heading text if the fetch fails (the page below the hero stays
 * usable; you can still navigate tabs).
 */
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDataset } from '@/lib/api/datasets';
import {
  cleanDatasetName,
  formatBytes,
  formatDate,
  formatNumber,
} from '@/lib/format';

export function DatasetDetailHero({ datasetId }: { datasetId: string }) {
  const { data, isLoading, isError } = useDataset(datasetId);

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: 'var(--grad-depth)' }}
      aria-labelledby="dataset-hero-h1"
    >
      <div className="relative mx-auto max-w-[1200px] px-7 py-10">
        <Link
          href="/datasets"
          className="inline-flex items-center gap-1 text-[12.5px] text-white/70 hover:text-white transition-colors mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Back to Data Commons
        </Link>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ) : isError || !data ? (
          <h1
            id="dataset-hero-h1"
            className="text-[1.75rem] md:text-[2rem] font-display font-bold tracking-tight leading-tight"
          >
            {datasetId}
          </h1>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {/* Status pill — distinguish PUBLISHED (green) from DRAFT
                  (amber). Previously always showed "● Published" which
                  is a publishing-workflow safety regression: a draft
                  dataset opened in a logged-in session could visually
                  misrepresent itself as live. Source data-browser used
                  a "PUBLIC DATASET" / "DRAFT" uppercase eyebrow toggle
                  (visual-comparison audit #15). */}
              {data.isPublished === false ? (
                <Badge variant="secondary" title="Draft — not yet published">
                  ● Draft
                </Badge>
              ) : (
                <Badge variant="pub">● Published</Badge>
              )}
              {data.license ? (
                <Badge variant="outline" className="font-mono normal-case bg-white/10 ring-white/20 text-white/85">
                  {data.license}
                </Badge>
              ) : (
                /*
                  Audit 2026-04-27 #19 (design call) — pre-fix, datasets
                  with an empty `license` field rendered nothing in the
                  hero badge row, leaving "● Published" alone next to
                  the branchName badge. Visually that read as
                  "license missing on purpose," when in fact most
                  empty-license cases just mean the cloud record didn't
                  populate the field.
                  Showing a quiet "License unspecified" badge gives the
                  user an explicit hand-off ("ask the dataset author")
                  rather than an absence. Italic + muted variant
                  signals that this is a soft label, not a license
                  identifier itself. Skipping for explicit non-public
                  cases (Draft) — those have their own status pill
                  carrying the visibility story.
                */
                data.isPublished !== false && (
                  <Badge
                    variant="outline"
                    className="italic normal-case bg-white/5 ring-white/15 text-white/55"
                    title="No license set on the dataset record. Ask the dataset author for licensing details."
                  >
                    License unspecified
                  </Badge>
                )
              )}
              {data.branchName && data.branchName !== 'original' && (
                <Badge variant="teal" className="font-mono normal-case">
                  {data.branchName}
                </Badge>
              )}
            </div>

            <h1
              id="dataset-hero-h1"
              className="text-[1.75rem] md:text-[2rem] font-display font-bold tracking-tight leading-tight mb-3 max-w-3xl"
            >
              {cleanDatasetName(data.name)}
            </h1>

            {(data.contributors?.length || data.uploadedAt || data.createdAt) && (
              <p className="text-[13px] text-white/70 max-w-3xl">
                {data.contributors && data.contributors.length > 0 && (
                  <>
                    {data.contributors
                      .slice(0, 3)
                      .map((c) =>
                        [c.firstName, c.lastName].filter(Boolean).join(' '),
                      )
                      .filter(Boolean)
                      .join(', ')}
                    {data.contributors.length > 3 &&
                      ` +${data.contributors.length - 3}`}
                  </>
                )}
                {data.contributors && data.contributors.length > 0 && (data.uploadedAt || data.createdAt) && (
                  <span className="mx-2 text-white/40">·</span>
                )}
                {(data.uploadedAt || data.createdAt) && (
                  <span>
                    {formatDate(data.uploadedAt || data.createdAt!)}
                  </span>
                )}
                {data.doi && (
                  <>
                    <span className="mx-2 text-white/40">·</span>
                    <span className="font-mono text-white/55">
                      {data.doi.replace(/^https?:\/\//, '')}
                    </span>
                  </>
                )}
              </p>
            )}

            {/* HeroFact strip — quick-glance facts below the h1. Each
                fact is a `<dt>` (uppercase eyebrow label) + `<dd>`
                (value, monospace where the value is a number/code).
                Source data-browser `HeroFact` SCSS used `gap-x-8 gap-y-3`
                + a top border in white/10. Only fact-keys with a value
                render — no empty placeholders.

                Audit 2026-04-27 #18 (design call) — pre-fix, datasets
                with few populated facts (e.g. Reikersdorfer: just
                Documents + Size) sat awkwardly aligned-left while
                wider datasets spanned the full row. The layout looked
                ragged across the catalog. Picked the lighter of the
                audit's two options: count the rendered facts and
                center-justify when there are fewer than 4 (so the
                row visually balances) and keep the natural
                `justify-start` for ≥4 facts (which already span
                enough width to look intentional). The alternative —
                a fixed 6-cell grid with hide-on-empty — would
                introduce hard layout for a strip that's purely
                informational and varies by dataset. */}
            {(() => {
              const facts: ReactNode[] = [];
              if (data.species) {
                facts.push(
                  <HeroFact key="species" label="Species" value={data.species} />,
                );
              }
              if (data.brainRegions) {
                facts.push(
                  <HeroFact
                    key="region"
                    label="Region"
                    value={data.brainRegions}
                    mono
                  />,
                );
              }
              if (data.documentCount != null) {
                facts.push(
                  <HeroFact
                    key="documents"
                    label="Documents"
                    value={formatNumber(data.documentCount)}
                    mono
                  />,
                );
              }
              if (
                data.numberOfSubjects != null &&
                data.numberOfSubjects > 0
              ) {
                facts.push(
                  <HeroFact
                    key="subjects"
                    label="Subjects"
                    value={formatNumber(data.numberOfSubjects)}
                    mono
                  />,
                );
              }
              if (data.totalSize != null && data.totalSize > 0) {
                facts.push(
                  <HeroFact
                    key="size"
                    label="Size"
                    value={formatBytes(data.totalSize)}
                    mono
                  />,
                );
              }
              if (data.license) {
                facts.push(
                  <HeroFact
                    key="license"
                    label="License"
                    value={data.license}
                    mono
                  />,
                );
              }
              if (facts.length === 0) return null;
              // Center-justify when sparse so the row doesn't sit
              // awkwardly aligned-left next to the wide hero. With
              // ≥4 facts, the row spans enough width to look
              // intentional with the natural left-justify. The
              // visual breakpoint matches what the audit observer
              // saw: Reikersdorfer (2 facts) felt asymmetric;
              // Sophie Griswold (5 facts) didn't.
              const justify =
                facts.length < 4 ? 'justify-center' : 'justify-start';
              return (
                <dl
                  className={
                    `flex flex-wrap gap-x-8 gap-y-3 mt-5 pt-4 border-t border-white/10 ` +
                    `text-[11.5px] max-w-3xl ${justify}`
                  }
                  data-fact-count={facts.length}
                >
                  {facts}
                </dl>
              );
            })()}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Single fact row inside the hero `<dl>`. Label is a small uppercase
 * eyebrow (white/50, 10px); value is monospaced when `mono` is set
 * (counts/sizes/codes), regular sans-serif for prose values like
 * species names. Ported verbatim from data-browser-v2's
 * `DatasetDetailPage.tsx:430-454` HeroFact, transcribed to the
 * monorepo's design tokens.
 */
function HeroFact({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="uppercase tracking-wider text-white/50 text-[10px] font-semibold">
        {label}
      </dt>
      <dd
        className={
          mono
            ? 'font-mono text-white text-[13px]'
            : 'text-white text-[13px] font-medium'
        }
      >
        {value}
      </dd>
    </div>
  );
}

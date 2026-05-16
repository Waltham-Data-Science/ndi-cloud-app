/**
 * WorkspaceShell — server-rendered hero for `/my/workspace/[id]/*`.
 *
 * Phase A of the workspace redesign (2026-05-16 design doc:
 * `apps/web/docs/design/2026-05-16-workspace-redesign.md`). The shell
 * mirrors `DatasetDetailHero` byte-for-byte on the visible chrome —
 * same depth gradient, same H1 ramp, same byline, same badge row,
 * same HeroFact strip — so the workspace reads as a continuation of
 * `/datasets/[id]/...`, not as a separate visual world.
 *
 * Two differences from the dataset-detail hero:
 *
 *   1. Back-link target. `← My workspace` (→ `/my`) instead of
 *      `← Back to Data Commons` (→ `/datasets`).
 *   2. Eyebrow above the badge row. `WORKSPACE · <short-id>` in
 *      brand-blue-3 — matches the eyebrow pattern from the home
 *      page hero and signals that the user is in the working
 *      surface, not the public catalog detail.
 *
 * Why a Server Component (same rationale as DatasetDetailHero, SEO
 * audit Apr 2026): the H1 + byline render with the correct dataset
 * name on first paint instead of after client hydration. Workspace
 * URLs get shared too (Slack / DMs); preview unfurls + paste-into-doc
 * should show the dataset name, not the bare hex id.
 *
 * The auth gate lives elsewhere (`WorkspaceAuthGate` wrapped around
 * the tab-page children). The shell is intentionally render-safe for
 * an anonymous user during the brief auth-resolve window — the
 * dataset metadata it surfaces is identical to what `/datasets/[id]`
 * already shows publicly.
 */
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { safeFetchDataset } from '@/lib/api/datasets-server';
import { isDefaultBranch } from '@/lib/dataset-filters';
import { normalizeLicense } from '@/lib/license-normalize';
import {
  cleanDatasetName,
  formatBytes,
  formatDate,
  formatNumber,
} from '@/lib/format';

/**
 * Build the eyebrow line shown above the badge row. Long ids get
 * abbreviated (first 8 + last 4 with an ellipsis) so the eyebrow
 * stays on one line even for 24-char Mongo ObjectIds.
 */
function shortId(id: string): string {
  return id.length > 24 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export async function WorkspaceShell({ datasetId }: { datasetId: string }) {
  const data = await safeFetchDataset(datasetId);

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: 'var(--grad-depth)' }}
      aria-labelledby="workspace-hero-h1"
    >
      <div className="relative mx-auto max-w-[1200px] px-7 py-10">
        <Link
          href="/my"
          className="inline-flex items-center gap-1 text-[12.5px] text-white/70 hover:text-white transition-colors mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          My workspace
        </Link>

        {/* Eyebrow — sits above the badge row, signals "you're in the
            workspace surface" with the short id appended in mono. The
            brand-blue-3 + tracking-eyebrow + uppercase combination
            matches the home page's hero eyebrow pattern. */}
        <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue-3"
          />
          WORKSPACE
          <span aria-hidden className="opacity-30 px-1">|</span>
          <span className="font-mono normal-case tracking-normal text-[10.5px] text-white/85">
            {shortId(datasetId)}
          </span>
        </div>

        {!data ? (
          <h1
            id="workspace-hero-h1"
            className="text-[1.75rem] md:text-[2rem] font-display font-bold tracking-tight leading-tight"
          >
            {datasetId}
          </h1>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {data.isPublished === false ? (
                <Badge variant="secondary" title="Draft — not yet published">
                  ● Draft
                </Badge>
              ) : (
                <Badge variant="pub">● Published</Badge>
              )}
              {(() => {
                const normalizedLicense = normalizeLicense(data.license);
                return normalizedLicense ? (
                  <Badge
                    variant="outline"
                    className="font-mono normal-case bg-white/10 ring-white/20 text-white/85"
                  >
                    {normalizedLicense}
                  </Badge>
                ) : null;
              })()}
              {!data.license &&
                data.isPublished !== false && (
                  <Badge
                    variant="outline"
                    className="italic normal-case bg-white/5 ring-white/15 text-white/55"
                    title="No license set on the dataset record. Ask the dataset author for licensing details."
                  >
                    License unspecified
                  </Badge>
                )}
              {!isDefaultBranch(data.branchName) && (
                <Badge variant="teal" className="font-mono normal-case">
                  {data.branchName}
                </Badge>
              )}
            </div>

            <h1
              id="workspace-hero-h1"
              className="text-[1.75rem] md:text-[2rem] font-display font-bold tracking-tight leading-tight mb-3 max-w-3xl"
            >
              {cleanDatasetName(data.name)}
            </h1>

            {(data.contributors?.length ||
              data.uploadedAt ||
              data.createdAt) && (
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
                {data.contributors &&
                  data.contributors.length > 0 &&
                  (data.uploadedAt || data.createdAt) && (
                    <span className="mx-2 text-white/40">·</span>
                  )}
                {(data.uploadedAt || data.createdAt) && (
                  <span
                    className="whitespace-nowrap"
                    title={
                      data.uploadedAt
                        ? 'Date this dataset was uploaded to NDI (uploadedAt)'
                        : 'Date this dataset record was first created on NDI (createdAt)'
                    }
                  >
                    <span className="text-white/55">Published </span>
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

            {(() => {
              const facts: ReactNode[] = [];
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
              return (
                <dl
                  className={
                    `flex flex-wrap gap-x-8 gap-y-3 mt-5 pt-4 border-t border-white/10 ` +
                    `text-[11.5px] max-w-3xl justify-start`
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
 * Suspense fallback for the async WorkspaceShell. Same shape as
 * `DatasetDetailHeroSkeleton` — depth-gradient band, back-link
 * placeholder, eyebrow + skeleton title rows. Prevents layout shift
 * on hero-data resolve.
 */
export function WorkspaceShellSkeleton() {
  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: 'var(--grad-depth)' }}
      aria-busy="true"
      aria-label="Loading workspace hero"
    >
      <div className="relative mx-auto max-w-[1200px] px-7 py-10">
        <div className="inline-flex items-center gap-1 text-[12.5px] text-white/70 mb-3">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          My workspace
        </div>
        <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue-3"
          />
          WORKSPACE
        </div>
        <div className="space-y-3">
          <Skeleton className="h-7 md:h-8 w-2/3 bg-white/10" />
          <Skeleton className="h-4 w-1/2 bg-white/10" />
        </div>
      </div>
    </section>
  );
}

/**
 * Hero fact row — copy of the HeroFact in DatasetDetailHero. Could
 * be hoisted into a shared primitive in `components/ui/`, but the
 * two heroes are intentionally kept side-by-side for now so a
 * change to the visual language can be tried on one before
 * propagating to the other.
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

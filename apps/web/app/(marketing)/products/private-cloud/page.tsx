import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { MarketingButton } from '@/components/marketing/Button';
import { SITE_LOGO_URL, SITE_ORIGIN } from '@/lib/site-config';

/**
 * /products/private-cloud — "For Labs" product page (NDI Data Browser).
 *
 * Ported from ndi-web-app-wds/app/src/pages/products/private-cloud/index.tsx.
 * Pure RSC. Mockup chrome (browser-frame URL bar over the data-browser
 * screenshot) ported as inline JSX with Tailwind utilities.
 *
 * One detail preserved verbatim: the mockup URL still reads
 * "app.ndi-cloud.com / vanhooser-lab / datasets" — that's the product
 * mockup's own URL bar (a screenshot artifact illustrating what the
 * Data Browser looks like in production), NOT a cross-domain link in
 * the marketing site itself. The actual /datasets route in this
 * monorepo is same-origin per the unification plan.
 */
export const metadata: Metadata = {
  title: 'For Labs — NDI Data Browser',
  description:
    'The NDI Data Browser is where your lab works. Upload sessions from MATLAB or Python, track sync status, publish datasets with a DOI.',
  alternates: { canonical: `${SITE_ORIGIN}/products/private-cloud` },
  openGraph: {
    type: 'website',
    url: `${SITE_ORIGIN}/products/private-cloud`,
    title: 'NDI Data Browser — NDI Cloud',
    description:
      'Upload sessions from MATLAB or Python, track sync status, publish with a DOI.',
    images: [SITE_LOGO_URL],
    siteName: 'NDI Cloud',
  },
};

export default function PrivateCloudPage() {
  return (
    <main>
      {/* Pre-release notice (visual-sweep hotfix 2026-04-28).
          The For Labs page is hidden from the header/footer nav
          (correct — product not shipped) and the home-page bridge
          row says "COMING SOON" beside it (also correct). Direct
          URL hits, however, were landing on a feature-rich page
          with no signal that this product isn't yet available.
          Adding a discrete banner above the hero (still inside the
          page main content area, NOT above the site header) so
          anyone who arrives via the canonical URL or a search
          result understands today's published flow runs through
          Nansen and the Data Browser is the planned shape. Token
          treatment matches the codebase's notice style — same
          `bg-amber-50 ring-1 ring-amber-200 text-amber-800` family
          used by ErrorState, UseThisDataModal, and the chart-blob
          fallback empty states. */}
      <ComingSoonBanner />

      {/* HERO */}
      <section
        className="relative overflow-hidden text-white px-7 pt-20 pb-12"
        style={{ background: 'var(--grad-depth)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage: "url('/logos/ndicloud-mark-color.svg')",
            backgroundSize: '140px',
            backgroundRepeat: 'repeat',
          }}
        />
        {/* Hero inner: center alignment per source `.heroInner { text-align: center }`.
            Same pattern as the LabChat hero (#22) and home hero (#21) —
            the eyebrow pill + halo dot pattern, the centered display
            heading, and the centered CTA row. */}
        <div className="relative max-w-[1200px] mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-brand-blue-3 mb-5 px-3.5 py-1.5 rounded-pill"
            style={{ background: 'rgba(23, 167, 255, 0.12)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3"
              style={{ boxShadow: '0 0 0 3px rgba(93, 193, 255, 0.25)' }}
            />
            NDI Data Browser · For labs
          </div>
          <h1
            className="font-display font-extrabold leading-[1.1] tracking-tight text-white mb-5 m-0 max-w-[900px] mx-auto"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          >
            Every session, every version,{' '}
            <em className="not-italic text-brand-blue">one workspace.</em>
          </h1>
          <p className="text-[17px] leading-relaxed text-white/80 max-w-[720px] mx-auto mb-8 m-0">
            The Data Browser is where your lab works. Upload sessions from the
            rig or your workstation, group them into datasets, attach openMINDS
            metadata, and publish with a DOI when the dataset is ready.
            The same data model, from rig to citation.
          </p>
          <div className="flex gap-3 flex-wrap justify-center mb-12">
            <Link
              href="/create-account"
              className="inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-pill text-sm px-5 py-2 bg-ndi-teal text-white shadow-cta hover:-translate-y-px transition-transform duration-(--duration-base) ease-(--ease-out) no-underline"
            >
              Create Free Account
            </Link>
            <MarketingButton
              as="a"
              href="mailto:info@walthamdatascience.com?subject=NDI%20Data%20Browser%20Demo"
              variant="ghost"
              size="md"
            >
              Request a demo →
            </MarketingButton>
          </div>

          {/* Mockup frame: dark `#1a1f2b` chrome + translateY(60px) bleed
              + macOS traffic-light dots + translucent URL capsule. Same
              pattern as the LabChat hero mockup (#22). Source
              `.mockupFrame` SCSS — restores the z-axis depth effect that
              bleeds into the heroFade band below. */}
          <div
            className="relative max-w-[1140px] mx-auto rounded-t-2xl px-3 pt-3 text-left"
            style={{
              background: '#1a1f2b',
              transform: 'translateY(60px)',
              boxShadow:
                '0 40px 80px -20px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)',
            }}
          >
            <div
              aria-hidden
              className="flex items-center gap-2 px-2.5 pt-2 pb-3.5"
            >
              <div className="flex gap-1.5">
                <span className="w-[11px] h-[11px] rounded-full inline-block" style={{ background: '#ff5f57' }} />
                <span className="w-[11px] h-[11px] rounded-full inline-block" style={{ background: '#febc2e' }} />
                <span className="w-[11px] h-[11px] rounded-full inline-block" style={{ background: '#28c840' }} />
              </div>
              <div
                className="flex-1 max-w-[420px] mx-auto rounded-md px-3 py-1.5 font-mono text-[11px] text-white/60 inline-flex items-center justify-center gap-2"
                style={{ background: 'rgba(255, 255, 255, 0.06)' }}
              >
                <span className="inline-flex items-center text-white/50">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="8" width="10" height="7" rx="1.5" />
                    <path d="M5 8V5a3 3 0 0 1 6 0v3" />
                  </svg>
                </span>
                ndi-cloud.com / dataset / document
              </div>
            </div>
            {/*
              2026-04-28 — switched the hero capture from the public
              Data Commons catalog (a paged list view) to a document
              detail page. The catalog screenshot pitched "we have
              published datasets"; the document-detail capture pitches
              "look at the depth your lab's data goes to" — concrete
              imageStack with structured properties on the left and a
              28-node dependency graph on the right (the unique-to-NDI
              relational structure). Side-by-side layout shipped in
              PR #121 so this view exists at md+ widths. 4K Retina
              (3840×2160) source so next/image generates Retina-quality
              srcsets via `quality={90}`.
            */}
            <Image
              src="/mockups/data-browser-document-detail.png"
              alt="NDI Data Browser document detail: an imageStack document's structured properties (label, dimension order, scale, timestamps, clocktype) on the left with a 28-node dependency graph showing the document's relational links to subjects and subject groups on the right"
              width={3840}
              height={2160}
              priority
              quality={90}
              className="block w-full h-auto rounded-t-md"
            />
          </div>
        </div>
      </section>

      {/* HERO FADE — bridges dark hero → white capabilities band, masking
          the otherwise-hard edge. Same 100px gradient as LabChat (#22). */}
      <div
        aria-hidden
        className="h-[100px]"
        style={{
          background:
            'linear-gradient(180deg, #001438 0%, var(--color-bg-surface) 100%)',
        }}
      />

      {/* CAPABILITIES — white per source `.section` (no explicit bg, inherits
          `.pageMain { background: var(--white) }`). Was bg-bg-canvas
          (cream) in the original port. */}
      <section className="px-7 py-16 bg-bg-surface">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            What it does
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            Browse, organize, and publish your lab&rsquo;s data.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
            The Data Browser is the control room for everything in your
            lab&rsquo;s data pipeline — from the rig&rsquo;s first write to the
            published DOI.
          </p>

          {/* Editorial-style stacked rows. Source `.caps`/`.cap`
              (PrivateCloud.module.scss:269-313): vertical column with
              `border-top` on the container + `border-bottom` on each
              row, `grid-template-columns: 240px 1fr; gap: 40px;
              padding: 28px 0`. Mobile (≤768px) collapses to a single
              column with gap: 8px. h3 = 20px brand-navy display, body
              = 15px secondary at 1.6 leading, max 560px wide. Code
              chips inside body get a gray-100 wash + brand-navy color
              per source `.cap p code`. */}
          <div className="flex flex-col border-t border-border-subtle">
            <CapRow
              title="Dataset management"
              body="Upload sessions and files, organize them into datasets, track status across your lab. Search by species, probe, region, stimulus, or any metadata field — everything is queryable."
            />
            <CapRow
              title="openMINDS metadata"
              body={
                <>
                  Every session carries structured openMINDS metadata — real
                  ontology IDs, not free-text. A query for{' '}
                  <code className="font-mono text-[0.88em] bg-gray-100 text-brand-navy px-1.5 py-px rounded-[4px]">
                    NCBITaxon:10090
                  </code>{' '}
                  returns every M. musculus session in your lab; a query for{' '}
                  <code className="font-mono text-[0.88em] bg-gray-100 text-brand-navy px-1.5 py-px rounded-[4px]">
                    UBERON:0002436
                  </code>{' '}
                  returns every V1 recording. Search across years of work in one
                  go.
                </>
              }
            />
            <CapRow
              title="DOI publishing"
              body={
                <>
                  When your dataset is ready, publish it to the NDI Data Commons.
                  A DOI (under the NDI{' '}
                  <code className="font-mono text-[0.88em] bg-gray-100 text-brand-navy px-1.5 py-px rounded-[4px]">10.63884</code> prefix) and a
                  public landing page are created so other researchers can cite
                  your work.
                </>
              }
            />
            <CapRow
              title="MATLAB + Python SDKs"
              body="Same workspace, two SDKs. NDI-MATLAB for rig control and analysis notebooks, NDI-Python for pipelines and batch jobs. Built-in readers for Intan, Blackrock, CED Spike2, and SpikeGadgets."
            />
          </div>
        </div>
      </section>

      {/* WORKFLOW — cream wash band per source `.workflowBand
          { background: var(--brand-cream) }`. Was bg-bg-surface (white) in
          the original port — the cream gives this band visual separation
          from the white capabilities band above and the white session-detail
          split below. */}
      <section className="px-7 py-16 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            Workflow
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            From upload to published dataset.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-12 m-0">
            A few commands on your workstation, a few clicks in the browser.
          </p>

          <div className="grid grid-cols-3 max-[720px]:grid-cols-1 gap-6">
            <WorkflowStep
              num="01"
              title="Upload files"
              body="Raw recordings, analysis outputs, and supporting files upload from your workstation. Progress is visible in real time."
            />
            <WorkflowStep
              num="02"
              title="Add metadata"
              body="Attach species, brain region, probe type, stimulus, and contributor info. Fill in abstracts, funding, and associated publications — stored in the openMINDS schema alongside your data."
            />
            <WorkflowStep
              num="03"
              title="Publish with DOI"
              body="Choose a license (CC-BY 4.0), review the metadata, and publish. Your dataset gets a DOI and a public landing page on the Data Commons."
            />
          </div>
        </div>
      </section>

      {/* SESSION DETAIL SPLIT — white per source `.section` (no explicit
          bg, page-bg-inherited white). Was bg-bg-canvas (cream) in the
          original port; cream → white restores the source's
          cream-workflow → white-session-detail visual rhythm. */}
      <section className="px-7 py-16 bg-bg-surface">
        <div className="max-w-[1100px] mx-auto grid grid-cols-2 max-[840px]:grid-cols-1 gap-12 items-start">
          <div>
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              Session detail
            </div>
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Rich metadata, not just files.
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary mb-5 m-0">
              Every session carries its full provenance — species, probe,
              stimulus, QC status, sync state, notebook cross-references.
              Indexed by the Data Commons and queryable by LabChat.
            </p>
            <ul className="list-none p-0 m-0 flex flex-col gap-3">
              {[
                'openMINDS species, region, strain, sex — real ontology IDs',
                "Permanent session IDs that don't change",
                'Linked notebook entries, protocols, and analysis scripts',
                'Role-based access: PI, members, collaborators, public',
              ].map((item) => (
                <li
                  key={item}
                  className="pl-6 relative text-sm leading-relaxed text-fg-secondary"
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 inline-block w-2 h-2 rounded-full bg-ndi-teal"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <SessionCard
              title="V1 whole-cell · gratings_session_212"
              status="published"
              meta={[
                { k: 'DOI', v: '10.48324/ndi.ds.94a2f08' },
                { k: 'Species', v: 'M. musculus' },
                { v: '2.4 GB' },
              ]}
            />
            <SessionCard
              title="Chronic probe stability · cohort_30d"
              status="syncing"
              statusLabel="Syncing 84%"
              meta={[
                { k: 'Sessions', v: '412' },
                { k: 'Species', v: 'R. norvegicus' },
              ]}
              progress={84}
            />
            <SessionCard
              title="Natural movies · V1 response library"
              status="draft"
              meta={[
                { k: 'Sessions', v: '214' },
                { k: 'Species', v: 'M. musculus' },
                { v: '31 GB' },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ECOSYSTEM (dark band) — `--color-bg-depth` (#0d1117 near-black)
          per source `.ecoBand { background: var(--bg-depth) }`. Was navy
          `--color-bg-inverse` in the original port. EcoRows are wrapped
          in a unified translucent-white container with flush
          `border-top` dividers (no individual card borders) — restores
          the source's `.ecoRows { background: rgba(255,255,255,0.04);
          overflow: hidden; border-radius: 14px; }` composition. Active
          row gets a translucent-blue wash + the arrow morphs into a
          pill-shaped uppercase "You're here" badge. Same pattern as the
          home-page bridge container (#21). */}
      <section
        className="px-7 py-16 text-white"
        style={{ background: 'var(--color-bg-depth)' }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3">
            Part of NDI Cloud
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight leading-[1.2] mb-3 m-0">
            Works with the rest of the NDI ecosystem.
          </h2>
          <p className="text-base leading-relaxed text-white/75 max-w-[680px] mb-10 m-0">
            The Data Browser is one of three connected tools on NDI Cloud.
            Datasets you manage here are searchable on the public Data Commons
            and queryable through LabChat. One account, three products.
          </p>

          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <EcoRow
              num="01"
              title="Data Commons"
              desc="Public search · DOI landing pages"
              href="/"
            />
            <EcoRow
              num="02"
              title="Data Browser"
              desc="Your lab's private workspace"
              active
            />
            <EcoRow
              num="03"
              title="LabChat"
              desc="Ask questions about your data"
              href="/products/labchat"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative overflow-hidden px-7 py-16 text-white"
        style={{ background: 'var(--grad-depth)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.035]"
          style={{
            backgroundImage: "url('/logos/ndicloud-mark-color.svg')",
            backgroundSize: '140px',
            backgroundRepeat: 'repeat',
          }}
        />
        <div className="relative max-w-[800px] mx-auto text-center">
          <h2 className="text-[1.75rem] font-bold tracking-tight leading-[1.2] mb-3 m-0">
            Get your first dataset published in two weeks.
          </h2>
          <p className="text-base leading-relaxed text-white/75 mb-8 m-0">
            Create the account, upload a session you already have on disk, and
            we&rsquo;ll walk you through the metadata fields and the first
            publish. Most labs ship their first DOI inside two weeks.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/create-account"
              className="inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-pill text-sm px-5 py-2 bg-ndi-teal text-white shadow-cta hover:-translate-y-px transition-transform duration-(--duration-base) ease-(--ease-out) no-underline"
            >
              Create Free Account
            </Link>
            <MarketingButton
              as="a"
              href="mailto:info@walthamdatascience.com?subject=NDI%20Data%20Browser%20Demo"
              variant="ghost"
              size="md"
            >
              Talk to us
            </MarketingButton>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Pre-release notice band rendered at the very top of the For Labs
 * page main content (BELOW the site header, ABOVE the hero band).
 * Visual-sweep hotfix 2026-04-28 — direct hits on
 * `/products/private-cloud` were landing on a feature-rich pitch with
 * no signal that the product isn't shipped yet; a discrete in-page
 * banner closes that gap without requiring nav-level changes.
 *
 * Token treatment intentionally matches the codebase's existing
 * notice family (`bg-amber-50 ring-1 ring-amber-200 text-amber-800`)
 * — same as ErrorState, UseThisDataModal's dissonance note, and the
 * chart-blob fallback empty states — so it reads as part of the same
 * design system rather than a one-off.
 *
 * Exported so the unit test can render it in isolation; the page
 * itself uses it inline above the hero.
 */
export function ComingSoonBanner() {
  return (
    <div
      role="note"
      aria-label="Pre-release notice"
      data-testid="for-labs-coming-soon-banner"
      className="bg-amber-50 ring-1 ring-amber-200 text-amber-900"
    >
      <div className="max-w-[1100px] mx-auto px-7 py-2.5 text-sm leading-relaxed">
        <span className="font-semibold mr-1">Coming soon —</span>
        this product is in development. The Data Browser experience
        described below is the planned shape; today our published
        flow runs through{' '}
        <a
          href="https://nansen.kavlifoundation.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-amber-950 focus-visible:outline-none focus-visible:text-amber-950"
        >
          Nansen
        </a>
        .
      </div>
    </div>
  );
}

/**
 * Capability row in the editorial-style stacked list. Source
 * `.cap` (PrivateCloud.module.scss:276-313) — `display: grid;
 * grid-template-columns: 240px 1fr; gap: 40px; padding: 28px 0;
 * border-bottom: 1px solid var(--border-subtle)`. Mobile (≤768px)
 * collapses to a single column with gap: 8px. Title h3 is the source's
 * 20px brand-navy display weight; body is 15px fg-secondary at 1.6
 * leading, capped at 560px wide.
 */
function CapRow({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[240px_1fr] max-[768px]:grid-cols-1 gap-10 max-[768px]:gap-2 py-7 border-b border-border-subtle">
      <h3 className="font-display font-bold text-[20px] tracking-tight text-brand-navy m-0 leading-tight">
        {title}
      </h3>
      <p className="text-[15px] leading-[1.6] text-fg-secondary m-0 max-w-[560px]">
        {body}
      </p>
    </div>
  );
}

function WorkflowStep({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="font-display font-bold text-3xl text-ndi-teal mb-2">{num}</div>
      <h4 className="text-base font-bold text-fg-primary mb-2 m-0">{title}</h4>
      <p className="text-sm leading-relaxed text-fg-secondary m-0">{body}</p>
    </div>
  );
}

type SessionStatus = 'published' | 'syncing' | 'draft';

function SessionCard({
  title,
  status,
  statusLabel,
  meta,
  progress,
}: {
  title: string;
  status: SessionStatus;
  statusLabel?: string;
  meta: Array<{ k?: string; v: string }>;
  progress?: number;
}) {
  const statusClasses: Record<SessionStatus, string> = {
    published: 'bg-green-100 text-green-800',
    syncing: 'bg-amber-100 text-amber-800',
    draft: 'bg-gray-200 text-gray-700',
  };
  const labelMap: Record<SessionStatus, string> = {
    published: 'Published',
    syncing: 'Syncing',
    draft: 'Draft',
  };
  return (
    // Shared team-card hover pattern. Smaller status card so the
    // shadow scale is `shadow-xs` → `shadow-sm` on hover (one step
    // smaller than the larger marketing tiles to stay proportional).
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-4 shadow-xs transition-all duration-(--duration-base) ease-(--ease-out) hover:border-ndi-teal-border hover:-translate-y-0.5 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-sm font-semibold text-fg-primary">{title}</div>
        <span
          className={`shrink-0 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full ${statusClasses[status]}`}
        >
          {statusLabel ?? labelMap[status]}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted">
        {meta.map((m, i) => (
          <div key={i}>
            {m.k && <span className="text-fg-muted">{m.k} </span>}
            <span className="font-mono text-fg-secondary">{m.v}</span>
          </div>
        ))}
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 bg-bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-amber-500" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function EcoRow({
  num,
  title,
  desc,
  href,
  active,
}: {
  num: string;
  title: string;
  desc: string;
  href?: string;
  active?: boolean;
}) {
  // Single-row layout inside the unified ecosystem container. No own
  // border (parent provides outer card); top divider on every row except
  // the first via `first:border-t-0`. Source `.ecoRow` SCSS uses 56px /
  // 1fr / auto grid with `border-top: 1px solid rgba(255,255,255,0.08)`.
  // Active row uses translucent-blue background `rgba(23,167,255,0.08)`
  // + the arrow morphs into a pill-shaped uppercase "You're here" badge
  // matching the home-page bridge container's design.
  const inner = (
    <div
      className="grid grid-cols-[56px_1fr_auto] gap-6 items-center px-7 py-6 first:border-t-0 transition-colors duration-(--duration-base) ease-(--ease-out)"
      style={{
        background: active ? 'rgba(23, 167, 255, 0.08)' : 'transparent',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="font-mono text-[0.9rem] font-semibold tracking-[0.06em] text-brand-blue-3">
        {num}
      </div>
      <div className="min-w-0">
        <div className="text-[1.1rem] font-bold text-white leading-tight mb-1">
          {title}
        </div>
        <div className="text-[0.9rem] text-white/65">{desc}</div>
      </div>
      <span
        className={
          active
            ? 'inline-flex items-center text-brand-blue-3 text-[10.5px] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-pill whitespace-nowrap'
            : 'font-mono text-[1.1rem] text-white/40 whitespace-nowrap transition-transform duration-(--duration-base) ease-(--ease-out)'
        }
        style={
          active ? { background: 'rgba(23, 167, 255, 0.14)' } : undefined
        }
      >
        {active ? "You're here" : '→'}
      </span>
    </div>
  );

  if (active || !href) {
    return inner;
  }
  return (
    <Link
      href={href}
      className="no-underline block hover:[&>div]:bg-white/[0.04] focus:outline-none focus-visible:[&>div]:bg-white/[0.04]"
    >
      {inner}
    </Link>
  );
}

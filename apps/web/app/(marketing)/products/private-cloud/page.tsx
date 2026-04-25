import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { MarketingButton } from '@/components/marketing/Button';

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
    'The NDI Data Browser is where your lab works. Upload sessions from MATLAB or Python, track sync status, publish datasets with a Crossref DOI.',
  alternates: { canonical: 'https://ndi-cloud.com/products/private-cloud' },
  openGraph: {
    type: 'website',
    url: 'https://ndi-cloud.com/products/private-cloud',
    title: 'NDI Data Browser — NDI Cloud',
    description:
      'Upload sessions from MATLAB or Python, track sync status, publish with a Crossref DOI.',
    images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    siteName: 'NDI Cloud',
  },
};

export default function PrivateCloudPage() {
  return (
    <main>
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
            The Data Browser is where your lab works. Upload sessions from your
            rig or analysis workstation, organize them into datasets, add
            openMINDS metadata, and publish your work with a Crossref-registered
            DOI — all backed by the open NDI data model.
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
                app.ndi-cloud.com / vanhooser-lab / datasets
              </div>
            </div>
            <Image
              src="/mockups/data-browser.png"
              alt="NDI Data Browser listing datasets across a lab workspace with filters by species, probe, and sync status"
              width={1140}
              height={700}
              priority
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
      <section className="px-7 py-20 bg-bg-surface">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            What it does
          </div>
          <h2 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            Browse, organize, and publish your lab&rsquo;s data.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
            The Data Browser is the control room for every dataset in your lab —
            from raw recording to published DOI.
          </p>

          <div className="grid grid-cols-2 max-[720px]:grid-cols-1 gap-5">
            <CapCard
              title="Dataset management"
              body="Upload sessions and files, organize them into datasets, track status across your lab. Search by species, probe, region, stimulus, or any metadata field — everything is queryable."
            />
            <CapCard
              title="openMINDS metadata"
              body={
                <>
                  Every session carries structured openMINDS metadata with real
                  ontology IDs: species (<code className="font-mono text-xs">NCBITaxon:10090</code>{' '}
                  · <code className="font-mono text-xs">M. musculus</code>), brain
                  region (<code className="font-mono text-xs">UBERON:0002436</code> · primary
                  visual cortex), strain, sex, stimulus. Search across your
                  whole lab&rsquo;s work in one query.
                </>
              }
            />
            <CapCard
              title="DOI publishing"
              body={
                <>
                  When your dataset is ready, publish it to the NDI Data Commons.
                  A Crossref-registered DOI (under the NDI{' '}
                  <code className="font-mono text-xs">10.63884</code> prefix) and a
                  public landing page are created so other researchers can cite
                  your work.
                </>
              }
            />
            <CapCard
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
      <section className="px-7 py-20 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            Workflow
          </div>
          <h2 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
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
              body="Choose a license (CC-BY, CC0), review the metadata, and publish. Your dataset gets a Crossref-registered DOI and a public landing page on the Data Commons."
            />
          </div>
        </div>
      </section>

      {/* SESSION DETAIL SPLIT — white per source `.section` (no explicit
          bg, page-bg-inherited white). Was bg-bg-canvas (cream) in the
          original port; cream → white restores the source's
          cream-workflow → white-session-detail visual rhythm. */}
      <section className="px-7 py-20 bg-bg-surface">
        <div className="max-w-[1100px] mx-auto grid grid-cols-2 max-[840px]:grid-cols-1 gap-12 items-start">
          <div>
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              Session detail
            </div>
            <h2 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
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
        className="px-7 py-20 text-white"
        style={{ background: 'var(--color-bg-depth)' }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3">
            Part of NDI Cloud
          </div>
          <h2 className="text-[2rem] font-bold tracking-tight leading-[1.2] mb-3 m-0">
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
        className="relative overflow-hidden px-7 py-20 text-white"
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
            Move your lab&rsquo;s data to NDI.
          </h2>
          <p className="text-base leading-relaxed text-white/75 mb-8 m-0">
            We&rsquo;ll help you upload your first sessions and publish your first
            dataset.
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

function CapCard({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-7 shadow-sm">
      <h3 className="text-[1.25rem] font-bold text-fg-primary leading-tight mb-3 m-0">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-fg-secondary m-0">{body}</p>
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
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-4 shadow-xs">
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

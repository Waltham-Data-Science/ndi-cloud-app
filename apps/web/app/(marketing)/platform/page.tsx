import type { Metadata } from 'next';

import { MarketingButton } from '@/components/marketing/Button';
import { commonsSearchUrl } from '@/lib/urls';

/**
 * /platform — "How NDI works" — most complex marketing page.
 *
 * Ported from ndi-web-app-wds/app/src/pages/platform/index.tsx (562
 * LOC source). Structure preserved verbatim: hero with trust stats →
 * three diagrams (How NDI Cloud works / Legacy vs NDI / Architecture)
 * → CTA band. The 5 inlined helper sub-components from the source
 * (NodePill, SvcChip, LegendItem, ScatterNodeLabel, ArchLayer) ported
 * here, just below the page export — same pattern, just with Tailwind
 * utility classes instead of SCSS Module classes.
 *
 * The Diagram-2 "scattered filesystems" visualization uses
 * absolute-positioned nodes + a free-form SVG mesh of dashed connector
 * paths per the source. The "messy" composition IS the rhetorical
 * point of the diagram — an earlier port simplified this to a flat
 * 3×2 grid which lost the visual intent. Restored to the source's
 * exact `top` / `left` / `transform: rotate()` values from
 * `Home.module.scss:879-966` (`SCATTER_NODES` table below). On very
 * narrow viewports (≤520px) the absolutes can't read against the
 * 300px container height, so they collapse to a 2-col fallback grid.
 *
 * Pure RSC. The "See the diagrams" link uses a plain `<a href="#how">`
 * anchor — no client-side smooth-scroll polyfill needed; modern
 * browsers honor scroll-behavior: smooth from globals.
 */
export const metadata: Metadata = {
  title: 'How NDI works',
  description:
    'How NDI Cloud is built: the data model, the storage, the apps, and the open standards behind them.',
  alternates: { canonical: 'https://ndi-cloud.com/platform' },
  openGraph: {
    type: 'website',
    url: 'https://ndi-cloud.com/platform',
    title: 'How NDI works — NDI Cloud',
    description:
      'Three ways of looking at the same machine: the data graph, the replacement for lab filesystems, and the four-layer architecture.',
    images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    siteName: 'NDI Cloud',
  },
};

export default function PlatformPage() {
  return (
    <main>
      {/* HERO */}
      <section
        className="relative overflow-hidden text-white px-7 pt-24 pb-20"
        style={{ background: 'var(--grad-depth)' }}
      >
        {/* atmosphere: subtle wordmark watermark + decorative trace */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: "url('/logos/ndicloud-mark-color.svg')",
            backgroundSize: '140px',
            backgroundRepeat: 'repeat',
          }}
        />
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none opacity-50"
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
        >
          <path
            d="M0 640 Q 200 635 300 640 L 400 640 L 412 570 L 420 720 L 432 640 L 460 640 L 560 640 L 572 580 L 580 700 L 592 640 L 700 640 Q 850 635 1000 640 L 1600 640"
            stroke="rgba(93,193,255,0.5)"
            strokeWidth="1"
            fill="none"
          />
          <path
            d="M0 420 Q 200 415 320 420 L 420 420 L 432 350 L 440 500 L 452 420 L 500 420 Q 640 415 780 420 L 860 420 L 872 360 L 880 480 L 892 420 L 1000 420 Q 1200 415 1600 420"
            stroke="var(--color-brand-blue-3)"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>

        <div className="relative max-w-[1100px] mx-auto">
          <div className="inline-flex items-center gap-2 text-xs font-bold tracking-eyebrow uppercase text-white/70 mb-5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3" />
            How NDI works
          </div>
          <h1
            className="font-display font-extrabold leading-[1.05] tracking-tight text-white mb-5 m-0 max-w-[900px]"
            style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)' }}
          >
            One data graph,{' '}
            <em className="not-italic text-brand-blue">three interfaces.</em>
          </h1>
          {/*
            2026-04-28 hero refresh. Pre-fix lede was "all read from
            the same NDI data model… because it's the same dataset,
            not three copies" — accurate but indirect, restated the
            "single graph" framing instead of giving the user a reason
            to care. New copy leads with the user outcome (one
            permission + provenance surface across public + private
            workspaces) so the platform page mirrors the homepage's
            concrete-affordance tone.
          */}
          <p className="text-[17px] leading-relaxed text-white/80 max-w-[720px] mb-8 m-0">
            The Commons, the Data Browser, and LabChat surface the same
            versioned dataset with the same permissions and provenance —
            so a finding stands up the same way whether it&rsquo;s in a
            paper, your workspace, or an AI answer.
          </p>
          {/* Hero CTA row standardised to `MarketingButton` lg. The
              previous inline `px-6 py-3 text-base` matched source `.btnPrimaryLg`
              shape; centralising on the primitive ensures home + platform
              hero CTAs render at the same height as the other lg
              About / Security / LabChat / Private Cloud CTAs. The trailing
              arrow SVG is dropped — `lg` doesn't carry a leading/trailing
              icon slot and the source's primary CTA on the platform hero
              used text only too. */}
          <div className="flex gap-4 items-center flex-wrap mb-12">
            <MarketingButton
              as="a"
              href={commonsSearchUrl()}
              variant="cta"
              size="lg"
            >
              Search the commons
            </MarketingButton>
            <a
              href="#how"
              className="text-sm font-semibold text-white/85 hover:text-white transition-colors no-underline"
            >
              See the diagrams <span aria-hidden>→</span>
            </a>
          </div>

          {/* Trust stats */}
          <div className="grid grid-cols-3 max-[720px]:grid-cols-1 gap-6 max-w-[900px]">
            <TrustMetric
              n="4"
              label="DAQ systems"
              sub="Intan · Blackrock · Spike2 · SpikeGadgets"
            />
            <TrustMetric
              n="13"
              label="Ontologies"
              sub="NCBITaxon · RRID · PubChem · OLS"
            />
            <TrustMetric
              n="SCR_023368"
              label="RRID · Citable tool"
              sub="MATLAB · Python · Web"
              numSmall
            />
          </div>
        </div>
      </section>

      {/* DIAGRAMS */}
      <section id="how" className="px-7 py-16 bg-bg-canvas">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-12">
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              The system
            </div>
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Three ways of looking{' '}
              <em className="not-italic text-ndi-teal">at the same machine.</em>
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary max-w-[720px] m-0">
              The data graph, the storage underneath it, and the architecture
              that serves it to the Commons, the Data Browser, and LabChat.
              Here&rsquo;s how each looks.
            </p>
          </div>

          {/* ── Diagram 1: How NDI Cloud works ── */}
          <DiagramCard num="01" tag="How NDI Cloud works">
            <h3 className="text-[1.5rem] font-bold text-fg-primary leading-tight mb-3 mt-1 m-0">
              Your data flows through one graph.
            </h3>
            <p className="text-base leading-relaxed text-fg-secondary mb-8 m-0">
              Raw sessions, analyses, and published datasets all flow
              through a single identity, permission layer, and provenance
              chain. Same data model from rig to citation.
            </p>

            {/* 3-column flow: Your lab → NDI Cloud → The world */}
            <div className="grid grid-cols-[1fr_24px_1.4fr_24px_1fr] max-[840px]:grid-cols-1 gap-3 items-center">
              {/* Your lab column */}
              <div className="flex flex-col gap-2">
                <ColHead>Your lab</ColHead>
                <NodePill color="teal" label="Acquisition rig" sub="NDI SDK · nwb, mat, csv" />
                <NodePill color="teal" label="Analysis workstation" sub="Python · MATLAB SDK" />
                <NodePill color="teal" label="Lab notebook" sub="markdown · protocols" />
              </div>
              <FlowArrow />
              {/* NDI Cloud center — restored to source `.d1Center`: white card
                  with 1.5px brand-navy border and a navy "NDI Cloud" pill
                  floating at top-center. Source SCSS:
                    .d1Center { background: white; border: 1.5px solid #002054;
                                border-radius: 18px; padding: 30px 24px 24px;
                                position: relative;
                                box-shadow: 0 16px 40px -14px rgba(0,32,84,0.22); }
                    .centerTag { position: absolute; top: -12px; left: 50%;
                                 transform: translateX(-50%);
                                 background: #002054; color: white;
                                 font-family: mono; font-size: 10px;
                                 letter-spacing: 0.14em; ... }
                  Was previously a dark gradient card with the title text inline
                  — lost the visual metaphor of "white card with NDI Cloud
                  floating overhead". SvcChip has also been refactored to a
                  light-surface default (gray-50 + brand-navy mono text) so
                  it renders correctly on the white card. */}
              <div
                className="relative bg-white border-[1.5px] border-brand-navy rounded-[18px] px-6 pt-[30px] pb-6"
                style={{ boxShadow: '0 16px 40px -14px rgba(0, 32, 84, 0.22)' }}
              >
                {/* Floating navy pill — absolutely positioned, sits on the
                    top edge of the card. Mono font + uppercase + 0.14em
                    tracking matches source `.centerTag`. */}
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-navy text-white font-mono font-bold uppercase whitespace-nowrap px-3.5 py-1 rounded-pill"
                  style={{ fontSize: '10px', letterSpacing: '0.14em' }}
                >
                  NDI Cloud
                </span>
                <div className="text-center text-[15px] font-extrabold text-brand-navy tracking-tight mb-3.5">
                  One data graph
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SvcChip color="navy" label="Object storage (S3)" />
                  <SvcChip label="Metadata graph" />
                  <SvcChip color="teal" label="Version control" />
                  <SvcChip color="teal" label="Access control" />
                  <SvcChip label="Compute API" />
                  <SvcChip color="cream" label="Crossref DOIs" />
                  <SvcChip label="Search index" />
                  <SvcChip label="LabChat RAG" />
                </div>
              </div>
              <FlowArrow />
              {/* The world column */}
              <div className="flex flex-col gap-2">
                <ColHead>The world</ColHead>
                <NodePill color="cream" label="Data Commons" sub="public search · DOIs" />
                <NodePill color="cream" label="Publications" sub="Crossref · citations" />
                <NodePill color="cream" label="Collaborators" sub="role-based · external" />
              </div>
            </div>

            <Legend>
              <LegendItem color="teal" label="Your lab (producers)" />
              <LegendItem color="blue" label="NDI services" />
              <LegendItem color="navy" label="Storage layer" />
              <LegendItem color="cream" label="Public / consumers" />
            </Legend>
          </DiagramCard>

          {/* ── Diagram 2: Legacy vs NDI ── */}
          <DiagramCard num="02" tag="Legacy vs NDI">
            <h3 className="text-[1.5rem] font-bold text-fg-primary leading-tight mb-3 mt-1 m-0">
              The difference, in one picture.
            </h3>
            <p className="text-base leading-relaxed text-fg-secondary mb-8 m-0">
              Most labs live on scattered external drives, shared folders,
              and personal laptops. NDI is a single store where every session
              is a permanent, citable, downloadable object — still resolvable
              next semester, next decade.
            </p>

            <div className="grid grid-cols-2 max-[840px]:grid-cols-1 gap-5">
              {/* Legacy side */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 relative overflow-hidden">
                <div className="mb-4">
                  <span className="inline-block text-[10px] font-bold tracking-wide uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full mb-2">
                    Before
                  </span>
                  <h4 className="text-lg font-bold text-fg-primary m-0">
                    Scattered filesystems
                  </h4>
                </div>
                <p className="text-sm leading-relaxed text-fg-secondary mb-6 m-0">
                  Files live on backup drives, lab servers, and personal
                  laptops. Nobody&rsquo;s sure which copy is canonical, and when
                  a drive dies or a student leaves, the data can go with them.
                </p>

                {/* Scatter visualization — 6 absolute-positioned, individually
                    rotated nodes connected by a free-form SVG mesh of dashed
                    paths. The "messy" composition IS the rhetorical point of
                    Diagram-2 (the audit's "reads the same as a flat 3×2
                    grid" framing was wrong). Source coordinates from
                    `Home.module.scss:879-966` (.mess / .messLines /
                    .messNode + .scatter1..6 individual rotations + offsets).
                    SVG path d-strings copied verbatim from
                    `pages/platform/index.tsx:233-244`. Hidden on very
                    narrow viewports (≤520px) since the absolutes need the
                    container's 300px height + ≥320px width to read; the
                    mobile fallback below stacks the same nodes 2-up. */}
                <div
                  aria-hidden
                  className="relative h-[300px] mb-6 max-[520px]:hidden"
                >
                  <svg
                    className="absolute inset-0 pointer-events-none w-full h-full"
                    viewBox="0 0 320 300"
                    preserveAspectRatio="none"
                  >
                    {/* Source `.messLines path`: stroke #c44848, width 1,
                        dasharray "2 3", opacity 0.35. */}
                    <g
                      stroke="#c44848"
                      strokeWidth="1"
                      fill="none"
                      strokeDasharray="2 3"
                      opacity="0.35"
                    >
                      <path d="M60 40 Q 180 80 240 55" />
                      <path d="M80 50 Q 150 140 240 130" />
                      <path d="M110 155 Q 180 130 280 130" />
                      <path d="M100 155 Q 80 190 140 225" />
                      <path d="M260 130 Q 210 170 275 230" />
                      <path d="M140 225 Q 200 245 280 235" />
                    </g>
                  </svg>
                  {SCATTER_NODES.map((n) => (
                    <ScatterNode
                      key={n.label}
                      label={n.label}
                      style={{
                        top: n.top,
                        left: n.left,
                        transform: `rotate(${n.rot}deg)`,
                      }}
                    />
                  ))}
                </div>
                {/* Mobile fallback — small-screen layout that still
                    communicates "scattered" without the absolute positions
                    that need height to read. */}
                <div className="hidden max-[520px]:grid grid-cols-2 gap-2 mb-6">
                  {SCATTER_NODES.map((n) => (
                    <ScatterNode key={n.label} label={n.label} />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-red-700 border-t border-red-200 pt-3">
                  <span>Data gets lost when drives fail or people leave</span>
                  <span>No DOI · No provenance</span>
                </div>
              </div>

              {/*
                NDI side. `min-h-[356px]` matches the Legacy panel's
                visual weight: that panel's scatter viz is 300px tall
                + p-6 padding (24px top + 24px bottom) + the ~16px
                footer row, so the right panel needs ~356px to read
                as paired-equal. Without this, the NDI side reads as
                an afterthought next to the bigger Legacy block.
              */}
              <div className="bg-ndi-teal-light border border-ndi-teal-border rounded-xl p-6 relative overflow-hidden min-h-[356px]">
                <div className="mb-4">
                  <span className="inline-block text-[10px] font-bold tracking-wide uppercase text-ndi-teal bg-white/60 px-2 py-0.5 rounded-full mb-2">
                    With NDI
                  </span>
                  <h4 className="text-lg font-bold text-fg-primary m-0">
                    One versioned graph
                  </h4>
                </div>
                <p className="text-sm leading-relaxed text-fg-secondary mb-6 m-0">
                  Every session is an addressable object you can pull up by ID,
                  cite in a paper, and share with collaborators.
                </p>

                {/* Branch tree — 3 branches off a central trunk */}
                <div className="relative pl-8 mb-6">
                  <div
                    aria-hidden
                    className="absolute left-2 top-0 bottom-0 w-[2px] bg-ndi-teal"
                  />
                  {[
                    { label: 'session_212', kv: '2.4 GB · QC ✓' },
                    {
                      label: 'cohort_feb24',
                      kv: '22 sessions · ',
                      kvV: 'Published',
                    },
                    {
                      label: 'DOI · 94a2f08',
                      kv: 'Crossref · ',
                      kvV: 'citable',
                      cream: true,
                    },
                  ].map((b) => (
                    <div
                      key={b.label}
                      className="relative mb-3 last:mb-0 flex items-center gap-3"
                    >
                      <div
                        aria-hidden
                        className="absolute -left-6 top-1/2 w-6 h-[2px] bg-ndi-teal"
                      />
                      <div
                        className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-mono font-semibold ${
                          b.cream
                            ? 'bg-brand-cream text-ndi-primary border border-brand-blue-3/30'
                            : 'bg-white text-fg-primary border border-ndi-teal-border'
                        }`}
                      >
                        {b.label}
                      </div>
                      <div className="text-xs text-fg-secondary">
                        {b.kv}
                        {b.kvV && (
                          <span className="font-semibold text-ndi-teal">{b.kvV}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-xs text-ndi-teal border-t border-ndi-teal-border pt-3">
                  <span>Backed up and versioned · permanent session IDs</span>
                  <span>Citable with a DOI</span>
                </div>
              </div>
            </div>
          </DiagramCard>

          {/* ── Diagram 3: Architecture ── */}
          <DiagramCard num="03" tag="Architecture">
            <h3 className="text-[1.5rem] font-bold text-fg-primary leading-tight mb-3 mt-1 m-0">
              Four layers, built on open standards.
            </h3>
            <p className="text-base leading-relaxed text-fg-secondary mb-8 m-0">
              NDI Cloud runs on the NDI data model — an open spec, not a
              closed product. Storage, the workspace apps, the Commons, and
              LabChat are all inspectable layers above it. The data model is
              the foundation; everything else is pluggable.
            </p>

            <div className="flex flex-col gap-2">
              <ArchLayer
                variant="surface"
                kick="Layer 04 · Public"
                title="Discovery surfaces"
                chips={[
                  'ndi-cloud.com/datasets',
                  'DOI landing pages',
                  'Crossref index',
                  'Google Scholar',
                ]}
                edgeStrong="Open, no login"
                edgeSub="HTTPS · JSON-LD"
              />
              <Connector />
              <ArchLayer
                variant="apps"
                kick="Layer 03 · Applications"
                title="Workspace apps"
                chips={['Data Browser', 'LabChat', 'Admin console']}
                edgeStrong="Shared SSO"
                edgeSub="Next.js · React"
              />
              <Connector />
              <ArchLayer
                variant="svc"
                kick="Layer 02 · Services"
                title="NDI Cloud services"
                chips={[
                  'Metadata API',
                  'Crossref DOI registration',
                  'LabChat RAG',
                  'Search index',
                  'Auth · KMS',
                ]}
                edgeStrong="REST + Python SDK"
                edgeSub="AWS · Cognito · MongoDB"
              />
              <Connector />
              <ArchLayer
                variant="core"
                kick="Layer 01 · Core"
                title="NDI data model"
                chips={[
                  'Session graph',
                  'Branches & history',
                  'openMINDS metadata',
                  'Object storage',
                ]}
                edgeStrong="Open spec"
                edgeSub="S3 · Parquet · RDF"
              />
            </div>

            <Legend>
              <LegendItem color="cream" label="Public surfaces (no login)" />
              <LegendItem color="blue" label="Authenticated apps" />
              <LegendItem color="teal" label="Backend services" />
              <LegendItem color="navy" label="Core data model (open)" />
            </Legend>
          </DiagramCard>
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
          <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3">
            Get started
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight leading-[1.2] mb-3 m-0">
            Evaluating NDI for your lab?
          </h2>
          <p className="text-base leading-relaxed text-white/80 mb-8 m-0">
            We&rsquo;ll walk you through the architecture, answer questions on
            storage, security, or SDK fit, and — if it&rsquo;s a match — help
            you get your first sessions uploaded.
          </p>
          <div className="flex gap-4 justify-center items-center flex-wrap">
            <MarketingButton
              as="a"
              href="/create-account"
              variant="cta"
              size="lg"
            >
              Create Account
            </MarketingButton>
            <a
              href="mailto:info@walthamdatascience.com"
              className="text-sm font-semibold text-white/85 hover:text-white transition-colors no-underline"
            >
              Talk to Us <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

/* ─────────── helper sub-components (inlined, no separate files) ─────────── */

function TrustMetric({
  n,
  label,
  sub,
  numSmall,
}: {
  n: string;
  label: string;
  sub: string;
  numSmall?: boolean;
}) {
  return (
    <div>
      <div
        className={`font-display font-extrabold text-brand-blue-3 leading-none mb-2 ${
          numSmall ? 'text-2xl tracking-tight font-mono' : 'text-5xl'
        }`}
      >
        {n}
      </div>
      <div className="text-sm font-semibold text-white mb-1">{label}</div>
      <div className="text-xs text-white/60">{sub}</div>
    </div>
  );
}

function DiagramCard({
  num,
  tag,
  children,
}: {
  num: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    // Shared team-card hover pattern. Resting shadow is `shadow-md`
    // (matches the visual weight of these step cards), so the hover
    // lifts to `shadow-lg` for proportional emphasis.
    <div className="bg-bg-surface border border-border-subtle rounded-2xl p-8 max-[640px]:p-5 shadow-md mb-10 last:mb-0 transition-all duration-(--duration-base) ease-(--ease-out) hover:border-ndi-teal-border hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-ndi-teal-light text-ndi-teal font-display font-bold text-base">
          {num}
        </span>
        <span className="text-xs font-bold tracking-eyebrow uppercase text-fg-muted">
          {tag}
        </span>
      </div>
      {children}
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold tracking-eyebrow uppercase text-fg-muted mb-1">
      {children}
    </div>
  );
}

function NodePill({
  color,
  label,
  sub,
}: {
  color?: 'teal' | 'cream' | 'navy' | 'blue';
  label: string;
  sub: string;
}) {
  const palette: Record<string, string> = {
    teal: 'bg-ndi-teal-light border-ndi-teal-border text-fg-primary',
    cream: 'bg-brand-cream border-brand-blue-3/30 text-fg-primary',
    navy: 'bg-brand-navy border-brand-navy text-white',
    blue: 'bg-brand-blue-3/15 border-brand-blue-3/30 text-fg-primary',
  };
  const cls = palette[color ?? 'blue'];
  return (
    <div className={`border rounded-lg px-3 py-2 ${cls}`}>
      <div className="flex items-center gap-2">
        <span className="opacity-70" aria-hidden>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <rect x="2" y="3" width="12" height="9" rx="1" />
            <path d="M5 12v2h6v-2M7 6h5M7 9h3" />
          </svg>
        </span>
        <div className="text-sm font-semibold">{label}</div>
      </div>
      <div className="text-[11px] opacity-70 mt-0.5 ml-[22px]">{sub}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      className="flex items-center justify-center text-brand-blue-3 max-[840px]:rotate-90 max-[840px]:my-2"
      aria-hidden
    >
      <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
        <path
          d="M0 7 H17 M12 2 L17 7 L12 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

function SvcChip({
  color,
  label,
}: {
  color?: 'teal' | 'navy' | 'cream' | 'blue';
  label: string;
}) {
  // 2026-04-28: cream dot was invisible against the SvcChip's
  // `bg-gray-50` chip surface (both near-white). The other cream-keyed
  // surfaces in this file (`NodePill` line 630, `LegendItem` line 720)
  // already pair `bg-brand-cream` with `border-brand-blue-3/30`-ish
  // outlines for the same reason. Mirroring that pattern here so the
  // "Crossref DOIs" chip's dot reads as a real visual cue rather than
  // a missing element. Other dot colors (teal/navy/blue) are saturated
  // enough on gray-50 not to need the ring.
  const dot: Record<string, string> = {
    teal: 'bg-ndi-teal',
    navy: 'bg-brand-navy',
    cream: 'bg-brand-cream ring-1 ring-brand-blue-3/50',
    blue: 'bg-brand-blue-3',
  };
  const dotCls = dot[color ?? 'blue'];
  /*
   * Light-surface chip: gray-50 bg, gray-200 border, brand-navy mono text.
   * Source `.svc { background: $gray-50; border: 1px solid $gray-200;
   * font-family: mono; font-size: 11px; color: $ndi-primary-blue }`.
   * The Diagram-1 d1Center card is now a white surface (per source
   * `.d1Center`), so the chips inside need dark-on-light styling rather
   * than the previous white/8 + white/90 dark-card variant.
   */
  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 font-mono text-[11px] text-brand-navy">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotCls}`} aria-hidden />
      {label}
    </div>
  );
}

function LegendItem({
  color,
  label,
}: {
  color: 'teal' | 'blue' | 'navy' | 'cream' | 'red';
  label: string;
}) {
  const sw: Record<string, string> = {
    teal: 'bg-ndi-teal',
    blue: 'bg-brand-blue-3',
    navy: 'bg-brand-navy',
    cream: 'bg-brand-cream border border-brand-blue-3/40',
    red: 'bg-red-400',
  };
  return (
    <div className="flex items-center gap-2 text-xs text-fg-secondary">
      <span
        className={`inline-block w-3 h-3 rounded-sm ${sw[color]}`}
        aria-hidden
      />
      {label}
    </div>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6 pt-5 border-t border-border-subtle">
      {children}
    </div>
  );
}

/**
 * Source coordinates for the 6 scatter nodes (Diagram-2 messy
 * filesystems). Verbatim from `Home.module.scss:911-940` (.scatter1
 * through .scatter6) — the asymmetric layout + per-node rotations are
 * the "messy" rhetorical signal of the diagram. Top/left strings carry
 * `px` for direct application via inline `style`.
 */
const SCATTER_NODES: ReadonlyArray<{
  label: string;
  top: string;
  left: string;
  rot: number;
}> = [
  { label: 'Drive-1', top: '10px', left: '6px', rot: -4 },
  { label: 'rig2-ssd', top: '36px', left: '178px', rot: 3 },
  { label: 'Box folder', top: '120px', left: '28px', rot: 2 },
  { label: 'lab-server', top: '108px', left: '220px', rot: -5 },
  { label: 'grad-laptop', top: '204px', left: '80px', rot: 1 },
  { label: 'Email attach.', top: '210px', left: '240px', rot: -2 },
];

/**
 * `.messNode` per source `Home.module.scss:899-909` — translucent
 * pink fill, red-tinted border, rounded 10px, min-width 110px,
 * pink-foreground label. The optional `style` prop provides the
 * absolute `top`/`left`/`transform` overrides used in the scatter
 * container; without it, the node renders inline (used by the mobile
 * fallback grid).
 */
function ScatterNode({
  label,
  style,
}: {
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-[10px] px-3 py-[9px] min-w-[110px]"
      style={{
        background: '#fbeded',
        border: '1.5px solid #e9b8b8',
        position: style ? 'absolute' : 'relative',
        ...style,
      }}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-[5px] text-white shrink-0"
        style={{ background: '#c44848' }}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="10" height="8" rx="1" />
          <path d="M3 7h10" />
        </svg>
      </span>
      <span
        className="font-mono font-bold text-[12px] whitespace-nowrap"
        style={{ color: '#8f2e2e' }}
      >
        {label}
      </span>
    </div>
  );
}

function Connector() {
  return (
    <div
      aria-hidden
      className="self-center w-px h-4 bg-gradient-to-b from-border-subtle to-border-strong"
    />
  );
}

function ArchLayer({
  variant,
  kick,
  title,
  chips,
  edgeStrong,
  edgeSub,
}: {
  variant: 'surface' | 'apps' | 'svc' | 'core';
  kick: string;
  title: string;
  chips: string[];
  edgeStrong: string;
  edgeSub: string;
}) {
  /*
   * Source `Home.module.scss:1169-1203` uses
   * `background: linear-gradient(90deg, color 0%, white 70%)` per variant
   * — soft tint that fades to white on the right, creating a subtle
   * "light from the left" depth feel. Target previously shipped flat
   * solid colors. Restoring the gradient via inline `style` since
   * Tailwind doesn't have a clean utility for "this exact 0%-70% stop".
   *
   * Note that `core` is also a white-fading layer in the source (the
   * tint is `rgba(0,32,84,0.05)`), not a solid navy band — the previous
   * target solid `bg-brand-navy` + white text broke the rhythm. Now all
   * four layers share the same "tint → white" pattern so the row
   * stack reads as one continuous architectural diagram.
   */
  const gradient: Record<typeof variant, string> = {
    surface: 'linear-gradient(90deg, #faf4e6 0%, #ffffff 70%)',
    apps: 'linear-gradient(90deg, rgba(23, 167, 255, 0.06) 0%, #ffffff 70%)',
    svc: 'linear-gradient(90deg, var(--color-ndi-teal-light) 0%, #ffffff 70%)',
    core: 'linear-gradient(90deg, rgba(0, 32, 84, 0.05) 0%, #ffffff 70%)',
  };
  const palette: Record<typeof variant, string> = {
    surface: 'border-brand-blue-3/30 text-fg-primary',
    apps: 'border-brand-blue-3/30 text-fg-primary',
    svc: 'border-ndi-teal-border text-fg-primary',
    core: 'border-brand-navy/22 text-fg-primary',
  };
  return (
    // 2026-04-28 (round 2) — hover refresh. PR #110 restored the
    // source `.d3Layer` 4px-translateX nudge as the hover affordance,
    // matching the legacy SCSS exactly. User feedback on visual review
    // was that the nudge alone reads as too subtle — the architecture
    // layers should match the team-card / FAIR-tile reactivity pattern
    // (border tint + shadow lift) so they feel like equally "alive"
    // surfaces. We layer the FAIR pattern on top: keep the directional
    // translateX (preserves the input→output flow hint), add the
    // teal border + shadow lift the other marketing cards use. Custom
    // cubic-bezier preserved so motion language stays distinct from
    // the more standard --ease-out curve elsewhere.
    <div
      className={`border rounded-xl p-5 grid grid-cols-[180px_1fr_180px] max-[840px]:grid-cols-1 gap-4 items-center transition-all duration-200 hover:translate-x-1 hover:border-ndi-teal-border hover:shadow-md ${palette[variant]}`}
      style={{
        background: gradient[variant],
        transitionTimingFunction: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      }}
    >
      <div>
        <div className="text-[10px] font-bold tracking-eyebrow uppercase opacity-70 mb-1">
          {kick}
        </div>
        <div className="text-base font-bold leading-tight">{title}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-white text-fg-secondary"
          >
            <span className="inline-block w-1 h-1 rounded-full bg-current opacity-50" aria-hidden />
            {c}
          </span>
        ))}
      </div>
      <div className="text-right max-[840px]:text-left">
        <div className="text-xs font-bold leading-tight">{edgeStrong}</div>
        <div className="text-[11px] mt-0.5 text-fg-muted">{edgeSub}</div>
      </div>
    </div>
  );
}

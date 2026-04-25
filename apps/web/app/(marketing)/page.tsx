import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { commonsSearchUrl } from '@/lib/urls';
import { HomeSearchForm } from './home-search-form';

/**
 * / — NDI Cloud home page (NDI Data Commons landing).
 *
 * Ported from ndi-web-app-wds/app/src/pages/index.tsx — the most-trafficked
 * page. Pure RSC except for the inline search form (HomeSearchForm,
 * client component) which captures the input + navigates on submit.
 *
 * Sections (top → bottom):
 *   1. Hero — depth gradient + eyebrow + display heading + lede +
 *      inline search form + secondary CTA
 *   2. Institution marquee — animated logo strip (CSS keyframe loop)
 *   3. FAIR — F/A/I/R grid of 4 tiles
 *   4. DOI band — split layout: explanation + sample dataset card
 *   5. Who uses it — 3 audience cells
 *   6. Platform bridge — three product rows (Commons "you're here",
 *      Data Browser, LabChat)
 *   7. CTA band — gradient + Create Account / Browse Commons buttons
 *
 * JSON-LD structured data preserved verbatim from the source repo: the
 * Organization + WebSite/SearchAction schemas drive Crossref + Google
 * site-search-result rendering. The SearchAction `target` is now
 * same-origin (`/datasets?q={search_term_string}`) since the data
 * browser is part of this monorepo.
 */
export const metadata: Metadata = {
  title: {
    absolute: 'NDI Data Commons — Neuroscience datasets, discoverable',
  },
  description:
    'A public, FAIR-compliant search across every dataset published on NDI Cloud. Filter by species, region, probe, year. Every entry carries a Crossref DOI and OpenMINDS metadata.',
  alternates: { canonical: 'https://ndi-cloud.com' },
  openGraph: {
    type: 'website',
    url: 'https://ndi-cloud.com/',
    title: 'NDI Data Commons — Neuroscience datasets, discoverable',
    description:
      'A public, FAIR-compliant search across every dataset published on NDI Cloud. Every entry carries a Crossref DOI and OpenMINDS metadata.',
    images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    siteName: 'NDI Cloud',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NDI Data Commons — Neuroscience datasets, discoverable',
    description:
      'A public, FAIR-compliant search across every dataset published on NDI Cloud.',
    images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'NDI Cloud',
      legalName: 'Waltham Data Science LLC',
      url: 'https://ndi-cloud.com',
      logo: 'https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg',
      description:
        'NDI Cloud is a neuroscience data platform for storing, standardizing, and publishing lab recordings.',
      foundingDate: '2022',
      sameAs: [
        'https://github.com/VH-Lab',
        'https://www.linkedin.com/company/waltham-data-science',
      ],
    },
    {
      '@type': 'WebSite',
      name: 'NDI Cloud',
      url: 'https://ndi-cloud.com',
      potentialAction: {
        '@type': 'SearchAction',
        // Same-origin post-unification — no more cross-domain SearchAction.
        target: 'https://ndi-cloud.com/datasets?q={search_term_string}',
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

const institutionLogos = [
  { src: '/JHU_logov2.png', alt: 'Johns Hopkins University' },
  { src: '/brandeis_logoV2.png', alt: 'Brandeis University' },
  { src: '/UCSD_logoV2.png', alt: 'UC San Diego' },
  { src: '/mathworks_logo.v2.webp', alt: 'MathWorks' },
  { src: '/Tufts_logo.png', alt: 'Tufts University' },
  { src: '/salk_logo.png', alt: 'Salk Institute' },
] as const;

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD structured data is non-executable; the dangerouslySetInnerHTML
        // is the standard pattern for emitting it as a script tag with type
        // "application/ld+json". The content is a JSON.stringify of a plain
        // object literal — no user input, no XSS risk.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>
        {/* HERO */}
        <section
          className="relative overflow-hidden text-white px-7 pt-24 pb-16"
          style={{ background: 'var(--grad-depth)' }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: "url('/logos/ndicloud-mark-color.svg')",
              backgroundSize: '140px',
              backgroundRepeat: 'repeat',
            }}
          />
          <div className="relative max-w-[1200px] mx-auto text-center">
            <div className="inline-flex items-center gap-2 text-xs font-bold tracking-eyebrow uppercase text-white/70 mb-5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3" />
              NDI Data Commons · Open access
            </div>
            <h1
              className="font-display font-extrabold leading-[1.05] tracking-tight text-white mb-5 m-0"
              style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)' }}
            >
              Neuroscience datasets,{' '}
              <em className="not-italic text-brand-blue-3">discoverable.</em>
            </h1>
            <p className="text-[17px] leading-relaxed text-white/80 max-w-[760px] mx-auto mb-8 m-0">
              A public, FAIR-compliant search across every dataset published on
              NDI Cloud. Filter by species, region, probe, year. Every entry
              carries a Crossref-registered DOI and openMINDS metadata.
            </p>

            <HomeSearchForm />

            <div className="mt-6">
              <Link
                href={commonsSearchUrl()}
                className="inline-flex items-center gap-1 text-sm font-semibold text-white/85 hover:text-white transition-colors no-underline"
              >
                Browse by topic →
              </Link>
            </div>
          </div>
        </section>

        {/* INSTITUTION MARQUEE */}
        <section
          aria-label="Trusted institutions"
          className="px-7 py-10 bg-bg-surface overflow-hidden"
        >
          <p className="text-xs font-bold tracking-eyebrow uppercase text-fg-muted text-center mb-6 m-0">
            Trusted by leading research institutions
          </p>
          <div className="relative w-full overflow-hidden">
            <div className="flex gap-12 whitespace-nowrap animate-[marquee_40s_linear_infinite] hover:[animation-play-state:paused] items-center">
              {[...institutionLogos, ...institutionLogos].map((logo, i) => (
                <Image
                  key={i}
                  src={logo.src}
                  alt={i < institutionLogos.length ? logo.alt : ''}
                  aria-hidden={i >= institutionLogos.length || undefined}
                  width={140}
                  height={40}
                  style={{ objectFit: 'contain', height: 40, width: 'auto' }}
                  className="grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-(--duration-base)"
                />
              ))}
            </div>
          </div>
          <style>{`
            @keyframes marquee {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </section>

        {/* FAIR */}
        <section className="px-7 py-20 bg-bg-canvas">
          <div className="max-w-[1100px] mx-auto">
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              FAIR by default
            </div>
            <h2 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Findable, Accessible, Interoperable, Reusable.
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-12 m-0">
              Every dataset on NDI Commons satisfies all four FAIR principles —
              not compliance work we layer on top, but the way NDI is built.
            </p>

            <div className="grid grid-cols-4 max-[840px]:grid-cols-2 max-[480px]:grid-cols-1 gap-5">
              <FairTile letter="F" title="Findable">
                Crossref-registered DOI plus openMINDS metadata on every published
                dataset — indexed by major search engines.
              </FairTile>
              <FairTile letter="A" title="Accessible">
                Open HTTP + NDI Python API. No login for public datasets;
                rate-limited fairly.
              </FairTile>
              <FairTile letter="I" title="Interoperable">
                openMINDS metadata with real ontology IDs (NCBI Taxonomy, UBERON,
                PATO, WBStrain) for species, region, strain, and sex. Read
                directly from NDI-MATLAB or NDI-Python — no format conversion
                needed.
              </FairTile>
              <FairTile letter="R" title="Reusable">
                CC-BY / CC0 license per release. Full provenance chain from raw
                session to cohort.
              </FairTile>
            </div>
          </div>
        </section>

        {/* DOI BAND */}
        <section className="px-7 py-20 bg-bg-surface">
          <div className="max-w-[1100px] mx-auto grid grid-cols-2 max-[840px]:grid-cols-1 gap-12 items-start">
            <div>
              <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
                Every dataset cites cleanly
              </div>
              <h2 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
                A DOI, a landing page, and a citation — always.
              </h2>
              <p className="text-base leading-relaxed text-fg-secondary mb-5 m-0">
                Published datasets get a Crossref-registered DOI under the NDI
                Cloud <code className="font-mono text-sm">10.63884</code> prefix.
                The DOI resolves to a permanent landing page with full metadata,
                BibTeX, and a stable download.
              </p>
              <p className="text-sm font-mono text-ndi-teal m-0">
                → <span className="underline">doi.org/10.48324/ndi.ds.94a2f08</span>
              </p>
            </div>

            {/* Sample dataset card */}
            <div className="bg-bg-canvas border border-border-subtle rounded-xl p-6 shadow-md">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase text-green-700 mb-3">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                Published
              </span>
              <div className="text-base font-bold text-fg-primary mb-1">
                V1 whole-cell recordings during drifting gratings
              </div>
              <div className="text-sm text-fg-muted mb-4">
                Van Hooser Lab · Brandeis University
              </div>

              <DoiField k="DOI" v="10.48324/ndi.ds.94a2f08" />
              <DoiField k="Species" v="M. musculus · V1" />
              <DoiField k="Sessions" v="128 · 2.4 GB" />
              <DoiField k="License" v="CC-BY 4.0" />

              <div className="mt-4 pt-4 border-t border-border-subtle text-xs leading-relaxed text-fg-secondary italic">
                Van Hooser, S. et al. (2024). V1 whole-cell recordings during
                drifting gratings [Data set]. NDI Cloud.
                doi:10.48324/ndi.ds.94a2f08
              </div>
            </div>
          </div>
        </section>

        {/* WHO USES IT */}
        <section className="px-7 py-20 bg-bg-canvas">
          <div className="max-w-[1100px] mx-auto">
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              Who uses it
            </div>
            <h2 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Open to anyone. No login required.
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
              Browse, search, cite, and download without creating an account.
              Labs who publish get download counts and citation links back in
              their Data Browser.
            </p>

            <div className="grid grid-cols-3 max-[840px]:grid-cols-1 gap-5">
              <ProvCell
                kicker="For readers"
                title="Search and download"
                body="Faceted search over species, region, probe, year. Direct download or browse via the NDI Python API."
              />
              <ProvCell
                kicker="For reviewers"
                title="Cite in papers"
                body="BibTeX/RIS export on every landing page. DOIs resolve immediately — your references don't rot."
              />
              <ProvCell
                kicker="For labs"
                title="Get discovered"
                body="Published datasets are indexed by Crossref and appear in search results — your work shows up where researchers are already looking."
              />
            </div>
          </div>
        </section>

        {/* PLATFORM BRIDGE */}
        <section className="px-7 py-20 bg-bg-surface">
          <div className="max-w-[1100px] mx-auto">
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              One data model
            </div>
            <h2 className="text-[2rem] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Three tools. One graph.
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
              The Commons is the public face. NDI Cloud also includes a private
              workspace for your lab&rsquo;s data and an AI assistant that
              answers from your own papers and datasets.
            </p>

            <div className="flex flex-col gap-3">
              <BridgeRow
                num="01"
                title="NDI Data Commons"
                desc="Public search across every published NDI dataset. DOI landing pages, openMINDS metadata, NIH DMSP ready."
                active
              />
              <BridgeRow
                num="02"
                title="NDI Data Browser"
                desc="The private workspace for your lab. Upload sessions from MATLAB or Python, track sync status, publish with a Crossref DOI."
                href="/products/private-cloud"
              />
              <BridgeRow
                num="03"
                title="LabChat"
                desc="An AI assistant that answers from your lab's papers, protocols, and datasets. Every answer cites its sources."
                href="/products/labchat"
              />
            </div>
            <p className="mt-6 text-sm text-fg-muted m-0">
              See the full architecture →{' '}
              <Link
                href="/platform"
                className="text-ndi-teal hover:text-ndi-primary transition-colors"
              >
                How NDI works
              </Link>
            </p>
          </div>
        </section>

        {/* CTA BAND */}
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
            <h2 className="text-[2rem] font-bold tracking-tight leading-[1.2] mb-3 m-0">
              Publish once. Get cited.
            </h2>
            <p className="text-base leading-relaxed text-white/80 mb-8 m-0">
              Labs on NDI Cloud can publish a dataset, get a DOI, and start
              collecting citations — all from one workspace.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link
                href="/create-account"
                className="inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-pill text-base px-6 py-2.5 bg-ndi-teal text-white shadow-cta hover:-translate-y-px transition-transform duration-(--duration-base) ease-(--ease-out) no-underline"
              >
                Create Free Account
              </Link>
              <Link
                href={commonsSearchUrl()}
                className="inline-flex items-center justify-center font-semibold whitespace-nowrap rounded-pill text-base px-6 py-2.5 bg-transparent text-white border border-white/30 hover:bg-white/10 transition-colors duration-(--duration-base) ease-(--ease-out) no-underline"
              >
                Browse the Commons
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

function FairTile({
  letter,
  title,
  children,
}: {
  letter: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm">
      <div
        className="font-display font-extrabold text-3xl text-ndi-teal mb-2 leading-none"
        aria-hidden
      >
        {letter}
      </div>
      <h4 className="text-base font-bold text-fg-primary mb-2 m-0">{title}</h4>
      <p className="text-sm leading-relaxed text-fg-secondary m-0">{children}</p>
    </div>
  );
}

function DoiField({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 py-1.5 text-sm border-b border-border-subtle/50 last:border-b-0">
      <div className="text-xs font-bold tracking-wide uppercase text-fg-muted self-center">{k}</div>
      <div className="text-fg-primary font-mono text-xs self-center break-all">{v}</div>
    </div>
  );
}

function ProvCell({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm">
      <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-2">
        {kicker}
      </div>
      <h4 className="text-base font-bold text-fg-primary mb-2 m-0">{title}</h4>
      <p className="text-sm leading-relaxed text-fg-secondary m-0">{body}</p>
    </div>
  );
}

function BridgeRow({
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
  const inner = (
    <div
      className={`flex items-center gap-5 p-5 rounded-lg border transition-colors duration-(--duration-base) ease-(--ease-out) ${
        active
          ? 'bg-ndi-teal-light border-ndi-teal-border'
          : 'bg-bg-canvas border-border-subtle hover:bg-bg-muted'
      }`}
    >
      <div
        className={`font-display font-bold text-2xl shrink-0 w-12 ${active ? 'text-ndi-teal' : 'text-fg-muted'}`}
      >
        {num}
      </div>
      <div className="flex-1">
        <div className="text-base font-semibold text-fg-primary mb-0.5">{title}</div>
        <div className="text-sm text-fg-secondary">{desc}</div>
      </div>
      <span
        className={`text-sm font-semibold shrink-0 ${active ? 'text-ndi-teal' : 'text-fg-muted'}`}
      >
        {active ? "You're here" : '→'}
      </span>
    </div>
  );

  if (active || !href) return inner;
  return (
    <Link href={href} className="no-underline">
      {inner}
    </Link>
  );
}

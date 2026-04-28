import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { MarketingButton } from '@/components/marketing/Button';
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
        {/* `pb-9` (36px) per source `HomeCommons.module.scss` hero
            `padding: 80px 28px 36px`. The previous `pb-16` (64px) opened
            the "giant empty dark gap" the source SCSS comment explicitly
            warned against — bottom padding tight on purpose so the
            institution marquee reads as a continuation of the hero, not a
            disconnected band. */}
        <section
          className="relative overflow-hidden text-white px-7 pt-24 pb-9"
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
            {/* Hero eyebrow: pill on tinted-blue bg + halo dot. Ported from
                source `.eyebrow` SCSS: letter-spacing 0.16em (denser than the
                global --tracking-eyebrow which is calibrated for the smaller
                section sub-eyebrows), 11px font, brand-blue-3 text on a
                rgba(23,167,255,0.12) pill. The `.dot` carries a 3px halo via
                box-shadow with a softer alpha — restores the "glowing
                indicator" affordance the audit flagged as missing. */}
            <div
              className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-brand-blue-3 mb-5 px-3.5 py-1.5 rounded-pill"
              style={{ background: 'rgba(23, 167, 255, 0.12)' }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3"
                style={{ boxShadow: '0 0 0 3px rgba(93, 193, 255, 0.25)' }}
              />
              NDI Data Commons · Open access
            </div>
            <h1
              className="font-display font-extrabold leading-[1.05] tracking-tight text-white mb-5 m-0"
              style={{ fontSize: 'clamp(2.25rem, 6vw, 4rem)' }}
            >
              Neuroscience datasets,{' '}
              <em className="not-italic text-brand-blue">discoverable.</em>
            </h1>
            {/* Hero lede — 19px / 1.55 per source `HomeCommons.module.scss .lede`.
                Was 17px in the previous port; bumped 2px to match source.
                The `leading-relaxed` (~1.625) is close enough to source 1.55
                to be visually identical inside this clamp range.

                2026-04-28 — copy refresh. Pre-fix lede framed the Commons
                as a search engine ("a public FAIR-compliant search…");
                user feedback was that the search angle was already
                conveyed by the form below, and the lede should instead
                describe what the Commons actually IS — the publishing
                and discovery layer underneath. New copy keeps the
                concrete affordances (DOI, openMINDS, ontology filters,
                no login) but leads with the infrastructure-and-
                publishing framing. */}
            <p className="text-[19px] leading-relaxed text-white/80 max-w-[760px] mx-auto mb-8 m-0">
              The data infrastructure for FAIR neuroscience publishing —
              every dataset carries a Crossref DOI, openMINDS metadata, and
              ontology-grade species, region, and probe filters. Public
              access, no login.
            </p>

            <HomeSearchForm />

            {/* Secondary CTA — restored to a bordered button per source
                `.btnSecondaryLg` (transparent, white/25 border, padding
                12px 26px, font-size 15px). Was previously reduced to a
                plain text link, which lost the button affordance below
                the inline search form. `ghost` variant carries the
                transparent + white/20 border combination; `md` size keeps
                the secondary CTA visually subordinate to the larger
                primary CTAs in the band below. */}
            <div className="mt-6">
              <MarketingButton
                as="a"
                href={commonsSearchUrl()}
                variant="ghost"
                size="md"
              >
                Browse by topic →
              </MarketingButton>
            </div>
          </div>
        </section>

        {/* INSTITUTION ROW
             Static centered row — replaces the previous infinite-scroll
             marquee. With only 6 unique logos, the doubled marquee track
             was always shorter than the viewport, so at any given scroll
             position the same logo appeared twice on screen (most
             visible: the duplicated UC San Diego at both ends of the
             doubled set). Static row sidesteps that, costs zero JS, zero
             animation repaints, and removes a moving distractor competing
             with the headline + CTA. Industry-standard pattern (Stripe,
             Vercel, Linear, Anthropic) for "trusted by" rows.
             Responsive collapse: 6-across desktop → 3×2 tablet → 2×3
             mobile. */}
        <section
          aria-label="Trusted institutions"
          className="px-7 py-10 bg-bg-surface"
        >
          <p className="text-xs font-bold tracking-eyebrow uppercase text-fg-muted text-center mb-6 m-0">
            Trusted by leading research institutions
          </p>
          <ul className="mx-auto max-w-[1100px] grid grid-cols-6 max-[840px]:grid-cols-3 max-[480px]:grid-cols-2 items-center justify-items-center gap-x-8 gap-y-6 list-none p-0 m-0">
            {institutionLogos.map((logo) => (
              <li key={logo.src} className="flex items-center justify-center">
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={140}
                  height={40}
                  style={{ objectFit: 'contain', height: 40, width: 'auto' }}
                  className="grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-(--duration-base)"
                />
              </li>
            ))}
          </ul>
        </section>

        {/* FAIR — white section per source `.commonsMain { background: var(--white) }`.
             The site body bg is cream (--color-bg-canvas) so this section has
             to opt in to white explicitly. Audit found the original target
             read as cream because the section bg was set to cream too. */}
        <section className="px-7 py-16 bg-bg-surface">
          <div className="max-w-[1100px] mx-auto">
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              FAIR by default
            </div>
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Findable, Accessible, Interoperable, Reusable.
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-12 m-0">
              Every dataset on NDI Commons is FAIR by construction — not because
              we added a compliance layer, but because the data model was built
              that way.
            </p>

            <div className="grid grid-cols-4 max-[840px]:grid-cols-2 max-[480px]:grid-cols-1 gap-5">
              <FairTile letter="F" title="Findable">
                A Crossref DOI and openMINDS metadata on every published dataset.
                Indexed where researchers already search.
              </FairTile>
              <FairTile letter="A" title="Accessible">
                Public datasets download over plain HTTP or through the NDI
                Python API. No login. Rate limits are generous.
              </FairTile>
              <FairTile
                letter="I"
                title="Interoperable"
                chips={['NCBITaxon', 'UBERON', 'PATO', 'WBStrain']}
              >
                Real ontology IDs for species, region, strain, and sex — not
                free-text. Read straight into NDI-MATLAB or NDI-Python without
                conversion.
              </FairTile>
              <FairTile letter="R" title="Reusable">
                CC-BY or CC0 on every release. Full provenance from raw session
                to cohort — no broken links, no detached files.
              </FairTile>
            </div>
          </div>
        </section>

        {/* DOI BAND — cream section, white card. Inverted from the previous
             port (white section, cream card) to match source
             `.doiBand { background: var(--brand-cream) }` + `.doiCard` defaulting
             to white card surface. Source structure: cream wash sets the band
             apart from the white FAIR section above and the white Who-Uses-It
             section below; the white card reads as a "sample DOI landing
             page" excerpt floating on the cream wash. */}
        <section className="px-7 py-16 bg-bg-canvas">
          <div className="max-w-[1100px] mx-auto grid grid-cols-2 max-[840px]:grid-cols-1 gap-12 items-start">
            <div>
              <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
                Every dataset cites cleanly
              </div>
              <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
                A DOI, a landing page, a citation. Same as a journal.
              </h2>
              <p className="text-base leading-relaxed text-fg-secondary mb-5 m-0">
                When you publish, you get a Crossref DOI under the NDI Cloud
                prefix <code className="font-mono text-sm">10.63884</code>, a
                permanent landing page, and a BibTeX block ready to drop into
                the methods section. Researchers cite the dataset. The dataset
                stays where the citation points.
              </p>
              <p className="text-sm font-mono text-ndi-teal m-0">
                → <span className="underline">doi.org/10.48324/ndi.ds.94a2f08</span>
              </p>
            </div>

            {/* Sample dataset card — white surface on the cream band.
                Hover affordance shared with FairTile/ProvCell — but the
                resting shadow is already `shadow-md` (this card carries
                more visual weight to anchor the DOI band), so the hover
                lifts to `shadow-lg` for a proportional bump. */}
            <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-md transition-all duration-(--duration-base) ease-(--ease-out) hover:border-ndi-teal-border hover:-translate-y-0.5 hover:shadow-lg">
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

        {/* WHO USES IT — white section per source. The body bg is cream
             site-wide; this section opts in to white explicitly so it reads
             as a continuation of the FAIR white surface, not another cream
             wash. */}
        <section className="px-7 py-16 bg-bg-surface">
          <div className="max-w-[1100px] mx-auto">
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              Who uses it
            </div>
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
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
                body="Search by species, region, probe, or year. Download direct, or browse from a notebook with the NDI Python API."
              />
              <ProvCell
                kicker="For reviewers"
                title="Cite in papers"
                body="BibTeX and RIS on every landing page. DOIs resolve immediately, and they keep resolving — references that don't rot mid-review."
              />
              <ProvCell
                kicker="For labs"
                title="Get discovered"
                body="Published datasets show up in Crossref, Google Scholar, and openMINDS search — where researchers already look. Citations and download counts come back to your Data Browser."
              />
            </div>
          </div>
        </section>

        {/* PLATFORM BRIDGE — muted-gray section background with a unified
             white card holding three flush rows. Source `.bridgeSection` uses
             `--bg-muted` (gray-50) as the band background; `.bridgeRows`
             wraps the rows in a single white container with
             `overflow:hidden` + `border-radius:14px` so dividers sit flush
             at the rounded corners. Each row is `border-top: 1px` except the
             first — restored via Tailwind's `first:border-t-0`. The active
             "You're here" row gets a cream wash and the arrow morphs into a
             pill-shaped uppercase badge on `--ndi-teal-light`. */}
        <section className="px-7 py-16 bg-bg-muted">
          <div className="max-w-[1100px] mx-auto">
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              One data model
            </div>
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Three tools. One graph.
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
              The Commons is what the public sees. Behind it: a private
              workspace for your lab&rsquo;s working data, and an AI assistant
              that answers from your papers and your datasets — not the open
              web.
            </p>

            <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
              <BridgeRow
                num="01"
                title="NDI Data Commons"
                desc="Public search across every published NDI dataset. DOI landing pages, openMINDS metadata, NIH DMSP ready."
                active
              />
              {/* 2026-04-28 — Data Browser row marked Coming Soon (team
                  review feedback). The page at /products/private-cloud
                  still exists but is hidden from the top nav until the
                  product matches the pitch — see Header.tsx comment. */}
              <BridgeRow
                num="02"
                title="NDI Data Browser"
                desc="The private workspace for your lab. Upload sessions from MATLAB or Python, track sync status, publish with a Crossref DOI."
                comingSoon
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
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight leading-[1.2] mb-3 m-0">
              Publish once. Get cited.
            </h2>
            <p className="text-base leading-relaxed text-white/80 mb-8 m-0">
              Upload your sessions, fill in the metadata, click publish. Your
              dataset gets a Crossref DOI, a landing page, and a place in the
              Commons — from the same workspace your lab already uses.
            </p>
            {/* CTA buttons standardised to `MarketingButton` `lg`. Was
                hand-rolled `text-base px-6 py-2.5` inline classes —
                extracted to the shared primitive so home + platform
                render at the same size as About / Security / LabChat /
                Private Cloud (those use `md`; primary heroes use `lg`). */}
            <div className="flex gap-3 justify-center flex-wrap">
              <MarketingButton
                as="a"
                href="/create-account"
                variant="cta"
                size="lg"
              >
                Create Free Account
              </MarketingButton>
              <MarketingButton
                as="a"
                href={commonsSearchUrl()}
                variant="ghost"
                size="lg"
              >
                Browse the Commons
              </MarketingButton>
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
  chips,
}: {
  letter: string;
  title: string;
  children: React.ReactNode;
  /**
   * Optional inline chip row rendered beneath the body. Used by the
   * "Interoperable" tile to surface the four ontology names
   * (NCBITaxon · UBERON · PATO · WBStrain) without inflating the body
   * paragraph with parenthetical acronyms — editorial-pass voice rule
   * "one acronym per sentence, max."
   */
  chips?: ReadonlyArray<string>;
}) {
  return (
    // Hover affordance ported from the about-page team-card pattern
    // (`apps/web/app/(marketing)/about/page.tsx:198`): subtle 2px lift,
    // shadow bump, teal border tint. Keeps the same custom motion
    // tokens (`--duration-base` + `--ease-out`) so all marketing-card
    // hovers share one easing curve.
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm transition-all duration-(--duration-base) ease-(--ease-out) hover:border-ndi-teal-border hover:-translate-y-0.5 hover:shadow-md">
      <div
        className="font-display font-extrabold text-3xl text-ndi-teal mb-2 leading-none"
        aria-hidden
      >
        {letter}
      </div>
      <h4 className="text-base font-bold text-fg-primary mb-2 m-0">{title}</h4>
      <p className="text-sm leading-relaxed text-fg-secondary m-0">{children}</p>
      {chips && chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center text-[10px] font-mono text-fg-muted bg-bg-muted px-1.5 py-0.5 rounded"
            >
              {c}
            </span>
          ))}
        </div>
      )}
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
    // Same team-card hover pattern as FairTile above. See FairTile
    // for the rationale; sharing this affordance across every
    // homepage card so they all feel consistently reactive.
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm transition-all duration-(--duration-base) ease-(--ease-out) hover:border-ndi-teal-border hover:-translate-y-0.5 hover:shadow-md">
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
  comingSoon,
}: {
  num: string;
  title: string;
  desc: string;
  href?: string;
  active?: boolean;
  /**
   * Pre-launch placeholder state. Renders without a link wrap, dims
   * the row slightly, and replaces the right-side arrow with a small
   * "Coming soon" badge. Used for products that are visible in the
   * marketing pitch but not yet ready to click into. Mutually
   * exclusive with `active` — a row can be the current page OR a
   * coming-soon teaser, not both.
   */
  comingSoon?: boolean;
}) {
  // Single-row layout inside the unified bridge container. No own border
  // (the parent provides the outer card); a top divider on every row except
  // the first via `first:border-t-0`. Source uses a 56px / 1fr / auto grid
  // — preserved here so the `01/02/03` mono index column lines up across
  // rows regardless of title length. Active row gets a cream wash + the
  // arrow becomes a pill-shaped uppercase "You're here" badge. Coming-soon
  // row dims the body and shows a "Coming soon" badge, no link.
  const inner = (
    <div
      className={`grid grid-cols-[56px_1fr_auto] max-[640px]:grid-cols-[44px_1fr_auto] gap-6 max-[640px]:gap-4 items-center px-8 py-7 max-[640px]:px-5 max-[640px]:py-5 border-t first:border-t-0 border-border-subtle transition-colors duration-(--duration-base) ease-(--ease-out) ${
        active
          ? 'bg-brand-cream cursor-default'
          : comingSoon
            ? 'bg-transparent cursor-default opacity-75'
            : 'bg-transparent hover:bg-bg-muted'
      }`}
    >
      <div className="font-mono text-[0.9rem] font-semibold tracking-[0.06em] text-ndi-teal">
        {num}
      </div>
      <div className="min-w-0">
        <div className="text-[1.2rem] font-extrabold text-fg-primary leading-tight tracking-tight mb-1.5">
          {title}
        </div>
        <div className="text-[0.95rem] leading-[1.55] text-fg-secondary">{desc}</div>
      </div>
      <span
        className={
          active
            ? 'inline-flex items-center bg-ndi-teal-light text-ndi-teal text-[11px] font-semibold tracking-[0.12em] uppercase px-2.5 py-1 rounded-pill whitespace-nowrap'
            : comingSoon
              ? 'inline-flex items-center bg-bg-muted text-fg-muted text-[11px] font-semibold tracking-[0.12em] uppercase px-2.5 py-1 rounded-pill whitespace-nowrap'
              : 'font-mono text-[0.9rem] text-fg-muted whitespace-nowrap transition-transform duration-(--duration-base) ease-(--ease-out)'
        }
      >
        {active ? "You're here" : comingSoon ? 'Coming soon' : '→'}
      </span>
    </div>
  );

  if (active || comingSoon || !href) return inner;
  return (
    <Link
      href={href}
      className="no-underline block focus:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal/40"
    >
      {inner}
    </Link>
  );
}

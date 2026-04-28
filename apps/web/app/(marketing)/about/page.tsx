import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * /about — team + partnerships + SfN.
 *
 * Ported from ndi-web-app-wds/app/src/pages/about/index.tsx. Pure RSC;
 * the LinkedIn icon stays as inline SVG (server-renderable). Static
 * image imports from the source repo (`import xHeadshot from
 * '../../../public/x.jpg'`) are converted to string paths to
 * /public/* — Next 16's Image still optimizes them, just without the
 * compile-time width/height inference.
 */
export const metadata: Metadata = {
  title: 'About',
  description:
    'NDI Cloud is built by Waltham Data Science, commercializing the open Neuroscience Data Interface developed at the Van Hooser Lab at Brandeis.',
  alternates: { canonical: 'https://ndi-cloud.com/about' },
  openGraph: {
    type: 'website',
    url: 'https://ndi-cloud.com/about',
    title: 'About NDI Cloud',
    description:
      'Commercializing the open Neuroscience Data Interface. Meet the team, see our partnerships, and find us at SfN 2025.',
    images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    siteName: 'NDI Cloud',
  },
};

/**
 * `photoPosition` is an optional CSS `object-position` value. Default
 * `object-fit: cover` + `object-position: center` centers the crop on
 * the middle of the image — fine when the face is mid-frame, but some
 * portraits put the face higher or lower and get awkward head-crops in
 * a circular mask. Override per-member as needed.
 */
type TeamMember = {
  name: string;
  role: string;
  bio: string;
  linkedin?: string;
  photo?: string;
  photoPosition?: string;
};

const teamMembers: ReadonlyArray<TeamMember> = [
  {
    name: 'Dr. Stephen Van Hooser',
    role: 'Founder & Technical Lead',
    bio: 'Faculty at Brandeis University. Expert in scientific data management and neuroscience computing.',
    linkedin: 'https://www.linkedin.com/in/stephen-van-hooser-76470039',
    photo: '/vanhooser-headshot.jpg',
  },
  {
    name: 'Audri Bhowmick',
    role: 'Co-Founder & Product Lead',
    bio: 'Formerly at PwC and Teamlift AI. NSF I-Corps and Laconia Capital Venture Fellow.',
    linkedin: 'https://www.linkedin.com/in/audri-bhowmick-a07003197',
    photo: '/audri-headshot.jpeg',
    // Source photo has Audri's face slightly above center; shift the
    // crop origin up so the face lands in the middle of the circular mask.
    photoPosition: 'center 22%',
  },
  {
    name: 'Dr. Andrea Gaede',
    role: 'Director of Metadata',
    bio: 'Faculty at the Royal Veterinary College London. Expert in metadata standards and ontologies.',
    linkedin: 'https://www.linkedin.com/in/andrea-gaede-55019663',
    photo: '/andrea2.jpg',
  },
  {
    name: 'Eivind Hennestad',
    role: 'Sr. Software Engineer',
    bio: 'EU EBRAINS grantee. Over 10 years of neuroscience software development experience.',
    linkedin: 'https://www.linkedin.com/in/eivind-hennestad-84b84037',
    photo: '/eivind-headshot.jpg',
  },
  {
    name: 'Dr. Jess Haley',
    role: 'Data Consultant & Programmer',
    bio: 'PhD in Computational Neuroscience from UCSD. Expert in neuroscientific data pipelines.',
    linkedin: 'https://www.linkedin.com/in/jess-a-haley',
    photo: '/jess-headshot.jpg',
  },
  {
    name: 'Sandra Maesta-Pereira',
    role: 'Research Intern',
    bio: 'Supporting data curation, quality assurance, and research initiatives.',
    linkedin: 'https://www.linkedin.com/in/maestapereira',
  },
];

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.026-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.048c.476-.9 1.637-1.852 3.37-1.852 3.602 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.226.792 24 1.771 24h20.451C23.2 24 24 23.226 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <main>
      {/* HERO */}
      <section
        className="relative overflow-hidden text-white px-7 py-20"
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
        {/* Hero inner: centered alignment per source `.heroInner { text-align: center }`.
            Mirrors the home / labchat / private-cloud heroes so the
            secondary marketing pages share the same symmetric center
            composition. Eyebrow restored to the pill+halo-dot pattern from
            the home hero (page.tsx ~131-140) — `bg rgba(23,167,255,0.12)`,
            `padding 6px 14px`, brand-blue-3 text + halo dot via box-shadow.
            Hero `<em>` accent flipped from `text-brand-blue-3` to
            `text-brand-blue` per source `em { color: var(--brand-blue) }`. */}
        <div className="relative max-w-[1100px] mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-brand-blue-3 mb-5 px-3.5 py-1.5 rounded-pill"
            style={{ background: 'rgba(23, 167, 255, 0.12)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3"
              style={{ boxShadow: '0 0 0 3px rgba(93, 193, 255, 0.25)' }}
            />
            About · Waltham Data Science
          </div>
          <h1
            className="font-display font-extrabold leading-[1.1] tracking-tight text-white mb-5 m-0"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}
          >
            Built by the people who{' '}
            <em className="not-italic text-brand-blue">wrote the standard.</em>
          </h1>
          <p className="text-[17px] leading-relaxed text-white/80 max-w-[720px] mx-auto m-0">
            Waltham Data Science is a small team of neuroscientists and data
            engineers. We built NDI Cloud because our own labs needed it — the
            open Neuroscience Data Interface (the spec, NDI-MATLAB, NDI-Python,
            all developed at the Van Hooser Lab at Brandeis) is a great
            standard, and standards need infrastructure. The open tools stay
            open. NDI Cloud is the hosting, the DOI pipeline, and the AI layer
            that turn the spec into something you can actually run a lab on.
          </p>
        </div>
      </section>

      {/* Hero fade — Phase 6.6 PR-D polish.
       * 80px gradient transition from depth-gradient hero bottom to
       * the TEAM section's cream bg. Source: About.module.scss
       * `.heroFade { height: 80px; background: linear-gradient(180deg,
       * #001438 0%, white 100%); }`. Tokenized for the monorepo so the
       * fade follows --color-brand-navy → --color-bg-canvas. */}
      <div
        aria-hidden
        className="h-20"
        style={{
          background:
            'linear-gradient(180deg, var(--color-brand-navy) 0%, var(--color-bg-canvas) 100%)',
        }}
      />

      {/* TEAM */}
      <section className="px-7 py-20 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            The team
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            {teamMembers.length} people, two continents, one data model.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-12 m-0">
            Brandeis, the Royal Veterinary College London, and the open
            neuroscience community. Everyone here has either written code for
            NDI, run experiments on it, or both.
          </p>

          <div className="grid grid-cols-3 max-[840px]:grid-cols-2 max-[480px]:grid-cols-1 gap-6">
            {teamMembers.map((member) => (
              // Phase 6.6 PR-D polish: hover state per source SCSS
              // `.teamCard:hover { border-color: ndi-teal-border;
              // transform: translateY(-2px); box-shadow: shadow-md; }`.
              // Wraps the existing card visual; the `transition-all`
              // honors `--duration-base` + `--ease-out` per token spec.
              <div
                key={member.name}
                className="bg-bg-surface border border-border-subtle rounded-xl p-6 shadow-sm flex flex-col items-center text-center transition-all duration-(--duration-base) ease-(--ease-out) hover:border-ndi-teal-border hover:-translate-y-0.5 hover:shadow-md"
              >
                {/* Phase 6.6 PR-D polish: 2px ndi-teal-light photo
                 * ring per source `.teamPhoto { border: 2px solid
                 * ndi-teal-light; }`. */}
                <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-bg-muted flex items-center justify-center mb-4 border-2 border-ndi-teal-light">
                  {member.photo ? (
                    <Image
                      src={member.photo}
                      alt={member.name}
                      width={480}
                      height={480}
                      quality={100}
                      style={{
                        objectFit: 'cover',
                        objectPosition: member.photoPosition ?? 'center',
                        width: '100%',
                        height: '100%',
                      }}
                    />
                  ) : (
                    <span className="text-2xl font-bold text-ndi-teal">
                      {member.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-fg-primary mb-1 m-0">{member.name}</h3>
                <p className="text-sm font-semibold text-ndi-teal mb-2 m-0">{member.role}</p>
                <p className="text-sm leading-relaxed text-fg-secondary mb-4 m-0">{member.bio}</p>
                {member.linkedin && (
                  <a
                    href={member.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-ndi-teal hover:text-ndi-primary transition-colors"
                    aria-label={`${member.name} LinkedIn profile`}
                  >
                    <LinkedInIcon />
                    <span>LinkedIn</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BACKED BY / BUILT ON */}
      <section className="px-7 py-20 bg-bg-surface" id="partnerships">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            Backed by &amp; built on
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            A citable tool, with NSF and MathWorks behind it.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
            NDI is in the Research Resource Identifier registry as{' '}
            <strong className="font-semibold text-fg-primary">
              RRID:SCR_023368
            </strong>{' '}
            — meaning a paper can cite the tool itself, not just its papers.
            Development is funded by NSF I-Corps. MathWorks is an official
            Connections Partner.
          </p>

          <div className="grid grid-cols-4 max-[840px]:grid-cols-2 max-[480px]:grid-cols-1 gap-5">
            <BadgeItem
              logoSrc="/nsf-logo.svg"
              logoAlt="NSF I-Corps"
              logoSize={56}
              label="NSF I-Corps Program"
              sub="Customer discovery grant"
            />
            <BadgeItem
              logoSrc="/mathworks_logo.png"
              logoAlt="MathWorks"
              logoWidth={110}
              logoHeight={36}
              label="MathWorks Connections Partner"
              sub="Official MATLAB integration"
            />
            <BadgeItem
              mark="RRID"
              label="SCR_023368"
              sub="Citable research tool"
            />
            <BadgeItem
              mark="OSS"
              label="Open source"
              subLink={{
                href: 'https://github.com/VH-Lab/NDI-matlab',
                text: 'GitHub →',
              }}
            />
          </div>
        </div>
      </section>

      {/* SfN — dark band with blue radial glow (Phase 6.6 PR-D polish).
       *
       * Source `.sfnSection` is `bg-bg-depth` (near-black `#0d1117`)
       * with a `::after` 500x500px blue radial glow at top-right
       * (rgba(23,167,255,0.15) → transparent 70%). This replaces the
       * previous bright teal band — the dark+glow treatment matches
       * the marketing chrome (CTA, Bridge, etc.) and creates visual
       * cadence rather than a jarring teal flash between the
       * partnerships and CTA sections.
       */}
      <section
        className="relative overflow-hidden px-7 py-16 text-white"
        style={{ background: 'var(--color-bg-depth)' }}
        id="sfn"
      >
        {/* Blue radial glow — top-right offset by negative half-width,
         * matches source `&::after { width: 500px; height: 500px;
         * radius: 50%; background: radial-gradient(circle, rgba(23,167,255,0.15) 0%, transparent 70%);
         * top: -250px; right: -150px; }`. */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            width: 500,
            height: 500,
            top: -250,
            right: -150,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(23, 167, 255, 0.15) 0%, transparent 70%)',
          }}
        />
        <div className="relative max-w-[1100px] mx-auto text-center">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-white/80 mb-3">
            Where to find us
          </div>
          <h2
            className="font-display font-extrabold leading-[1.1] tracking-tight mb-3 m-0"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)' }}
          >
            SfN 2025 <em className="not-italic text-brand-blue-3">·</em> San
            Diego.
          </h2>
          <p className="text-lg font-semibold m-0 mb-2">
            Nov 8–12 · San Diego Convention Center · Booth TBD
          </p>
          <p className="text-base text-white/75 max-w-[600px] mx-auto m-0">
            Drop by to see the Data Browser live and ask what LabChat can do with
            your lab&rsquo;s papers.
          </p>
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
            We do this with labs, not for them.
          </h2>
          <p className="text-base leading-relaxed text-white/75 mb-8 m-0">
            Bringing your data to NDI is a project, not a sign-up. We help with
            the upload, the metadata, the first published DOI, and the LabChat
            deploy. Talk to us before you start.
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
              href="mailto:info@walthamdatascience.com?subject=NDI%20Cloud%20Inquiry"
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

type BadgeItemProps = {
  label: string;
  sub?: string;
  subLink?: { href: string; text: string };
  logoSrc?: string;
  logoAlt?: string;
  logoSize?: number;
  logoWidth?: number;
  logoHeight?: number;
  mark?: string;
};

function BadgeItem({
  label,
  sub,
  subLink,
  logoSrc,
  logoAlt,
  logoSize,
  logoWidth,
  logoHeight,
  mark,
}: BadgeItemProps) {
  return (
    <div className="bg-bg-canvas border border-border-subtle rounded-xl p-5 flex flex-col items-center text-center">
      <div className="h-[56px] w-full flex items-center justify-center mb-3">
        {logoSrc ? (
          <Image
            src={logoSrc}
            alt={logoAlt ?? ''}
            width={logoWidth ?? logoSize ?? 56}
            height={logoHeight ?? logoSize ?? 56}
            style={{ objectFit: 'contain', maxHeight: 56 }}
          />
        ) : mark ? (
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-ndi-teal-light text-ndi-teal font-bold text-xs tracking-wide">
            {mark}
          </span>
        ) : null}
      </div>
      <div className="text-sm font-bold text-fg-primary mb-1">{label}</div>
      {sub && <div className="text-xs text-fg-muted">{sub}</div>}
      {subLink && (
        <a
          href={subLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-ndi-teal hover:text-ndi-primary transition-colors"
        >
          {subLink.text}
        </a>
      )}
    </div>
  );
}

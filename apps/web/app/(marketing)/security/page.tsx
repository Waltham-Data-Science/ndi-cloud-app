import type { Metadata } from 'next';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * /security — security & compliance page.
 *
 * Ported from ndi-web-app-wds/app/src/pages/security/index.tsx.
 *
 * Structure: dark depth-gradient hero → "four pillars" grid →
 * encryption band → compliance snapshot → CTA. SCSS Module
 * (Security.module.scss) replaced with Tailwind v4 utility classes
 * driven by the @theme tokens; only the depth-gradient background +
 * a few inline `style` arbitrary-values for `clamp()` font sizing
 * fall back to inline CSS where Tailwind doesn't have a clean
 * utility.
 *
 * Pure RSC — no hooks, no client state. The "Learn more about us"
 * button uses the MarketingButton anchor mode (`as="a"`) instead of a
 * `useRouter().push` so the page can stay server-only.
 */
export const metadata: Metadata = {
  title: 'Security & Compliance',
  description:
    'NDI Cloud is HIPAA-aware by design. Per-tenant isolation, encryption at rest and in transit, audit logs without PHI. Built on AWS Cognito, MongoDB, and AWS KMS.',
  alternates: { canonical: 'https://ndi-cloud.com/security' },
  openGraph: {
    type: 'website',
    url: 'https://ndi-cloud.com/security',
    title: 'Security & Compliance — NDI Cloud',
    description:
      'HIPAA-aware by design. Per-tenant isolation, encryption at rest and in transit, audit logs without PHI.',
    images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    siteName: 'NDI Cloud',
  },
};

export default function SecurityPage() {
  return (
    <main>
      {/* HERO — dark depth gradient */}
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
            Mirrors the home / labchat / private-cloud heroes so all marketing
            heroes share the same symmetric center composition. Eyebrow
            restored to the pill+halo-dot pattern from the home hero
            (page.tsx ~131-140). Hero `<em>` accent flipped from
            `text-brand-blue-3` to `text-brand-blue` per source `em {
            color: var(--brand-blue) }`. */}
        <div className="relative max-w-[1100px] mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-brand-blue-3 mb-5 px-3.5 py-1.5 rounded-pill"
            style={{ background: 'rgba(23, 167, 255, 0.12)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3"
              style={{ boxShadow: '0 0 0 3px rgba(93, 193, 255, 0.25)' }}
            />
            Security &amp; Compliance
          </div>
          <h1
            className="font-display font-extrabold leading-[1.1] tracking-tight text-white mb-5 m-0"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)' }}
          >
            HIPAA-aware by <em className="not-italic text-brand-blue">design.</em>
          </h1>
          <p className="text-[17px] leading-relaxed text-white/80 max-w-[720px] mx-auto m-0">
            Neuroscience data is sensitive. Session metadata, subject IDs, and
            notebook entries can carry PHI by accident. NDI Cloud is built on AWS
            with per-tenant isolation, encryption at rest and in transit, and an
            audit log that never captures payload bodies.
          </p>
        </div>
      </section>

      {/*
       * Hero fade — soft 40px gradient transition from the dark hero
       * gradient bottom (`#002054` brand-navy) into the cream
       * `--color-bg-canvas` of the pillars section. Visual seam fix
       * matching `ndi-web-app-wds/app/src/pages/security/Security.module.scss`'s
       * `.heroFade` rule (height: 40px, 180deg dark→light gradient).
       * Decorative; `aria-hidden` because it's purely a transitional
       * stripe, not content.
       */}
      <div
        aria-hidden
        className="h-10"
        style={{
          background:
            'linear-gradient(180deg, var(--color-brand-navy) 0%, var(--color-bg-canvas) 100%)',
        }}
      />

      {/* PILLARS */}
      <section className="px-7 py-20 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            How the platform is isolated
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            Four pillars.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-12 m-0">
            Every layer — application, API, database, object storage — enforces
            the same tenant boundaries. Admins can&apos;t accidentally read
            across labs, logs can&apos;t accidentally capture PHI, and keys
            rotate on schedule.
          </p>

          <div className="grid grid-cols-2 max-[720px]:grid-cols-1 gap-5">
            <PillarCard
              kicker="Access control"
              title="Tenant isolation at the data layer"
              body="Every search query and document read is filtered against the signed-in user's org permissions at the data access layer, not just the UI. Admins cannot accidentally read across tenant boundaries."
            />
            <PillarCard
              kicker="Authentication"
              title="AWS Cognito identity"
              body="Identity runs on AWS Cognito (HIPAA-eligible). MFA, strong password policies, and short-lived JWTs come standard. No username/password databases on our side."
            />
            <PillarCard
              kicker="Audit"
              title="Structured logs, no PHI"
              body="Every API call is logged with user, timestamp, action, and outcome. Request bodies and response payloads are explicitly excluded — so PHI cannot leak into logs by accident."
            />
            <PillarCard
              kicker="Encryption"
              title="Keys rotate automatically"
              body="Metadata sits in MongoDB on AWS with encryption at rest. Raw data objects live in S3 with server-side encryption. Keys are managed through AWS KMS with automatic rotation."
            />
          </div>
        </div>
      </section>

      {/* ENCRYPTION BAND — dark, accent stripe */}
      <section
        className="px-7 py-20 text-white"
        style={{ background: 'var(--color-bg-inverse)' }}
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3">
            Encryption &amp; data protection
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight leading-[1.2] mb-10 m-0">
            Encryption at three layers, on every request.
          </h2>

          <div className="grid grid-cols-3 max-[840px]:grid-cols-1 gap-5">
            <EncTile
              kicker="At rest"
              title="AES-256, rotating keys"
              body="MongoDB databases encrypted at rest. S3 buckets use SSE-KMS. Per-tenant keys rotated automatically."
            />
            <EncTile
              kicker="In transit"
              title="TLS 1.2+, HSTS enforced"
              body="All external traffic on TLS 1.2 or higher with HSTS. Internal service-to-service traffic runs over private VPC endpoints, not the public internet."
            />
            <EncTile
              kicker="Minimization"
              title="Only what the screen needs"
              body="List views surface only the metadata needed to render. Full documents load only when you open them, keeping PHI off intermediate caches."
            />
          </div>
        </div>
      </section>

      {/* COMPLIANCE SNAPSHOT */}
      <section className="px-7 py-20 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            Compliance snapshot
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-10 m-0">
            What we comply with, and what&apos;s on deck.
          </h2>

          <div className="flex flex-col gap-3">
            <ComplyRow
              status="live"
              title="HIPAA Technical Safeguards"
              desc="Access control, audit controls, integrity, person authentication, transmission security — all architected against 45 CFR 164.312."
            />
            <ComplyRow
              status="live"
              title="NIH Data Management & Sharing Plan"
              desc="Every published dataset satisfies NIH DMSP requirements out of the box: Crossref DOI, FAIR metadata, defined license, stable landing page."
            />
            <ComplyRow
              status="in-progress"
              title="SOC 2 Type II"
              desc="Observation window open. Public attestation available on request for prospective enterprise customers under NDA."
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
            Questions about our security?
          </h2>
          <p className="text-base leading-relaxed text-white/75 mb-8 m-0">
            We&rsquo;re happy to walk through our architecture, share our
            compliance posture, or provide documentation for your IRB or
            compliance team.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <MarketingButton
              as="a"
              href="mailto:info@walthamdatascience.com?subject=Security%20question"
              variant="cta"
              size="md"
            >
              Contact us
            </MarketingButton>
            <MarketingButton as="a" href="/about" variant="ghost" size="md">
              Learn more about us
            </MarketingButton>
          </div>
        </div>
      </section>
    </main>
  );
}

function PillarCard({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-7 shadow-sm">
      <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-2">
        {kicker}
      </div>
      <h3 className="text-[1.25rem] font-bold text-fg-primary leading-tight mb-2 m-0">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-fg-secondary m-0">{body}</p>
    </div>
  );
}

function EncTile({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6 backdrop-blur-sm">
      <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-2">
        {kicker}
      </div>
      <h4 className="text-base font-semibold text-white leading-tight mb-2 m-0">
        {title}
      </h4>
      <p className="text-sm leading-relaxed text-white/70 m-0">{body}</p>
    </div>
  );
}

function ComplyRow({
  status,
  title,
  desc,
}: {
  status: 'live' | 'in-progress';
  title: string;
  desc: string;
}) {
  const dot =
    status === 'live'
      ? 'bg-green-500'
      : 'bg-amber-500';
  const label = status === 'live' ? 'Live' : 'In progress';
  const labelColor =
    status === 'live' ? 'text-green-700' : 'text-amber-700';
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 grid grid-cols-[180px_1fr] max-[600px]:grid-cols-1 gap-5 items-start">
      <div className={`flex items-center gap-2 text-sm font-semibold ${labelColor}`}>
        <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden />
        {label}
      </div>
      <div>
        <div className="text-base font-bold text-fg-primary mb-1">{title}</div>
        <div className="text-sm leading-relaxed text-fg-secondary">{desc}</div>
      </div>
    </div>
  );
}

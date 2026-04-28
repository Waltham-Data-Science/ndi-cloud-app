import type { Metadata } from 'next';
import Image from 'next/image';

import { MarketingButton } from '@/components/marketing/Button';

/**
 * /products/labchat — LabChat product page.
 *
 * Ported from ndi-web-app-wds/app/src/pages/products/labchat/index.tsx.
 * Pure RSC. Heaviest section is the chat-preview split (user message
 * + AI response with citation pills + numbered source list); rendered
 * as static JSX since the conversation is illustrative copy, not a
 * live chat surface.
 */
export const metadata: Metadata = {
  title: 'LabChat — Private AI for your lab',
  description:
    "LabChat is a retrieval-augmented AI deployed per lab, trained on your papers, protocols, and NDI Cloud datasets. Cited answers grounded in real research — never the open web.",
  alternates: { canonical: 'https://ndi-cloud.com/products/labchat' },
  openGraph: {
    type: 'website',
    url: 'https://ndi-cloud.com/products/labchat',
    title: 'LabChat — NDI Cloud',
    description:
      "Retrieval-augmented AI trained on your lab's papers, protocols, and NDI Cloud datasets. Cited answers, never the open web.",
    images: ['https://ndi-cloud.com/logos/ndicloud-wordmark-color.svg'],
    siteName: 'NDI Cloud',
  },
};

export default function LabChatPage() {
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
        {/* Hero inner: centered alignment per source `.heroInner { text-align: center }`.
            Audit flagged the original target as left-aligned across the whole
            hero (eyebrow, h1, lede, CTAs) — this restores the source's
            symmetric center composition. The mockup frame below sits inside
            the same `text-center` container; its `max-w-[1140px] mx-auto`
            keeps the macOS-window chrome visually centered too. */}
        <div className="relative max-w-[1200px] mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-brand-blue-3 mb-5 px-3.5 py-1.5 rounded-pill"
            style={{ background: 'rgba(23, 167, 255, 0.12)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3"
              style={{ boxShadow: '0 0 0 3px rgba(93, 193, 255, 0.25)' }}
            />
            LabChat · Per-lab AI, bespoke deploy
          </div>
          <h1
            className="font-display font-extrabold leading-[1.1] tracking-tight text-white mb-5 m-0 max-w-[900px] mx-auto"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          >
            Ask your lab&rsquo;s knowledge{' '}
            <em className="not-italic text-brand-blue">anything.</em>
          </h1>
          <p className="text-[17px] leading-relaxed text-white/80 max-w-[720px] mx-auto mb-3 m-0">
            An AI assistant grounded in your lab&rsquo;s papers, protocols, and
            NDI datasets. Every answer cites the exact passage it came from —
            paper, PDF, or session. Your corpus stays in your lab&rsquo;s index.
            We don&rsquo;t train on it, and answers never pull from the open
            web.
          </p>
          <p className="text-sm text-brand-blue-3 max-w-[680px] mx-auto mb-7 m-0">
            LabChat is deployed per lab — each lab gets its own index and URL.
            Setup usually takes about a day.
          </p>
          <div className="flex gap-3 flex-wrap justify-center mb-12">
            <MarketingButton
              as="a"
              href="mailto:info@walthamdatascience.com?subject=LabChat%20deployment%20for%20our%20lab"
              variant="cta"
              size="md"
            >
              Request a deployment
            </MarketingButton>
            <MarketingButton
              as="a"
              href="mailto:info@walthamdatascience.com?subject=LabChat%20demo%20request"
              variant="ghost"
              size="md"
            >
              Request a demo →
            </MarketingButton>
          </div>

          {/* Mockup frame: dark `#1a1f2b` chrome, top-only rounded corners,
              translateY(60px) bleed into the next section, deep two-layer
              shadow (vertical drop + faint white inner ring). Source
              `.mockupFrame` SCSS — restores the "z-axis depth" effect the
              audit flagged. The browser-chrome dots use macOS traffic-light
              colors (#ff5f57 / #febc2e / #28c840) per source `.dots`; the URL
              capsule is `rgba(255,255,255,0.06)` translucent on the dark
              chrome. The frame stays `text-left` inside the centered hero so
              the URL pill renders as expected (centered inline-flex). */}
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
              <div className="flex-1 max-w-[460px] mx-auto rounded-md px-3 py-1.5 font-mono text-[11px] text-white/60 inline-flex items-center justify-center gap-2"
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
                labchat.ndi-cloud.com / vanhooser-lab / threads / feb24-v1
              </div>
            </div>
            {/*
              2026-04-28 — placeholder mockup (`labchat-chat.png`)
              replaced with a real product capture from the Chalasani-
              lab LabChat instance. Source PNG is 4K Retina (3840×2160)
              so we keep the intrinsic dimensions and let next/image
              generate Retina-quality srcsets via `quality={90}`. The
              `mt-2` shifts the image slightly down inside the dark
              chrome so the rounded white inner edge lines up with
              the top corners of the chrome — keeps the macOS-window
              illusion intact at 1140px display width.
            */}
            <Image
              src="/mockups/labchat-conversation.png"
              alt="LabChat answering a Chalasani-lab question about sonochannels, with structured sections, performance data, and cited notebook sources"
              width={3840}
              height={2160}
              priority
              quality={90}
              className="block w-full h-auto rounded-t-md"
            />
          </div>
        </div>
      </section>

      {/* HERO FADE — bridges the dark hero to the white "What it does" band
          below, masking the otherwise-hard edge between
          `var(--grad-depth)` and `bg-bg-canvas`. Height 100px, gradient
          starts at `#001438` (matches the brand-navy mid-step in
          --grad-depth) and fades to white. Adds the visual landing pad
          that the source has across all four product/info pages. The
          mockup frame above bleeds 60px down into this band via
          translateY, so this gradient functions as both a hero outro and
          a visual spotlight under the mockup. */}
      <div
        aria-hidden
        className="h-[100px]"
        style={{
          background:
            'linear-gradient(180deg, #001438 0%, var(--color-bg-canvas) 100%)',
        }}
      />

      {/* WHAT IT DOES */}
      <section className="px-7 py-16 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            What it does
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            Grounded in your&nbsp;lab&rsquo;s&nbsp;research.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
            LabChat indexes your lab&rsquo;s published papers, internal
            protocols, session metadata, and notebook entries — every document
            the lab actually generates. Answers come back in plain English, with
            a numbered citation behind every claim.
          </p>

          {/* Editorial-style stacked rows. Source `.caps`/`.cap`
              (LabChat.module.scss:281-321): vertical column with
              `border-top` on the container + `border-bottom` on each
              row, `grid-template-columns: 240px 1fr; gap: 40px;
              padding: 28px 0`. Mobile (≤768px) collapses to a single
              column with gap: 8px. h3 = 20px brand-navy display, body
              = 15px secondary at 1.6 leading, max 560px wide. */}
          <div className="flex flex-col border-t border-border-subtle">
            <CapRow
              title="Grounded in your papers"
              body="Every answer includes numbered citations to the specific paper, protocol PDF, or NDI dataset they came from. Answers only pull from your lab's index."
            />
            <CapRow
              title="Connected to your datasets"
              body="LabChat reads OpenMINDS metadata from your NDI Cloud workspace. Ask about sessions, species, stimulus parameters, QC results — and get answers from your actual data."
            />
            <CapRow
              title="Lab onboarding"
              body="New lab members ask questions about protocols, methods, and past experiments — and get answers drawn from the lab's own work. Tribal knowledge becomes queryable."
            />
            <CapRow
              title="Shows multiple sources"
              body="LabChat surfaces every retrieved passage behind an answer, not just one. When a protocol was updated mid-cohort or a finding was revised, both versions show up so you can read them side-by-side."
            />
          </div>
        </div>
      </section>

      {/* CHAT PREVIEW SPLIT — cream wash band per source `.chatSection
          { background: var(--brand-cream) }`. The chat-preview pane inside
          this section is dark `#0d1117` so the dark "AI terminal" reads
          high-contrast against the cream and the brand-blue citation
          pills pop. Audit flagged the original target as light-on-light
          (white section + light bubbles) which lost the source's
          intentional theme contrast. */}
      <section className="px-7 py-16 bg-brand-cream">
        <div className="max-w-[1100px] mx-auto grid grid-cols-2 max-[840px]:grid-cols-1 gap-12 items-start">
          <div>
            <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
              In the conversation
            </div>
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
              Cited answers, every time.
            </h2>
            <p className="text-base leading-relaxed text-fg-secondary mb-5 m-0">
              LabChat reads your lab&rsquo;s corpus and writes grounded,
              referenced responses. Numbers in superscript link to the exact
              paragraph in a paper, protocol PDF, or NDI dataset.
            </p>
            <ul className="list-none p-0 m-0 flex flex-col gap-3">
              {[
                'Inline citations to papers, PDFs, and session metadata',
                'Follows DOIs back to the NDI Commons landing page',
                "Regenerate, copy, thumbs-up — tuned by your team's feedback",
                'Full audit log every PI can review',
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

          {/*
            2026-04-28 — hand-coded chat-preview block (User bubble +
            AI bubble + hand-typed sources) replaced with a real crop
            of the Chalasani-lab LabChat sources panel. Why:

              1. The illustrative cohort ("Feb-'24 V1") was synthetic
                 prop copy. The real screenshot's sources are actual
                 lab notebooks (Wen Mai Wong, Yanlin Liu, Janki Patel,
                 Megan Anderson) — concrete provenance beats invented.
              2. The "Source cards" pattern in the real product is the
                 differentiator vs ChatGPT — collapsible per-source
                 cards with notebook badges + author + date. The
                 hand-coded version was a single inline source list,
                 which under-sold the product.
              3. The crop preserves the timing badge ("8878ms · Sources
                 (5)") at top, so the marketing reader sees both the
                 retrieval guarantee AND the citation surface in a
                 single capture.

            Source PNG is 3840×870 (4K-wide crop), `quality={90}` for
            Retina sharpness on display. The container chrome (rounded
            corners, soft shadow, faint white inner ring) matches the
            site's other product captures. The deleted helper components
            (`CitePill`, `SourceRow`) below the page are kept for now in
            case a future section reuses the inline-citation style; they
            no longer have render call-sites.
          */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: '#fff',
              border: '1px solid rgba(0, 0, 0, 0.06)',
              boxShadow:
                '0 20px 40px -12px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.4) inset',
            }}
          >
            <Image
              src="/mockups/labchat-sources.png"
              alt="LabChat sources panel: 8878ms response time and five collapsible source cards (Confocal vs EPI HEKTAB-NOGC notebook by Wen Mai Wong, Lab meeting by Yanlin Liu, two Janki Patel lab notebooks, Hydrophone-flytrap equipment comparison by Megan Anderson)"
              width={3840}
              height={870}
              quality={90}
              className="block w-full h-auto"
              sizes="(min-width: 840px) 50vw, 100vw"
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-7 py-16 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            How it works
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            Three steps to grounded answers.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-12 m-0">
            No model training, no fine-tuning. LabChat builds a private retrieval
            index from your lab&rsquo;s corpus and uses it at query time.
          </p>

          <div className="grid grid-cols-3 max-[720px]:grid-cols-1 gap-6">
            <Step
              num="01"
              title="Upload your corpus"
              body="Add your lab's papers, protocol PDFs, and connect your NDI Cloud workspace. We ingest the PDFs and index them alongside your datasets."
            />
            <Step
              num="02"
              title="Ask a question"
              body="Type in plain English. LabChat searches your indexed corpus and retrieves the most relevant passages from your papers, protocols, and sessions."
            />
            <Step
              num="03"
              title="Get a cited answer"
              body="Responses include numbered citations linking to specific sources. Share threads with collaborators, cite them in lab meetings, reference them later."
            />
          </div>
        </div>
      </section>

      {/* SECURITY (dark band) — `--color-bg-depth` (#0d1117 near-black)
          per source `.secBand { background: var(--bg-depth) }`. The
          previous target used `--color-bg-inverse` (#002054 navy) which
          read as a teal/navy product band rather than the source's
          intentional "encryption / private terminal" near-black aesthetic.
          The CTA band immediately below uses `var(--grad-depth)` (a
          dark-blue gradient) — the near-black security band creates a
          subtle z-axis transition into it rather than two adjacent navy
          bands of similar intensity. */}
      <section
        className="px-7 py-16 text-white"
        style={{ background: 'var(--color-bg-depth)' }}
      >
        <div className="max-w-[1100px] mx-auto grid grid-cols-2 max-[840px]:grid-cols-1 gap-12">
          <div>
            <div className="text-xs font-bold tracking-eyebrow uppercase text-brand-blue-3 mb-3">
              Private by default
            </div>
            <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight leading-[1.2] mb-3 m-0">
              Your lab&rsquo;s corpus
              <br />
              stays in your lab&rsquo;s index.
            </h2>
            <p className="text-base leading-relaxed text-white/75 m-0">
              Each lab gets its own encryption keys, its own URL, and its own
              retrieval boundary — nothing crosses between labs.
            </p>
          </div>

          <div className="grid grid-cols-2 max-[640px]:grid-cols-1 gap-4">
            <SecTile
              kicker="Encryption"
              title="AES-256 at rest, TLS 1.3 in transit"
              body="Per-tenant encryption keys managed in AWS KMS with automatic rotation."
            />
            <SecTile
              kicker="Isolation"
              title="Private per-lab index"
              body="No cross-tenant retrieval. Your papers never appear in another lab's results."
            />
            <SecTile
              kicker="Audit"
              title="Full query log"
              body="Every question, retrieved passage, and answer is logged for your PI's review."
            />
            <SecTile
              kicker="Compliance"
              title="HIPAA-ready, IRB-aware"
              body="PHI-flagged documents stay inside your HIPAA boundary. Consent metadata surfaces at retrieval time."
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
            Your lab&rsquo;s knowledge, queryable, in about a day.
          </h2>
          <p className="text-base leading-relaxed text-white/75 mb-8 m-0">
            LabChat is deployed per lab, on dedicated infrastructure. You send
            us your corpus, we ingest it and stand up your URL, you start asking
            questions. Setup is usually a day. The team-onboarding payoff is
            forever.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <MarketingButton
              as="a"
              href="mailto:info@walthamdatascience.com?subject=LabChat%20deployment%20for%20our%20lab"
              variant="cta"
              size="md"
            >
              Request a deployment
            </MarketingButton>
            <MarketingButton
              as="a"
              href="mailto:info@walthamdatascience.com?subject=LabChat%20demo%20request"
              variant="ghost"
              size="md"
            >
              Talk to us
            </MarketingButton>
          </div>
          <p className="mt-5 text-xs text-white/55 max-w-[600px] mx-auto m-0">
            LabChat isn&rsquo;t a self-serve sign-up — each deploy is configured
            against your lab&rsquo;s corpus. Every inquiry gets a response within
            1 business day.
          </p>
        </div>
      </section>
    </main>
  );
}

/**
 * Capability row in the editorial-style stacked list. Source
 * `.cap` (LabChat.module.scss:288-321) — `display: grid;
 * grid-template-columns: 240px 1fr; gap: 40px; padding: 28px 0;
 * border-bottom: 1px solid var(--border-subtle)`. Mobile (≤768px)
 * collapses to a single column with gap: 8px. Title h3 is the source's
 * 20px brand-navy display weight; body is 15px fg-secondary at 1.6
 * leading, capped at 560px wide.
 */
function CapRow({ title, body }: { title: string; body: string }) {
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

function Step({
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

// `CitePill` and `SourceRow` (the inline citation badge + numbered
// reference row) lived here pre-2026-04-28. They powered the hand-
// coded chat-preview block in the "Cited answers, every time"
// section — now replaced by a real product capture
// (`/mockups/labchat-sources.png`). Removing the helpers since they
// have no remaining call-sites; the file's other helpers (`CapRow`,
// `Step`, `SecTile`) are still in use across the page.

function SecTile({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-5 backdrop-blur-sm">
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

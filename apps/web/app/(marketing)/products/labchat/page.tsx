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
            NDI Cloud datasets. Every answer cites the specific source it came
            from. Your corpus stays in your lab&rsquo;s index — we don&rsquo;t
            use it to train models, and answers don&rsquo;t pull from the open
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
            <Image
              src="/mockups/labchat-chat.png"
              alt="LabChat answering a research question with cited sources from the Van Hooser lab's papers and datasets"
              width={1140}
              height={700}
              priority
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
      <section className="px-7 py-20 bg-bg-canvas">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-ndi-teal mb-3">
            What it does
          </div>
          <h2 className="text-[length:var(--type-h2-marketing)] font-bold tracking-tight text-fg-primary leading-[1.2] mb-3 m-0">
            Grounded in your&nbsp;lab&rsquo;s&nbsp;research.
          </h2>
          <p className="text-base leading-relaxed text-fg-secondary max-w-[680px] mb-10 m-0">
            LabChat indexes your lab&rsquo;s published papers, internal
            protocols, session metadata, and notebook entries. It answers in
            plain English and cites the specific passage each claim came from.
          </p>

          <div className="grid grid-cols-2 max-[720px]:grid-cols-1 gap-5">
            <CapCard
              title="Grounded in your papers"
              body="Every answer includes numbered citations to the specific paper, protocol PDF, or NDI dataset they came from. Answers only pull from your lab's index."
            />
            <CapCard
              title="Connected to your datasets"
              body="LabChat reads OpenMINDS metadata from your NDI Cloud workspace. Ask about sessions, species, stimulus parameters, QC results — and get answers from your actual data."
            />
            <CapCard
              title="Lab onboarding"
              body="New lab members ask questions about protocols, methods, and past experiments — and get answers drawn from the lab's own work. Tribal knowledge becomes queryable."
            />
            <CapCard
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
      <section className="px-7 py-20 bg-brand-cream">
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

          {/* Chat preview — dark "AI terminal" surface. Source
              `.chatPreview { background: #0d1117 }` with translucent
              user/AI bubbles. User bubble carries `rgba(23,167,255,0.12)`
              translucent blue (NOT teal — the brand-blue ties the chat
              metaphor to the data-citation theme on the rest of the page);
              AI bubble is barely-visible white at 3% on the dark surface.
              CitePills + source numbers use brand-blue per source
              `.citePill { background: var(--brand-blue) }`. */}
          <div
            className="rounded-xl p-5 text-white"
            style={{
              background: '#0d1117',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* User bubble */}
            <div
              className="rounded-[10px] p-4 mb-3"
              style={{
                background: 'rgba(23, 167, 255, 0.12)',
                border: '1px solid rgba(23, 167, 255, 0.2)',
              }}
            >
              <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-white/45 mb-1.5">
                You
              </div>
              <div className="text-sm leading-relaxed text-white/90">
                What stimuli did we use for the Feb-&rsquo;24 V1 cohort, and
                which sessions passed QC?
              </div>
            </div>

            {/* AI bubble */}
            <div
              className="rounded-[10px] p-4"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-white/45 mb-1.5">
                LabChat
              </div>
              <div className="text-sm leading-relaxed text-white/90 mb-4">
                The Feb-&rsquo;24 V1 cohort used two stimulus families
                <CitePill n={1} />: <strong className="text-white font-semibold">drifting gratings</strong> (4 cardinal
                directions, 0.04 cpd) and <strong className="text-white font-semibold">natural movies</strong> from{' '}
                <code
                  className="font-mono text-[0.88em] px-1.5 py-px rounded"
                  style={{ background: 'rgba(255, 255, 255, 0.06)' }}
                >
                  vanhooser_nat_lib_v3
                </code>. Of
                22 sessions, <strong className="text-white font-semibold">17 passed QC</strong>
                <CitePill n={2} /> (sessions 211–217, 219, 221, 223–232). Raw data
                is in dataset{' '}
                <code
                  className="font-mono text-[0.88em] px-1.5 py-px rounded"
                  style={{ background: 'rgba(255, 255, 255, 0.06)' }}
                >
                  v1_cohort_feb24
                </code>
                <CitePill n={3} />.
              </div>
              <div
                className="flex flex-col gap-2 mb-3 pt-3"
                style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
              >
                <SourceRow
                  n={1}
                  title="Feb-’24 V1 cohort protocol"
                  sub="protocol.pdf · updated 2024-01-28"
                />
                <SourceRow
                  n={2}
                  title="QC thresholds for visual cortex recordings"
                  sub="Ray et al. 2023 · cited 62x"
                />
                <SourceRow
                  n={3}
                  title="Dataset · v1_cohort_feb24"
                  sub="NDI Cloud · 22 sessions · 4.8 GB"
                />
              </div>
              <div className="text-[10.5px] tracking-wide text-white/35">
                3 citations · 2 datasets · 12ms search
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-7 py-20 bg-bg-canvas">
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
        className="px-7 py-20 text-white"
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
            Get your lab&rsquo;s knowledge queryable in about a day.
          </h2>
          <p className="text-base leading-relaxed text-white/75 mb-8 m-0">
            LabChat runs on dedicated infrastructure per lab. We handle setup,
            ingest your corpus, and hand you a URL your team can start using
            right away.
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

function CapCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-xl p-7 shadow-sm">
      <h3 className="text-[1.25rem] font-bold text-fg-primary leading-tight mb-3 m-0">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-fg-secondary m-0">{body}</p>
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

/**
 * Inline citation pill — superscript number badge in the LabChat AI bubble.
 *
 * Source `.citePill` uses `var(--brand-blue)` (#17a7ff) on white text —
 * the citations carry the same blue accent as the data-discovery hero
 * eyebrow on every other product page. Earlier port used teal which read
 * as a separate "products page" accent and broke the visual through-line.
 * Using inline `style.background` rather than a Tailwind class because
 * the rendered span sits inside dark-bubble translucency where any
 * dimming from the bubble alpha breaks the color contract.
 */
function CitePill({ n }: { n: number }) {
  return (
    <sup
      className="inline-flex items-center justify-center text-white text-[9px] font-bold rounded px-1 py-px ml-0.5 align-super"
      style={{ background: 'var(--color-brand-blue)' }}
    >
      {n}
    </sup>
  );
}

/**
 * Source-row inside the AI bubble's reference list — numbered circle +
 * title + monospaced subtitle. Inside the dark chat preview surface, so
 * tile bg is white@3%, title is white, sub is white/45 monospace.
 * Source `.srcN { background: var(--brand-blue) }` — circle color matches
 * the inline CitePill so the number visually links.
 */
function SourceRow({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-md text-[12.5px]"
      style={{ background: 'rgba(255, 255, 255, 0.03)' }}
    >
      <div
        className="shrink-0 w-5 h-5 rounded-full text-white font-bold inline-flex items-center justify-center text-[10px]"
        style={{ background: 'var(--color-brand-blue)' }}
      >
        {n}
      </div>
      <div>
        <div className="text-white font-medium mb-0.5">{title}</div>
        <div className="font-mono text-[10.5px] text-white/45">{sub}</div>
      </div>
    </div>
  );
}

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

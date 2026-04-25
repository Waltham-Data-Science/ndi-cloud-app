/**
 * AuthSplitLayout — two-panel auth shell for /login and /create-account.
 *
 * Source-faithful port of `ndi-web-app-wds/app/src/styles/Home.module.scss`
 * `.authPage` + `.authMarketingSide` + `.authFormSide`. The original
 * Phase 2b port flattened these two pages onto the centered `<AuthCard>`
 * shell shared with the other 7 auth pages, dropping the marketing
 * panel entirely. The audit (Phase 6.6) flagged this as a P0 marketing
 * regression — login/create-account are funnel-conversion surfaces and
 * the marketing panel carries the product justification copy.
 *
 * Layout:
 *   - Desktop (≥900px): horizontal split. Left half is the dark
 *     `var(--grad-depth)` marketing panel; right half is the white form
 *     panel. Both flex-1 → 50/50 split. min-height: calc(100vh - 51px)
 *     to fill the viewport minus the sticky header (`Header` is 51px).
 *   - Mobile (<900px): stacks vertically. Marketing panel collapses to
 *     a 3rem-padded band on top, form panel stacks below.
 *
 * Marketing panel decorations (per source `.authMarketingSide` SCSS):
 *   - `::before` pseudo: NDI brandmark pattern repeating @ 120px, 5%
 *     opacity. Rendered as an absolutely-positioned div with
 *     `aria-hidden`.
 *   - `::after` pseudo: 500×500 radial-gradient blue glow at the
 *     bottom-right corner. Same pattern, separate aria-hidden div.
 *
 * Eyebrow + halo dot match the home/labchat hero pattern shipped in
 * #21/#22: pill on `rgba(23,167,255,0.12)`, `tracking-[0.16em]`,
 * brand-blue-3 text, dot with 3px halo box-shadow.
 *
 * Pure RSC — works in Server Components by default. The form-side
 * children carry their own 'use client' directive when interactive.
 */
import type { ReactNode } from 'react';

export type AuthSplitLayoutProps = {
  /** Marketing-side eyebrow text — uppercase, brand-blue, pill bg. */
  marketingEyebrow: string;
  /**
   * Marketing-side h2 — accepts ReactNode so callers can wrap the
   * accent word(s) in `<em>` for the brand-blue color treatment.
   * Source uses `<em>` with `font-style: normal; color: var(--brand-blue);`.
   */
  marketingTitle: ReactNode;
  /** Marketing-side subtitle paragraph. */
  marketingSubtitle: ReactNode;
  /**
   * Marketing-side feature checklist. 3 items typical (matches source).
   * Each renders as a check-icon + text row, ndi-teal SVG.
   */
  marketingFeatures: ReactNode[];
  /** Form-side children — heading + subtext + form. */
  children: ReactNode;
};

export function AuthSplitLayout({
  marketingEyebrow,
  marketingTitle,
  marketingSubtitle,
  marketingFeatures,
  children,
}: AuthSplitLayoutProps) {
  return (
    <main className="flex min-h-[calc(100vh-51px)] w-full max-[900px]:flex-col max-[900px]:min-h-0">
      {/* Marketing panel — left half on desktop, top band on mobile. */}
      <section
        className="relative flex-1 flex flex-col justify-center text-white px-14 py-16 overflow-hidden max-[900px]:px-8 max-[900px]:py-12"
        style={{ background: 'var(--grad-depth)' }}
      >
        {/* Brandmark pattern overlay (.authMarketingSide::before). */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{
            backgroundImage: "url('/logos/ndicloud-mark-color.svg')",
            backgroundSize: '120px',
            backgroundRepeat: 'repeat',
          }}
        />
        {/* Bottom-right blue radial glow (.authMarketingSide::after). */}
        <div
          aria-hidden
          className="absolute pointer-events-none w-[500px] h-[500px] rounded-full -bottom-[200px] -right-[150px]"
          style={{
            background:
              'radial-gradient(circle, rgba(23, 167, 255, 0.15) 0%, transparent 70%)',
          }}
        />
        <div className="relative z-10 max-w-[480px] mx-auto w-full">
          <div
            className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-brand-blue-3 mb-5 px-3.5 py-1.5 rounded-pill"
            style={{ background: 'rgba(23, 167, 255, 0.12)' }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue-3"
              style={{ boxShadow: '0 0 0 3px rgba(93, 193, 255, 0.25)' }}
            />
            {marketingEyebrow}
          </div>
          <h2 className="font-display text-[2.5rem] max-[768px]:text-[2rem] font-extrabold leading-[1.08] tracking-tight text-white mb-4 m-0 [text-wrap:balance] [&_em]:not-italic [&_em]:text-brand-blue">
            {marketingTitle}
          </h2>
          <p className="text-[1.05rem] leading-[1.55] text-white/[0.78] max-w-[440px] mb-8 m-0">
            {marketingSubtitle}
          </p>
          <ul className="list-none p-0 m-0 flex flex-col gap-3">
            {marketingFeatures.map((feature, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-[0.92rem] leading-[1.5] text-white/85"
              >
                <svg
                  aria-hidden
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 mt-[3px] text-ndi-teal"
                >
                  <polyline points="4 9 8 13 14 5" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Form panel — right half on desktop, bottom on mobile. */}
      <section className="flex-1 flex flex-col items-center justify-center px-8 py-12 bg-bg-surface max-[900px]:px-6 max-[900px]:py-10">
        <div className="w-full max-w-[22rem]">{children}</div>
      </section>
    </main>
  );
}

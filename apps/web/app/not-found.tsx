import Link from 'next/link';
import type { Metadata } from 'next';

import { Footer } from '@/components/marketing/Footer';
import { Header } from '@/components/marketing/Header';

/**
 * Custom 404 page (Next 16 file convention).
 *
 * Next.js's default bare-HTML "Page Not Found" looks unlike the rest of
 * the site and leaks Next.js branding — bad for SEO, worse for the
 * "one-product" story for the apex domain. This replaces it with the
 * dark depth-gradient hero from the source repo, two CTAs (home + Data
 * Commons, both same-origin post-unification), and the standard Footer.
 *
 * # Why this file imports `<Header />` directly
 *
 * Audit 2026-04-27 #9 added `<Header />` here because Next.js does NOT
 * mount route group layouts for URL-miss cases (e.g. `/qwerty`,
 * `/my/wrong-subroute`). Empirically verified post-Bug-1: production
 * `/qwerty` and `/my/wrong-subroute` both render the global
 * `app/not-found.tsx` directly inside the root `app/layout.tsx`
 * WITHOUT entering any route group's layout — one nav element, one
 * main, no group chrome. Without the Header import here, those URL-
 * miss pages would have no top navigation at all.
 *
 * The earlier "duplicate Header on /datasets/bad-id" symptom (visible
 * in `verify-06-bad-id-fixed-but-shows-global-not-found.png`) had a
 * different cause: `notFound()` thrown from INSIDE a layout
 * (`[id]/layout.tsx`) bubbled up, but the parent `(app)/layout.tsx`
 * had already rendered successfully — so Next.js stacked the (app)
 * layout's Header on top of this global not-found's Header. That's
 * fixed in Bug 1 by moving `notFound()` from the layout to the page,
 * which routes the dataset-bad-id case to the dataset-scoped
 * `[id]/not-found.tsx` (no Header import there) — leaving exactly
 * one Header from the (app) layout above.
 *
 * Net result: every 404 path gets exactly one Header, sourced from
 * either the route group's layout (in-group 404s) or this file
 * (URL-miss 404s).
 */
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main
        className="relative overflow-hidden flex items-center justify-center text-white px-7 py-20 min-h-[calc(100vh-320px)]"
        style={{ background: 'var(--grad-depth)' }}
      >
        {/* Subtle wordmark watermark (4% opacity) for atmosphere — same
            as the source repo's not-found design. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage: "url('/logos/ndicloud-mark-color.svg')",
            backgroundSize: '120px',
            backgroundRepeat: 'repeat',
          }}
        />
        <div className="relative max-w-[640px] text-center">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-white/60 mb-4">
            404 · Page not found
          </div>
          <h1
            className="font-display font-extrabold leading-[1.1] tracking-tight text-white mb-3.5 m-0"
            style={{ fontSize: 'clamp(2rem, 5vw, 2.75rem)' }}
          >
            We can&rsquo;t find that page.
          </h1>
          <p className="text-base leading-relaxed text-white/75 mb-7">
            The URL may have moved. If you followed a bookmark to a legacy
            data-browser route (<code>/search</code>, <code>/advancedSearch</code>,{' '}
            <code>/bookmarks</code>), the redirects in <code>next.config.ts</code>{' '}
            should have carried you to the new same-origin route. If you landed
            here instead, use the links below.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/"
              className="inline-flex items-center px-5 py-2.5 rounded-lg bg-ndi-teal text-white font-semibold text-sm no-underline shadow-cta hover:-translate-y-px transition-transform duration-(--duration-base) ease-(--ease-out)"
            >
              Back to home
            </Link>
            <Link
              href="/datasets"
              className="inline-flex items-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold text-sm no-underline hover:bg-white/8 transition-colors duration-(--duration-base) ease-(--ease-out)"
            >
              Go to Data Commons →
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

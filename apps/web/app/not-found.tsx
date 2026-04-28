import Link from 'next/link';
import type { Metadata } from 'next';

import { Footer } from '@/components/marketing/Footer';

/**
 * Custom 404 page (Next 16 file convention).
 *
 * Next.js's default bare-HTML "Page Not Found" looks unlike the rest of
 * the site and leaks Next.js branding — bad for SEO, worse for the
 * "one-product" story for the apex domain. This replaces it with the
 * dark depth-gradient hero from the source repo, two CTAs (home + Data
 * Commons, both same-origin post-unification), and the standard Footer.
 *
 * # Why no `<Header />` import here
 *
 * Audit 2026-04-27 #9 originally added `<Header />` because the audit
 * believed Next 16 mounts root `not-found.tsx` OUTSIDE any route
 * group layout. Empirical verification (production screenshot
 * `verify-06-bad-id-fixed-but-shows-global-not-found.png`) showed
 * the OPPOSITE: when `notFound()` is triggered from inside a route
 * group (e.g. the (app) group's dataset detail layout), Next.js
 * renders this global 404 INSIDE the (app) group's chrome — which
 * already provides its own `<Header />`. Importing `<Header />`
 * here produced a duplicate.
 *
 * Removing it from the global not-found leaves the route group's
 * Header intact for the common case (a 404 inside a matched route
 * group). After Bug 1 (architectural fix), dataset-bad-id 404s now
 * route to the dataset-scoped `[id]/not-found.tsx` instead — so this
 * file primarily handles truly-unmatched URLs. For those, the
 * marketing/app group layouts above still render their `<Header />`.
 *
 * The Footer stays since it's purely presentational (no auth-aware
 * affordances) and provides additional navigation paths for users
 * who landed on a broken URL.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
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

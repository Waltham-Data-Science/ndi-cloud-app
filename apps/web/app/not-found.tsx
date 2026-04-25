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
 * The Header is intentionally NOT rendered here — Next 16 mounts the
 * root not-found.tsx OUTSIDE the (marketing) route group's layout, so
 * we don't get the marketing chrome by default. Adding it would mean
 * re-importing here. Keeping the page minimal (Footer only) matches the
 * source repo's UX and reads as a clear "you've gone off the path."
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

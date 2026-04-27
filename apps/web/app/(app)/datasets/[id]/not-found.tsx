import Link from 'next/link';

/**
 * Dataset-specific not-found page.
 *
 * Rendered by Next.js when the sibling `layout.tsx` calls
 * :func:`notFound` (which it does on a clean 404 from
 * `/api/datasets/:id`). Sits one level deeper than the root
 * `app/not-found.tsx`, so it overrides for the `/datasets/[id]/*`
 * subtree only — keeping the global 404 untouched for everything
 * else.
 *
 * # Why a dataset-scoped not-found
 *
 * Audit 2026-04-27 #10 — pre-fix, a bad `[id]` (legacy deeplink,
 * typo, deleted dataset) rendered the dataset chrome (hero with
 * bare id as h1 + tab bar + body error). That visually suggests
 * the dataset exists. With layout-level `notFound()` the chrome
 * never mounts; THIS page is what the user sees instead. Copy is
 * tighter than the global 404 because we know the user clicked a
 * dataset link — they're trying to read a specific dataset, not
 * randomly browsing.
 *
 * Server-rendered (no `'use client'`). Static — no per-id branch.
 */
export default function DatasetNotFound() {
  return (
    <section
      className="relative overflow-hidden text-white"
      style={{ background: 'var(--grad-depth)' }}
    >
      <div className="relative mx-auto max-w-[640px] px-7 py-16 text-center">
        <div className="text-xs font-bold tracking-eyebrow uppercase text-white/60 mb-4">
          404 · Dataset not found
        </div>
        <h1
          className="font-display font-extrabold leading-[1.1] tracking-tight text-white mb-3.5 m-0"
          style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)' }}
        >
          That dataset isn&rsquo;t here.
        </h1>
        <p className="text-base leading-relaxed text-white/75 mb-7">
          The dataset may have been moved, unpublished, or never existed at
          this URL. If you arrived from an older NDI Data Browser link, the
          ID may have changed; the Data Commons listing has every published
          dataset.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/datasets"
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-ndi-teal text-white font-semibold text-sm no-underline shadow-cta hover:-translate-y-px transition-transform duration-(--duration-base) ease-(--ease-out)"
          >
            Browse Data Commons
          </Link>
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 rounded-lg border border-white/20 text-white font-semibold text-sm no-underline hover:bg-white/8 transition-colors duration-(--duration-base) ease-(--ease-out)"
          >
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}

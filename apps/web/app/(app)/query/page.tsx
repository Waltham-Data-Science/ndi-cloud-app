/**
 * `/query` — cross-cloud query page.
 *
 * Phase 3e structural shell. The full content port (FacetPanel +
 * QueryBuilder + OutputShapePreview, ~750 LOC of data-browser
 * components) lands as a follow-up — this PR closes Phase 3 by giving
 * /query a routed home with the proper hero + chrome so it surfaces in
 * the sitemap and the (app) layout wraps it. Phase 3a-3d closed the
 * three migration-absorbed audits (#65, #64, #66) which is the
 * critical unblock for Phase 4.
 *
 * The page is a Server Component for the hero band; the interactive
 * query builder will be wrapped in `next/dynamic({ ssr: false })` when
 * the content port lands (the AST visualizer is heavy + below-the-fold,
 * matches the audit #52 component-level split rationale).
 */
import type { Metadata } from 'next';

import { QueryShell } from './query-shell';

export const metadata: Metadata = {
  title: 'Query · NDI Cloud',
  description:
    'Cross-dataset query: filter by species, brain region, probe, subject, session, epoch across every dataset on NDI Cloud.',
  alternates: { canonical: '/query' },
};

export default function QueryPage() {
  return (
    <>
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'var(--grad-depth)' }}
        aria-labelledby="query-hero-h1"
      >
        <div className="relative mx-auto max-w-[1200px] px-7 py-12 md:py-14">
          <div className="text-xs font-bold tracking-eyebrow uppercase text-white/55 mb-4">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ndi-teal mr-2 align-middle" />
            NDI QUERY · BETA
          </div>
          <h1
            id="query-hero-h1"
            className="text-white font-display font-extrabold tracking-tight leading-tight text-[2rem] md:text-[2.25rem] mb-2"
          >
            Query across every dataset.
          </h1>
          <p className="text-white/70 text-[14.5px] leading-relaxed max-w-[620px]">
            Filter by species, brain region, probe, subject, session, epoch.
            Every field search auto-narrows to the class, so queries stay fast
            even across public datasets. Filters default to{' '}
            <code className="font-mono text-[13px] text-white/85">contains</code>{' '}
            (case-insensitive) — matches the NDI-matlab tutorial convention.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-7 py-7">
        <QueryShell />
      </section>
    </>
  );
}

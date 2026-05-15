import type { Metadata } from 'next';

import { askEnabled } from '@/lib/ai/feature-flag';

import { MyAskClient } from './my-ask-client';

/**
 * /my/ask — authenticated-only entry to the experimental chat.
 *
 * Stream 3.1 (2026-05-15) route migration. The experimental
 * `/(marketing)/ask` route stays live during the transition for the
 * anonymous-public preview; this new auth-gated route is where the
 * chat lands once Stream 3.2-3.4 (per-user cost tracking + Vercel KV
 * rate limit + per-org `enable_ask` flag) all enforce.
 *
 * Server-side feature-flag gate (`askEnabled()` reads
 * `ANTHROPIC_API_KEY`) returns a "coming soon" notice when the env
 * var is unset. The auth gate + `canUseAsk` check fire client-side
 * in `MyAskClient` — same pattern as `/my/workspace/[id]`.
 */
export const metadata: Metadata = {
  title: 'Ask · workspace',
  description:
    'Experimental chat for paying users — query the NDI Commons catalog and surface in-flight signals, behavior, and provenance.',
  robots: { index: false, follow: false },
};

export default function MyAskPage() {
  if (!askEnabled()) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-[24px] font-semibold text-fg-primary">Ask</h1>
        <p className="mt-3 text-[15px] text-fg-secondary">
          Coming soon — this chat preview isn&apos;t enabled in this
          environment.
        </p>
      </div>
    );
  }
  return <MyAskClient />;
}

/**
 * /ask — experimental chat preview.
 *
 * Server Component shell. Gates on `askEnabled()` server-side: if
 * `ANTHROPIC_API_KEY` is unset, render a "Coming soon" notice
 * instead of the chat shell. (The /api/ask route ALSO gates with
 * 503 — defense in depth.)
 *
 * generateMetadata is intentionally bare — this is a preview page,
 * not part of marketing SEO. noindex.
 */
import type { Metadata } from 'next';

import { AskShell } from './ask-shell';
import { askEnabled } from '@/lib/ai/feature-flag';

export const metadata: Metadata = {
  title: 'Ask the Commons (preview) — NDI Cloud',
  description:
    'Experimental chat interface for the NDI Commons published-dataset catalog.',
  robots: { index: false, follow: false },
};

export default function AskPage() {
  if (!askEnabled()) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h1 className="text-[24px] font-semibold text-gray-900">Ask the Commons</h1>
        <p className="mt-3 text-[15px] text-gray-500">
          Coming soon — this chat preview isn&apos;t enabled in this environment.
        </p>
      </div>
    );
  }

  return <AskShell />;
}

/**
 * Scoped not-found for /ask. Used when a future sub-route under /ask
 * is intentionally removed but we still want a friendly fallback
 * (rather than the global /not-found which is marketing-styled).
 *
 * Today there are no sub-routes; this is defensive scaffolding.
 */
import Link from 'next/link';

export default function AskNotFound() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-20 text-center">
      <h1 className="text-[24px] font-semibold text-gray-900">Not found</h1>
      <p className="mt-3 text-[15px] text-gray-500">
        Try the chat preview at{' '}
        <Link href="/ask" className="text-brand-blue underline">/ask</Link>.
      </p>
    </div>
  );
}

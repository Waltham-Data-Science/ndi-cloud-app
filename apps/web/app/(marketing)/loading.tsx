/**
 * Marketing route group loading skeleton.
 *
 * Shown by Next.js's automatic Suspense boundary while a route segment's
 * RSC payload streams. Today's marketing pages are static prerenders so
 * this rarely fires; it matters for routes that use `useSearchParams()`
 * (account-exists) or `cookies()` server-side. Keeps a deliberate
 * minimal style — a thin progress strip across the top — rather than a
 * full-page card skeleton because the marketing chrome (Header/Footer)
 * is rendered around this from layout.tsx and a heavy skeleton would
 * fight the chrome visually.
 */
export default function MarketingLoading() {
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-label="Loading"
      className="relative overflow-hidden h-1 bg-bg-muted"
    >
      <span
        className="absolute inset-y-0 left-0 w-1/3 bg-ndi-teal animate-[loading-bar_1.4s_ease-in-out_infinite]"
        style={{
          // The keyframe is small enough to inline rather than register
          // a global animation; Tailwind v4 supports custom @keyframes
          // declarations via `@theme` but for a one-off it's simpler here.
        }}
      />
      <style>{`
        @keyframes loading-bar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

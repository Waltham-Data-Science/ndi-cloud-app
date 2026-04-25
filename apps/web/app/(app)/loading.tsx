/**
 * App route group loading skeleton.
 *
 * Same minimal progress-bar pattern as the marketing variant — Phase 3a
 * may swap this for a route-aware skeleton (e.g., a dataset-card grid
 * skeleton on /datasets) once the data-browser pages have shipped and
 * we know what the loading shape should look like per route. For now
 * the thin teal bar tells the user something is happening without
 * promising specific layout.
 */
export default function AppLoading() {
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-label="Loading"
      className="relative overflow-hidden h-1 bg-bg-muted"
    >
      <span className="absolute inset-y-0 left-0 w-1/3 bg-ndi-teal animate-[loading-bar_1.4s_ease-in-out_infinite]" />
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

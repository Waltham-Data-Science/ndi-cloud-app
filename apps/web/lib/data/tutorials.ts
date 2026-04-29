/**
 * Tutorial autodiscovery — HEAD-probe the published-tutorials S3 bucket
 * to determine whether the Tutorials tab + view should render for a
 * given dataset.
 *
 * # Why a HEAD probe instead of a hardcoded allowlist
 *
 * PR #130 shipped the Tutorials tab gated on a literal `Set<string>`
 * of two dataset ids — the two datasets we knew shipped a published
 * `.mlx`/`.ipynb` companion at the time. That worked but was the wrong
 * shape: the legacy NDI Cloud SPA (`Waltham-Data-Science/ndi-web-app`)
 * autodiscovers the tutorial via a HEAD request against the same S3
 * bucket, so any dataset the data team uploads to
 * `ndi-cloud-tutorials.s3.us-east-2.amazonaws.com` lights up there
 * without a code change. On the new site, the same datasets — Bhar's
 * was the surfaced example — would have a Tutorials tab on legacy but
 * not here, until somebody remembered to edit the allowlist.
 *
 * The HEAD probe matches legacy behavior, decouples the tab gate from
 * code-deploy cycles, and the cost is a single ~200-byte S3 HEAD per
 * dataset detail load (cached for 5 minutes by TanStack Query, so
 * subsequent navigations within a session reuse the result).
 *
 * # Probe semantics
 *
 *   - Two HEAD requests in parallel (one per language: `.mlx`,
 *     `.ipynb`). S3's public bucket returns 200 if the object exists,
 *     403/404 otherwise. CORS is enabled on the bucket — a HEAD with
 *     `mode: 'cors'` returns the status without preflight bloat.
 *   - Network failures collapse to "unavailable" rather than retrying.
 *     The Tutorials tab is non-critical chrome; a transient S3 hiccup
 *     should hide the tab cleanly, not surface a spinner or error
 *     toast. `retry: false` on the query enforces this.
 *   - Cached for 5 minutes (`staleTime`). Tutorial files are rarely
 *     uploaded mid-session and S3 propagation is fast; the cache
 *     window keeps hot navigations between dataset tabs free of
 *     re-probes.
 *   - GC after 30 minutes — long enough to span a typical session,
 *     short enough that a tab left open all day eventually re-probes.
 *
 * # Why the URL-builder helpers stay co-located here
 *
 * `TutorialView.tsx` constructs the same S3 URLs to populate the
 * iframe + download links. Keeping the path scheme in one module
 * means a future filename-scheme change (e.g., `tutorial_<id>.mlx`
 * → `tutorials/<id>/matlab.mlx`) is a single-file edit. The
 * helpers are pure string functions and tree-shake away on the
 * server (the module's other consumer is the client component, but
 * importing the URL helpers is free either way).
 */
'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * Public S3 bucket holding pre-rendered MATLAB Live Scripts (.mlx)
 * and Python notebooks (.ipynb). The Tutorials tab assumes the
 * filename scheme `tutorial_<datasetId>.<ext>` — change all four
 * URL helpers below in lockstep if the data team renames the
 * pattern.
 */
const TUTORIAL_BUCKET = 'https://ndi-cloud-tutorials.s3.us-east-2.amazonaws.com';

/**
 * Result of the HEAD probe — split per format so `TutorialView` can
 * disable the unavailable language pill, with `hasAny` as the
 * convenience for the `DatasetTabs` gate.
 */
export interface TutorialAvailability {
  hasMatlab: boolean;
  hasPython: boolean;
  hasAny: boolean;
}

/**
 * Build the source-download URL for a given dataset + language.
 * Exported so `TutorialView` can use the same path scheme without
 * duplicating the `tutorial_<id>.<ext>` literal across files.
 */
export function tutorialMatlabUrl(datasetId: string): string {
  return `${TUTORIAL_BUCKET}/tutorial_${datasetId}.mlx`;
}

export function tutorialPythonUrl(datasetId: string): string {
  return `${TUTORIAL_BUCKET}/tutorial_${datasetId}.ipynb`;
}

/**
 * HEAD-probe one URL. Returns `true` for any 2xx, `false` otherwise
 * (including network errors). The wrapper guarantees no thrown
 * exceptions so the parallel `Promise.all` below never short-circuits
 * on a single transient failure.
 */
async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', mode: 'cors' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * `useTutorialAvailability` — TanStack Query wrapper that HEAD-probes
 * the MATLAB and Python tutorial files in parallel and reports which
 * (if any) exist for the dataset.
 *
 * Consumers:
 *   - `DatasetTabs` reads `data?.hasAny` to decide whether to render
 *     the Tutorials tab. While the query is loading, the tab is
 *     hidden — that's the right UX (no flicker once the probe
 *     resolves; the alternative is a skeleton tab that looks broken).
 *   - `TutorialView` reads `hasMatlab` / `hasPython` to enable the
 *     respective language pills and to render the empty state if
 *     both are missing.
 *
 * One probe per dataset id — the query cache key includes the id, so
 * consumers in the same dataset detail tree share the result without
 * re-fetching.
 */
export function useTutorialAvailability(datasetId: string | null | undefined) {
  return useQuery<TutorialAvailability>({
    queryKey: ['tutorial-availability', datasetId],
    enabled: Boolean(datasetId),
    queryFn: async () => {
      // datasetId is non-null here per the `enabled` guard, but
      // TypeScript doesn't narrow through the gate so guard again.
      if (!datasetId) {
        return { hasMatlab: false, hasPython: false, hasAny: false };
      }
      const [hasMatlab, hasPython] = await Promise.all([
        probeUrl(tutorialMatlabUrl(datasetId)),
        probeUrl(tutorialPythonUrl(datasetId)),
      ]);
      return { hasMatlab, hasPython, hasAny: hasMatlab || hasPython };
    },
    // Cache for 5 minutes — S3 doesn't change mid-session and the
    // probe is cheap enough that staleness here is purely a UX win
    // (no re-probe on tab navigation). 30-minute GC keeps a long-
    // open tab eventually re-discovering newly-uploaded tutorials.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Non-critical chrome — hide cleanly on probe failure rather
    // than hammering S3 with retries.
    retry: false,
    refetchOnWindowFocus: false,
  });
}

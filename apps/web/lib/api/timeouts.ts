/**
 * Centralized API timeout constants.
 *
 * # Why this module exists
 *
 * Pre-extract: 9 timeout constants lived in 6 different files, each
 * with its own rationale captured in a per-file docstring. The values
 * ranged from 1.5s to 120s and were tuned for specific endpoints (the
 * dataset existence check is tight at 1.5s because it gates
 * `loading.tsx`; the class-counts call is 120s because some datasets
 * legitimately take 90+ seconds to enumerate). Each value was
 * correct, but the architectural visibility was poor — answering
 * "what's our SLO for X?" required a grep across the api/ folder.
 *
 * Post-extract: every API timeout lives here. Each constant retains
 * its rationale comment so changing a value remains an informed
 * decision, not a guess. Consumers import the named constant; no more
 * per-file magic numbers.
 *
 * # Naming convention
 *
 * `<USE_CASE>_TIMEOUT_MS` — describes the API call or fetch path,
 * not the file it lives in. Existing names were preserved verbatim
 * where they were unambiguous (e.g. `CLASS_COUNTS_TIMEOUT_MS`) and
 * disambiguated where they collided (the previously-named
 * `FETCH_TIMEOUT_MS` in two files became
 * `DATASET_DETAIL_FETCH_TIMEOUT_MS` and `PREFETCH_TIMEOUT_MS`).
 *
 * # When to change a value
 *
 * Always cite empirical evidence in the commit message. The current
 * values were tuned against production datasets:
 *   - Bhar / Francesconi / Reikersdorfer detail records: ~300-700ms
 *   - Griswold (Premature vision) detail: ~2.1s
 *   - Tree shrew (`66140c237dbc358954ddffb9`) detail: ~19s on cold
 *     cache (oversized record, on Steve's plate to slim)
 *   - Class-counts on Haley/Dabrowska CRH: ~88-90s pre-optimization
 *     (now ~12s after Steve's `$lookup` removal, but the 120s budget
 *     is the safety net for the unoptimized path)
 *
 * Don't tighten a budget without evidence that ALL production
 * datasets currently in scope finish within the new ceiling. The
 * tree-shrew case proves we have at least one record outside the
 * shared 8s budget — the fetch-hero path accepts the bare-id
 * fallback for that single edge case rather than ballooning the
 * budget for every dataset.
 */

// ─── Server-side dataset fetches ───────────────────────────────────

/**
 * Detail-fetch ceiling for the hero RSC, `generateMetadata`, and the
 * JSON-LD builder. 8s covers ~99% of datasets (Griswold at 2.1s lands
 * cleanly; tree-shrew at ~19s is the documented edge case that falls
 * back to bare-id).
 *
 * Bumped from 1.5s in the round-5 review (Griswold's 2.9MB record was
 * always timing out, hero rendered bare NDI id). See
 * `lib/api/datasets-server.ts` for the request flow.
 */
export const DATASET_DETAIL_FETCH_TIMEOUT_MS = 8_000;

/**
 * Tight ceiling for the existence-check fetch in `prefetchDatasetForPage`.
 * This is the FIRST thing we block on before rendering the dataset
 * detail page — its latency directly delays `loading.tsx` from firing.
 * 1.5s is generous enough for warm-cache responses (~300ms typical)
 * and tight enough that a cold endpoint can't stall navigation
 * indefinitely.
 *
 * On timeout, the helper returns `status: 0` which the caller treats
 * as transient (NEVER as not-found — a bad network shouldn't
 * masquerade as a missing dataset). The client `useDataset` hook
 * downstream picks up the slack with its own (longer) budget.
 */
export const EXISTENCE_CHECK_TIMEOUT_MS = 1_500;

/**
 * Per-prefetch hard ceiling for the secondary endpoints (summary,
 * provenance, class-counts) called via `prefetchDetailEndpoint`. 8s
 * is generous enough that warm Railway responses always make it into
 * the dehydrated state; whatever doesn't is filled in by the
 * client-side hook on mount.
 */
export const PREFETCH_TIMEOUT_MS = 8_000;

/**
 * Group-level deadline for the secondary-prefetch batch. The fetches
 * race against this deadline; whatever's in the QueryClient when the
 * race resolves gets dehydrated. 3s is sized for cold-but-not-
 * pathological Railway responses — beyond that, the client hooks
 * (with their own per-endpoint budgets) finish the job.
 */
export const PREFETCH_GROUP_DEADLINE_MS = 3_000;

// ─── Client-side `apiFetch` defaults ──────────────────────────────

/**
 * Default read-path timeout in `apiFetch`. Most GET requests should
 * finish well within this window; the dedicated `useClassCounts` /
 * `useSummaryTable` hooks override with their own higher budgets
 * for known-slow endpoints.
 */
export const DEFAULT_READ_TIMEOUT_MS = 15_000;

/**
 * Default mutation timeout. Write paths (POST/PUT/PATCH/DELETE) get
 * a more generous budget because they often involve a synchronous
 * Mongo write that's slower than the read paths. Auth flows pay
 * roughly this much on a cold start.
 */
export const DEFAULT_MUTATION_TIMEOUT_MS = 30_000;

// ─── Per-endpoint hook timeouts ───────────────────────────────────

/**
 * Single-dataset detail hook (`useDataset`). 60s is the legacy
 * "data-browser ported" ceiling and is rarely hit; treat it as a
 * safety net for cold-cache pathological cases.
 */
export const DATASET_DETAIL_TIMEOUT_MS = 60_000;

/**
 * Per-class document-count enumeration (`useClassCounts`). The
 * highest budget in the codebase because some datasets (Haley,
 * Dabrowska CRH-3) genuinely take 90+ seconds on cold cache to
 * enumerate. Steve's `$lookup` removal optimization brought the
 * typical case to ~12s; the 120s budget remains as the safety net
 * for unoptimized data paths.
 */
export const CLASS_COUNTS_TIMEOUT_MS = 120_000;

/**
 * Summary-table fetches (`useSummaryTable`). 60s covers all known
 * grains across the catalog. Tighten if profiling shows everything
 * lands faster.
 */
export const TABLE_TIMEOUT_MS = 60_000;

/**
 * Documents-list pagination fetches (`useDocumentsInfinite`,
 * `useDocuments`). 60s mirrors the table timeout — same SLO class.
 */
export const DOCUMENTS_TIMEOUT_MS = 60_000;

/**
 * Raw binary document fetches (binary cells, blob downloads).
 * Equivalent SLO to documents/tables but the request body shape is
 * different (binary stream rather than JSON), and the typical
 * payload size is larger.
 */
export const RAW_FETCH_TIMEOUT_MS = 60_000;

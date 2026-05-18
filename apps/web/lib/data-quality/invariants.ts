/**
 * Dataset-health invariants.
 *
 * Stream 6.7 deliverable (2026-05-15). Codifies the structural
 * relationships every NDI dataset is expected to honor as a set of
 * pure-function checks. Each invariant takes a normalized dataset
 * summary and returns either `null` (passes) or a `Violation` with
 * the failing observation. A nightly cron (Stream 6.8) will scan
 * every published dataset against this set and persist violations to
 * Postgres; the admin page at `/admin/data-health` (Stream 6.9) reads
 * those rollups; the catalog UI badges datasets failing one or more
 * invariants (Stream 6.10).
 *
 * Adding a new invariant
 * ──────────────────────
 * 1. Add a new entry to the `INVARIANTS` array below.
 * 2. Each entry is `{ key, label, severity, check }` where `check`
 *    is a pure function of `DatasetSummaryFacts` returning `null` on
 *    pass OR a violation `{ message, observation }` on fail.
 * 3. Add a unit test in `tests/unit/lib/data-quality/invariants.test.ts`.
 *
 * Why pure functions
 * ──────────────────
 * No network, no I/O, no clock. The cron pulls each dataset's summary
 * once and feeds it into every invariant — fast and deterministic.
 * Adding an invariant that needs additional data (e.g. cross-class
 * counts) means extending `DatasetSummaryFacts` first, then adding
 * the check. Keeps the inventory honest: an invariant either works
 * off the standard facts surface or surfaces a schema change.
 */

/**
 * Normalized facts about a dataset, sourced from
 * `GET /api/datasets/:id/summary` + `GET /api/datasets/:id/class-counts`.
 * Add fields here as new invariants need them.
 */
export interface DatasetSummaryFacts {
  datasetId: string;
  datasetName: string;
  /** Curated species labels (after the openminds → ontology mapping). */
  species: readonly string[];
  /** Curated brain-region labels. */
  brainRegions: readonly string[];
  /** Curated strain labels. */
  strains: readonly string[];
  totalDocuments: number;
  /** Counts per top-level class. May omit classes that have 0 docs. */
  classCounts: Readonly<Record<string, number>>;
  /** Synthesized counts (sessions, subjects, elements, epochs, probes). */
  derivedCounts: {
    sessions: number;
    subjects: number;
    elements: number;
    epochs: number;
    probes: number;
  };
}

export type Severity = 'info' | 'warning' | 'critical';

export interface Violation {
  /** Stable, machine-friendly identifier (logged + cron-stored). */
  key: string;
  /** Human-friendly label shown in the admin UI. */
  label: string;
  severity: Severity;
  /** Single-line message describing the violation for this dataset. */
  message: string;
  /** Raw numbers / labels that triggered the violation, for debug. */
  observation: Record<string, unknown>;
}

interface Invariant {
  key: string;
  label: string;
  severity: Severity;
  check: (facts: DatasetSummaryFacts) =>
    | null
    | { message: string; observation: Record<string, unknown> };
}

/**
 * The canonical invariant set. Order is stable — the cron emits
 * violations in this order so the admin UI groups consistently.
 */
export const INVARIANTS: readonly Invariant[] = [
  {
    key: 'totalDocuments_implies_subjects',
    label: 'Datasets with documents must have at least one subject',
    severity: 'critical',
    check: ({ totalDocuments, derivedCounts }) => {
      if (totalDocuments > 0 && derivedCounts.subjects === 0) {
        return {
          message:
            `Dataset has ${totalDocuments} documents but 0 subjects — ` +
            `likely ingest mid-pipeline or a stale class-counts cache.`,
          observation: {
            totalDocuments,
            subjects: derivedCounts.subjects,
          },
        };
      }
      return null;
    },
  },
  {
    key: 'elements_imply_sessions',
    label: 'Datasets with elements must have at least one session',
    severity: 'warning',
    check: ({ derivedCounts }) => {
      const { elements, sessions } = derivedCounts;
      if (elements > 0 && sessions === 0) {
        return {
          message:
            `Dataset reports ${elements} elements but 0 sessions — per NDI's ` +
            `data model an element belongs to a recording session. Likely ` +
            `the backend's session-class fallback (currently 'session' / ` +
            `'session_in_a_dataset') is missing the spelling this dataset uses.`,
          observation: { elements, sessions },
        };
      }
      return null;
    },
  },
  {
    key: 'species_not_empty_when_subjects_present',
    label: 'Datasets with subjects should report at least one species',
    severity: 'warning',
    check: ({ species, derivedCounts }) => {
      if (derivedCounts.subjects > 0 && species.length === 0) {
        return {
          message:
            `Dataset has ${derivedCounts.subjects} subjects but empty species ` +
            `array. Likely openminds_subject → species extraction failed.`,
          observation: {
            subjects: derivedCounts.subjects,
            species,
          },
        };
      }
      return null;
    },
  },
  {
    key: 'epochs_positive_when_elements_positive',
    label: 'Datasets with elements should report at least one epoch',
    severity: 'info',
    check: ({ derivedCounts }) => {
      const { elements, epochs } = derivedCounts;
      // C. elegans datasets (Bhar) legitimately have elements without
      // epochs because they don't carry electrophysiology. We don't
      // flag this as a hard failure — info-only.
      if (elements > 0 && epochs === 0) {
        return {
          message:
            `Dataset has ${elements} elements but 0 epochs. Acceptable for ` +
            `non-electrophysiology datasets (e.g. behavioral-only C. elegans).`,
          observation: { elements, epochs },
        };
      }
      return null;
    },
  },
  {
    key: 'derived_subjects_match_class_count',
    label: 'derivedCounts.subjects must equal classCounts.subject',
    severity: 'critical',
    check: ({ classCounts, derivedCounts }) => {
      const fromClass = classCounts.subject ?? 0;
      if (fromClass !== derivedCounts.subjects) {
        return {
          message:
            `derivedCounts.subjects=${derivedCounts.subjects} disagrees with ` +
            `classCounts.subject=${fromClass} — counter drift between two ` +
            `code paths.`,
          observation: {
            derived: derivedCounts.subjects,
            fromClassCounts: fromClass,
          },
        };
      }
      return null;
    },
  },
  {
    key: 'documents_match_class_counts_sum',
    label: 'totalDocuments must equal sum of classCounts values',
    severity: 'info',
    check: ({ totalDocuments, classCounts }) => {
      const sum = Object.values(classCounts).reduce(
        (s, n) => s + (Number.isFinite(n) ? n : 0),
        0,
      );
      // Allow a small ±1 tolerance for backend-side rounding /
      // race-condition between counts and total. Anything bigger
      // signals real drift.
      if (Math.abs(totalDocuments - sum) > 1) {
        return {
          message:
            `totalDocuments=${totalDocuments} differs from sum of classCounts=${sum} ` +
            `by ${Math.abs(totalDocuments - sum)}. Likely a stale counts cache.`,
          observation: { totalDocuments, classCountsSum: sum },
        };
      }
      return null;
    },
  },
];

/**
 * Subset of `INVARIANTS` that's safe to run from a compact summary
 * (catalog-card surface): doesn't depend on raw `classCounts` or on
 * `elements` / `sessions` / `epochs` (which aren't in
 * `CompactDatasetSummary`).
 *
 * Driven by `compactSafe: true` markers below. The catalog uses these
 * via `checkCompactDatasetHealth`; the cron + admin UI use the full
 * `checkDatasetHealth` against `DatasetSummaryFacts` from
 * `/api/datasets/:id/summary` + `/class-counts`.
 *
 * Why split: the catalog ships the compact summary inline with every
 * row of `/api/datasets/published` to keep the catalog page response
 * < 100 KB. The full summary is 100 KB-class per dataset. We want the
 * badge to show up on the catalog WITHOUT a per-card fetch, so we
 * limit catalog-side checks to invariants whose inputs are already
 * inlined.
 */
const COMPACT_SAFE_KEYS = new Set<string>([
  'totalDocuments_implies_subjects',
  'species_not_empty_when_subjects_present',
]);

export function isCompactSafeInvariant(key: string): boolean {
  return COMPACT_SAFE_KEYS.has(key);
}

/**
 * Run every invariant against a single dataset's facts. Returns the
 * subset of invariants that failed.
 */
export function checkDatasetHealth(
  facts: DatasetSummaryFacts,
): Violation[] {
  const violations: Violation[] = [];
  for (const inv of INVARIANTS) {
    const result = inv.check(facts);
    if (result !== null) {
      violations.push({
        key: inv.key,
        label: inv.label,
        severity: inv.severity,
        message: result.message,
        observation: result.observation,
      });
    }
  }
  return violations;
}

/**
 * Severity ranking — used by the admin UI to sort + by the catalog UI
 * to decide what tier of badge to show.
 *
 * critical > warning > info. Returns the highest-severity violation's
 * severity, or `null` if the dataset has no violations.
 */
export function worstSeverity(
  violations: readonly Violation[],
): Severity | null {
  if (violations.length === 0) return null;
  if (violations.some((v) => v.severity === 'critical')) return 'critical';
  if (violations.some((v) => v.severity === 'warning')) return 'warning';
  return 'info';
}

/**
 * Run ONLY the compact-safe invariants. Used by the catalog card
 * surface, where the full `classCounts` + `elements` / `sessions` /
 * `epochs` aren't inlined in the API response. Always-safe inputs
 * (totalDocuments, subjects, species) drive these checks.
 *
 * Returns an empty array when the facts don't carry enough signal
 * to evaluate any invariant — never throws, never blocks rendering.
 */
export function checkCompactDatasetHealth(
  facts: DatasetSummaryFacts,
): Violation[] {
  const violations: Violation[] = [];
  for (const inv of INVARIANTS) {
    if (!COMPACT_SAFE_KEYS.has(inv.key)) continue;
    const result = inv.check(facts);
    if (result !== null) {
      violations.push({
        key: inv.key,
        label: inv.label,
        severity: inv.severity,
        message: result.message,
        observation: result.observation,
      });
    }
  }
  return violations;
}

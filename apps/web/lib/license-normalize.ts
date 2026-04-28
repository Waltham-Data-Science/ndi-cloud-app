/**
 * License-string normalization (Phase 6.7 polish, team review feedback).
 *
 * Backend cloud records carry whatever license string the dataset
 * publisher typed — `CC-BY-4.0`, `CC BY 4.0`, `CC-BY 4.0`,
 * `Creative Commons Attribution 4.0`, etc. The catalog displayed those
 * raw, so the same conceptual license rendered as different badges from
 * one dataset to the next. Reviewer flagged the inconsistency.
 *
 * This helper folds known variants to canonical SPDX identifiers
 * (https://spdx.org/licenses/) so all CC-BY-4.0 renders look the same,
 * all CC0-1.0 renders look the same, etc. Anything we don't recognise
 * falls through unchanged so the UI never blanks a real license string
 * — better to show the raw value than to drop it.
 *
 * Pure function. No I/O. Used wherever a `license` is rendered or
 * filtered (DatasetCard, DatasetOverviewCard, FacetSidebar, the
 * facet-aggregation step).
 */

/**
 * Canonical SPDX-style license names that show up in the NDI Commons.
 * Add to this list when a new license appears in the wild — keeps the
 * normaliser readable and the test fixtures focused.
 */
const CC_BY_FLAGS = ['NC', 'SA', 'ND'] as const;

export function normalizeLicense(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip "Creative Commons" prose prefix so the rest of the matcher
  // sees `Attribution 4.0` etc. uniformly with the abbreviated form.
  const noPrefix = trimmed.replace(/^creative\s+commons\s+/i, '');

  // Collapse all separators (spaces, underscores, multiple dashes) to a
  // single dash. Uppercase so the `CC` / `BY` / `NC` matches are case-
  // insensitive without scattering `.toLowerCase()` calls.
  const collapsed = noPrefix
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toUpperCase();

  // CC-BY family — matches `CC-BY-4.0`, `CC-BY-NC-4.0`,
  // `CC-BY-NC-SA-4.0`, `BY-4.0`, plus the verbose forms `Attribution
  // 4.0` (collapsed to `ATTRIBUTION-4.0`). The regex is permissive on
  // prefix (CC, ATTRIBUTION, bare BY) and order of NC/SA/ND; we
  // re-emit in canonical SPDX order (BY-NC-SA-4.0, not BY-SA-NC-4.0).
  // The `ATTRIBUTION` arm is matched separately because the verbose
  // form usually omits the `BY` shorthand entirely (`Creative Commons
  // Attribution 4.0` rather than `Creative Commons BY 4.0`).
  if (
    /^(?:CC-?|ATTRIBUTION-?)?BY/.test(collapsed) ||
    /-BY-/.test(collapsed) ||
    /^ATTRIBUTION/.test(collapsed)
  ) {
    const flags = CC_BY_FLAGS.filter((f) =>
      new RegExp(`(^|-)${f}(-|$)`).test(collapsed),
    );
    const versionMatch = collapsed.match(/(\d(?:\.\d)?)/);
    const version = versionMatch?.[1] ?? '4.0';
    const versionFull = version.includes('.') ? version : `${version}.0`;
    return `CC-BY${flags.length ? `-${flags.join('-')}` : ''}-${versionFull}`;
  }

  // CC0 — public domain dedication. Variants: `CC0`, `CC-0`, `CC0-1.0`,
  // `CC0 1.0`, `Public Domain Dedication`, `PDDC`. We canonicalise to
  // SPDX `CC0-1.0`.
  if (/^CC-?0/.test(collapsed) || /^PDDC/.test(collapsed)) {
    return 'CC0-1.0';
  }
  if (/^PUBLIC-DOMAIN/.test(collapsed)) {
    return 'CC0-1.0';
  }

  // Common code licenses — datasets occasionally borrow software
  // licenses (CC-BY-4.0 is the recommended pattern but the cloud
  // doesn't enforce). Pass-through to the SPDX form.
  if (/^APACHE-?2/.test(collapsed)) return 'Apache-2.0';
  if (/^MIT$/.test(collapsed)) return 'MIT';
  if (/^BSD-?3/.test(collapsed)) return 'BSD-3-Clause';
  if (/^BSD-?2/.test(collapsed)) return 'BSD-2-Clause';
  if (/^GPL-?3/.test(collapsed)) return 'GPL-3.0';
  if (/^GPL-?2/.test(collapsed)) return 'GPL-2.0';

  // Unknown — return the trimmed raw input. Better than `null`: the
  // user typed something meaningful, surface it.
  return trimmed;
}

/**
 * Normalize an array of license strings (e.g. the values that drive
 * the facet sidebar's checkboxes). Folds variants together — three
 * datasets with `CC-BY 4.0`, `CC-BY-4.0`, `Creative Commons Attribution 4.0`
 * collapse to one `CC-BY-4.0` chip.
 *
 * Preserves first-seen order for the canonical form, drops duplicates
 * once normalized.
 */
export function normalizeLicenseList(
  raws: ReadonlyArray<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raws) {
    const n = normalizeLicense(r);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

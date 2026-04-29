/**
 * Resolve a DOI to a clickable hyperlink.
 *
 * The cloud's `/api/datasets/:id` response is inconsistent about the
 * `doi` field shape:
 *   - Some records ship a bare DOI (e.g. `10.63884/ndic.2025.jyxfer8m`).
 *   - Some records ship a fully-qualified URL
 *     (e.g. `https://doi.org/10.63884/ndic.2025.jyxfer8m`).
 *   - The same is true for `associatedPublications[].DOI`.
 *
 * The DatasetOverviewCard previously passed the field straight to
 * `<ExternalAnchor href={ds.doi} ...>` which routes through `safeHref`.
 * `safeHref` resolves bare strings against the current origin, so a
 * bare DOI rendered on `https://ndi-cloud.com` produced
 * `https://ndi-cloud.com/10.63884/...` — the broken paper link team
 * review round-2 flagged.
 *
 * `toDoiUrl` normalizes:
 *   - bare DOIs and `doi:`-prefixed strings → `https://doi.org/<doi>`
 *   - already-`https://doi.org/...` URLs → returned unchanged
 *   - `http://dx.doi.org/...` (legacy) → upgraded to canonical https
 *   - any other input → returned unchanged so downstream `safeHref` can
 *     still validate / strip non-navigational schemes
 *
 * The function is intentionally permissive — empty/null → `undefined`
 * so callers can short-circuit before rendering the row.
 */
const DOI_REGEX = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

export function toDoiUrl(raw: string | undefined | null): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Strip a leading `doi:` prefix that some Crossref consumers emit.
  const withoutPrefix = trimmed.replace(/^doi:\s*/i, '');

  // Already a doi.org / dx.doi.org URL — canonicalize to https doi.org.
  // Use a hostname check rather than a substring contains to avoid
  // matching adversarial inputs like `https://evil.com/?u=doi.org/...`.
  try {
    const u = new URL(withoutPrefix);
    if (u.hostname === 'doi.org' || u.hostname === 'dx.doi.org') {
      // Always canonicalize to https://doi.org (the official resolver
      // host since 2016; dx.doi.org is a redirect and http: is still
      // valid but worse for caching / privacy).
      const path = u.pathname + u.search + u.hash;
      return `https://doi.org${path}`;
    }
    // Some other absolute URL — return as-is and let safeHref decide.
    return withoutPrefix;
  } catch {
    // Not a parseable URL — fall through to bare-DOI handling.
  }

  // Bare DOI shape (`10.NNNN/...`). Wrap in https://doi.org/.
  if (DOI_REGEX.test(withoutPrefix)) {
    return `https://doi.org/${withoutPrefix}`;
  }

  // Doesn't look like a DOI and isn't a parseable URL. Return the
  // trimmed input so callers can pass it through `safeHref` for the
  // final scheme check rather than silently dropping the value.
  return withoutPrefix;
}

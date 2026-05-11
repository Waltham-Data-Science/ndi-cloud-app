/**
 * schema.org/Dataset JSON-LD builder.
 *
 * Emits the structured-data document that Google Dataset Search ingests
 * (https://developers.google.com/search/docs/appearance/structured-data/dataset).
 * The shape mirrors what Google's validator accepts; we keep it
 * conservative — only fields with reliable values from the cloud record
 * are emitted, so a partial dataset doesn't poison the structured data.
 *
 * # Why this matters
 *
 * Pre-fix: `/datasets/[id]/overview` shipped per-dataset titles + canonical
 * URLs but ZERO `application/ld+json` for the Dataset entity. Without
 * `schema.org/Dataset` markup, Google Dataset Search's crawler has no
 * machine-readable signal that the page IS a dataset, so it never
 * appears in dataset-search results regardless of the dataset's
 * relevance. Generic Google web search still indexed pages by title +
 * abstract content, but specifically the dataset-discovery channel was
 * dark for us.
 *
 * # What we DON'T claim
 *
 * `Dataset.distribution[].contentUrl` is intentionally a link to the
 * `/documents` tab of the dataset — NOT the underlying NWB / MAT files.
 * Google's crawler should treat the documents browser as the
 * "distribution," not try to ingest binary files directly. If a future
 * milestone adds bulk-download URLs we add them as additional
 * `DataDownload` entries.
 *
 * `dateCreated` is omitted when the dataset record has no `createdAt`
 * value (some legacy records pre-date the column). Same for
 * `dateModified`.
 *
 * `creator[].@type === 'Person'` only when we have a first or last name;
 * otherwise we fall back to an Organization-level NDI Cloud entry. We
 * never invent a person record from a bare email or affiliation alone —
 * that would corrupt the citation graph.
 *
 * # Pure function
 *
 * No I/O, no mutation. Returns the JSON-LD object; the caller serializes
 * it inside `<script type="application/ld+json">` via
 * `dangerouslySetInnerHTML` (the standard pattern). All values are
 * derived from the input record — no `process.env`, no fetches.
 */
import type {
  AssociatedPublication,
  Contributor,
  DatasetRecord,
} from '@/lib/api/datasets';
import { toDoiUrl } from '@/lib/doi-url';
import { cleanDatasetName } from '@/lib/format';
import { normalizeLicense } from '@/lib/license-normalize';
import { SITE_ORIGIN } from '@/lib/site-config';

/**
 * Map normalized SPDX license identifiers → canonical license URLs that
 * Google Dataset Search recognises. Only common Creative Commons
 * variants are mapped today (matches what the cloud actually emits per
 * the catalog audit). Unknown identifiers return `null` and the
 * `license` field is omitted from the JSON-LD — better than emitting a
 * non-resolvable URL string.
 */
function licenseUrl(spdx: string | null): string | null {
  if (!spdx) return null;
  const map: Record<string, string> = {
    'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC-BY-NC-4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
    'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'CC-BY-ND-4.0': 'https://creativecommons.org/licenses/by-nd/4.0/',
    'CC-BY-NC-SA-4.0': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    'CC-BY-NC-ND-4.0': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
    MIT: 'https://opensource.org/licenses/MIT',
  };
  return map[spdx] ?? null;
}

/**
 * Strict variant of the canonical `toDoiUrl` for JSON-LD use. The
 * canonical helper (in `lib/doi-url.ts`) is intentionally permissive
 * — it returns the trimmed input as-is for unrecognized shapes so
 * downstream `safeHref` can decide. JSON-LD has no `safeHref` hop, so
 * we need to emit ONLY absolute `https://` URLs (otherwise Google's
 * structured-data validator rejects the document).
 *
 * This wrapper calls the canonical helper, then validates the result
 * is an absolute https URL — anything else returns `undefined` so the
 * caller short-circuits and omits the field from the JSON-LD entirely.
 *
 * Replaces a previously-duplicated local helper that re-implemented
 * the same logic with a different `null` return type (post-cutover
 * cleanup sweep 2026-04-29 — see `lib/doi-url.ts` for the canonical).
 */
function toJsonLdDoiUrl(raw: string | null | undefined): string | undefined {
  const candidate = toDoiUrl(raw ?? undefined);
  if (!candidate) return undefined;
  return candidate.startsWith('https://') ? candidate : undefined;
}

/**
 * Build a Person-level creator entry. Returns null when neither name
 * field is populated (we never invent a Person record from email
 * alone — that's not a valid creator from Google's perspective).
 */
function personFromContributor(
  c: Contributor,
): Record<string, unknown> | null {
  const first = c.firstName?.trim();
  const last = c.lastName?.trim();
  if (!first && !last) return null;
  const name = [first, last].filter(Boolean).join(' ');
  const out: Record<string, unknown> = {
    '@type': 'Person',
    name,
  };
  // ORCID is the canonical author identifier — emit when present.
  if (c.orcid) {
    out.identifier = c.orcid;
    out.sameAs = c.orcid;
  }
  if (c.contact && /@/.test(c.contact)) {
    out.email = c.contact;
  }
  return out;
}

/**
 * Build a citation entry from an associatedPublication record. Each
 * entry is a `ScholarlyArticle` with the paper's DOI (if any) and PMID
 * (as `identifier`). The title is the human-readable string the user
 * sees in the publications section of the dataset page.
 *
 * Returns `null` when the publication carries no usable identifier or
 * title — no point emitting an empty citation.
 */
function scholarlyArticleFromPublication(
  p: AssociatedPublication,
): Record<string, unknown> | null {
  const title = p.title?.trim();
  const doiUrl = toJsonLdDoiUrl(p.DOI);
  const pmid = p.PMID?.trim();
  const pmcid = p.PMCID?.trim();
  if (!title && !doiUrl && !pmid) return null;
  const out: Record<string, unknown> = {
    '@type': 'ScholarlyArticle',
  };
  if (title) out.name = title;
  if (doiUrl) {
    out.url = doiUrl;
    out['@id'] = doiUrl;
  }
  // Multiple identifiers when available — use a PropertyValue array so
  // both PMID and PMCID can coexist with the DOI in @id.
  const propertyIds: Record<string, unknown>[] = [];
  if (pmid) {
    propertyIds.push({
      '@type': 'PropertyValue',
      propertyID: 'PMID',
      value: pmid,
    });
  }
  if (pmcid) {
    // Force-prefix `PMC` since the cloud emits some records as bare
    // numeric PMCIDs (mirrors `DatasetOverviewCard` PMC link logic).
    const normalized = pmcid.startsWith('PMC') ? pmcid : `PMC${pmcid}`;
    propertyIds.push({
      '@type': 'PropertyValue',
      propertyID: 'PMCID',
      value: normalized,
    });
  }
  if (propertyIds.length > 0) {
    out.identifier = propertyIds;
  }
  return out;
}

/**
 * Combine the dataset's species + brain-region fields into a flat
 * keyword array suitable for `Dataset.keywords`. Both fields ship as
 * comma-separated strings on the cloud record — split, trim, dedupe.
 * Empty array when neither is populated.
 */
function keywordsFromRecord(d: DatasetRecord): string[] {
  const all = [
    ...(d.species?.split(',') ?? []),
    ...(d.brainRegions?.split(',') ?? []),
  ].map((k) => k.trim());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of all) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Build the `schema.org/Dataset` JSON-LD object for a dataset record.
 *
 * @param dataset  The cloud dataset record (full shape — `name`,
 *                 `abstract`, `doi`, `contributors`, dates, license).
 * @param datasetId The ndiId / Mongo id used in the canonical URL.
 *                 Note: this is intentionally separate from
 *                 `dataset.id` so callers always pass the URL slug
 *                 explicitly (avoids the `_id` vs `id` ambiguity in
 *                 cloud responses).
 * @returns        A JSON-serializable object ready to feed into
 *                 `JSON.stringify` for embedding in
 *                 `<script type="application/ld+json">`.
 */
export function datasetJsonLd(
  dataset: DatasetRecord,
  datasetId: string,
): Record<string, unknown> {
  const canonicalUrl = `${SITE_ORIGIN}/datasets/${datasetId}/overview`;
  const name = cleanDatasetName(dataset.name);
  const description = dataset.abstract?.trim() || dataset.description?.trim();
  const doiUrl = toJsonLdDoiUrl(dataset.doi);
  const license = licenseUrl(normalizeLicense(dataset.license));
  const keywords = keywordsFromRecord(dataset);
  const creators = (dataset.contributors ?? [])
    .map(personFromContributor)
    .filter((p): p is Record<string, unknown> => p !== null);
  const citations = (dataset.associatedPublications ?? [])
    .map(scholarlyArticleFromPublication)
    .filter((c): c is Record<string, unknown> => c !== null);

  const out: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': canonicalUrl,
    name,
    url: canonicalUrl,
    isAccessibleForFree: dataset.isPublished !== false,
    publisher: {
      '@type': 'Organization',
      name: 'NDI Cloud',
      legalName: 'Waltham Data Science LLC',
      url: SITE_ORIGIN,
    },
    includedInDataCatalog: {
      '@type': 'DataCatalog',
      name: 'NDI Cloud Data Commons',
      url: `${SITE_ORIGIN}/datasets`,
    },
    distribution: {
      '@type': 'DataDownload',
      // Documents tab is the access surface for the underlying NWB /
      // MAT files; the user pages through them with the Document
      // Explorer. Bulk-download URLs would land as additional
      // DataDownload entries when that feature ships.
      contentUrl: `${SITE_ORIGIN}/datasets/${datasetId}/documents`,
      encodingFormat: 'application/json',
    },
  };

  if (description) {
    // Google's structured-data validator accepts arbitrary length but
    // dataset-search SERPs truncate around ~250 chars. Cap to 5000
    // for sanity (well past any reasonable abstract).
    out.description = description.slice(0, 5000);
  }
  if (doiUrl) {
    // Both `identifier` AND `sameAs` to maximize signal — Google
    // Dataset Search uses `identifier` for cross-referencing,
    // `sameAs` for entity linking.
    out.identifier = doiUrl;
    out.sameAs = doiUrl;
  }
  if (license) {
    out.license = license;
  }
  if (creators.length > 0) {
    out.creator = creators;
  }
  // Prefer uploadedAt over createdAt for `datePublished` — it
  // represents "when the public could first see this dataset," which
  // matches what citations need to report.
  const datePublished = dataset.uploadedAt ?? dataset.createdAt;
  if (datePublished) {
    out.datePublished = datePublished;
  }
  if (dataset.updatedAt) {
    out.dateModified = dataset.updatedAt;
  }
  if (keywords.length > 0) {
    out.keywords = keywords.join(', ');
  }
  if (citations.length > 0) {
    out.citation = citations;
  }

  return out;
}

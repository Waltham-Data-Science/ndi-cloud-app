/**
 * Resolve a human-readable Document name from a row, falling back
 * through a chain:
 *
 *   1. `doc.name` (canonical) — if non-empty, use as-is
 *   2. `doc.data.base.name` (alternate emit point used by some docs)
 *   3. Class-specific inference (daqreader_*, imageStack, ontologyTableRow)
 *   4. `<className> · <abbreviated id>` — last-ditch fallback
 *
 * Returns a non-empty string in every branch. Pure function. Defensive
 * against non-string inputs (some doc shapes have `name: null` or
 * `name: []`).
 *
 * 2026-05-18 — B4 fix. Many doc classes (daqreader_*, imageStack,
 * ontologyTableRow) ship empty `base.name`. The Documents picker
 * rendered blank Name cells, making documents impossible to identify
 * visually. This helper centralizes a fallback so picker, list, and
 * detail surfaces all render the same readable label.
 */

interface DocLike {
  name?: unknown;
  className?: unknown;
  class_name?: unknown;
  ndiId?: unknown;
  ndi_id?: unknown;
  id?: unknown;
  _id?: unknown;
  data?: unknown;
}

interface DataLike {
  base?: unknown;
  files?: unknown;
  document_class?: unknown;
  ontologyTableRow?: unknown;
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getClassName(doc: DocLike): string | null {
  const cn = asNonEmptyString(doc.className) ?? asNonEmptyString(doc.class_name);
  if (cn) return cn;
  // Nested under data.document_class.class_name on the bulk-fetch shape.
  const data = doc.data as DataLike | undefined;
  if (data && typeof data === 'object') {
    const dc = data.document_class as { class_name?: unknown } | undefined;
    if (dc) {
      const nested = asNonEmptyString(dc.class_name);
      if (nested) return nested;
    }
  }
  return null;
}

function getDocId(doc: DocLike): string | null {
  return (
    asNonEmptyString(doc.id) ??
    asNonEmptyString(doc._id) ??
    asNonEmptyString(doc.ndiId) ??
    asNonEmptyString(doc.ndi_id)
  );
}

function abbreviateId(id: string): string {
  // Mongo `_id` is 24 chars; NDI-format is 33 chars. Show first 8 + last 4
  // with an ellipsis between — enough to disambiguate at a glance.
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function inferDaqreaderName(data: DataLike): string | null {
  // daqreader_mfdaq_epochdata_ingested + variants carry a `file_list`
  // of `.nbf_#` signal files. Use the first non-metadata entry.
  const files = data.files as { file_list?: unknown } | undefined;
  if (!files || typeof files !== 'object') return null;
  const list = files.file_list;
  if (!Array.isArray(list)) return null;
  for (const f of list) {
    if (typeof f !== 'string') continue;
    if (!f.trim()) continue;
    // Skip known-metadata filenames that don't identify a sweep.
    const lower = f.toLowerCase();
    if (lower === 'channel_list.bin' || lower === 'meta.json') continue;
    return f.trim();
  }
  return null;
}

function inferOntologyTableRowName(data: DataLike): string | null {
  // ontologyTableRow docs carry an `ontologyTableRow` block with
  // `ontologyName` + sometimes `variableNames` (CSV header for the row).
  const row = data.ontologyTableRow as Record<string, unknown> | undefined;
  if (!row) return null;
  const ontology = asNonEmptyString(row.ontologyName);
  const vars = row.variableNames;
  if (ontology && Array.isArray(vars) && vars.length > 0) {
    const first = vars.find((v) => typeof v === 'string' && v.trim());
    if (first) return `${ontology}: ${first}`;
  }
  if (ontology) return ontology;
  return null;
}

/**
 * Try to synthesize a name from class-specific data on the doc.
 * Returns null if no inference rule fires.
 */
function inferNameFromClass(className: string, data: DataLike): string | null {
  if (className.startsWith('daqreader')) {
    return inferDaqreaderName(data);
  }
  if (className === 'ontologyTableRow') {
    return inferOntologyTableRowName(data);
  }
  // imageStack, openminds_subject, treatment_*, etc. fall through to
  // the class-+-id last-ditch label. Better than blank, and the id is
  // already shown on the second line in the picker.
  return null;
}

/**
 * Main entry point — see file docblock for the fallback chain.
 */
export function resolveDocName(row: DocLike): string {
  // Step 1: canonical `name` field.
  const canonical = asNonEmptyString(row.name);
  if (canonical) return canonical;

  // Step 2: `data.base.name` alternate.
  const data = (row.data as DataLike | undefined) ?? undefined;
  if (data && typeof data === 'object') {
    const base = data.base as { name?: unknown } | undefined;
    if (base) {
      const baseName = asNonEmptyString(base.name);
      if (baseName) return baseName;
    }
  }

  // Step 3: class-specific synthesis.
  const className = getClassName(row);
  if (className && data) {
    const inferred = inferNameFromClass(className, data);
    if (inferred) return inferred;
  }

  // Step 4: `<className> · <abbreviated id>` last-ditch.
  const id = getDocId(row);
  if (className && id) return `${className} · ${abbreviateId(id)}`;
  if (className) return className;
  if (id) return abbreviateId(id);
  return '(no name)';
}

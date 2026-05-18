/**
 * Shared wrapper-class filter for NDI document class counts.
 *
 * Some NDI document classes are internal manifest/wrapper rows — one per
 * dataset — whose data is pure bookkeeping (e.g. `session_in_a_dataset`
 * carries `session_id`, `session_reference`, `session_creator`, `is_linked`).
 * Hiding them from every user-facing count surface keeps the visible
 * "number of classes" stable across surfaces and avoids the "+1 extra
 * session" optical-illusion bug surfaced in the 2026-04-29 team review
 * (Bhar appeared to have "3 sessions" because the eye scanned two
 * adjacent sidebar rows: `session: 2` and `session_in_a_dataset: 1`).
 *
 * Counted parity fix (2026-05-19): until this module, `ClassCountsList`
 * was the only surface applying the wrapper filter. The workspace
 * surfaces (`SnapshotSection.numClasses`, `StructureBrowser.totalClasses`,
 * `StructureBrowser.deriveClassList`, `DocumentsPicker.deriveDocumentClasses`)
 * counted wrappers, causing Bhar's "12 classes" tile vs the catalog
 * sidebar's "11 classes" list. Centralizing the wrapper set here keeps
 * every surface in sync.
 *
 * The set is exhaustive against currently-observed wrapper classes
 * across all 8 published datasets; new wrappers need an explicit add
 * (NOT a regex / heuristic — we want a deliberate, audited list rather
 * than a pattern that might silently swallow content classes named
 * with `_dataset` suffix in the future).
 */
export const HIDDEN_WRAPPER_CLASSES: ReadonlySet<string> = new Set([
  'session_in_a_dataset',
]);

/**
 * True iff this NDI class name is a wrapper that should be hidden from
 * user-facing class lists and counts.
 */
export function isHiddenWrapperClass(className: string): boolean {
  return HIDDEN_WRAPPER_CLASSES.has(className);
}

/**
 * Filter wrapper classes out of a `classCounts` record. Returns a new
 * object; does not mutate the input.
 *
 * Use this for any count surface that exposes per-class breakdowns to
 * the user — the sidebar list, the workspace stat tiles, the documents
 * picker, the structure browser. NEVER use it to alter `totalDocuments`:
 * the dataset's true document count is the synthesizer-reported total
 * regardless of which classes carry it, and changing that would
 * contradict the hero card / catalog card across surfaces.
 */
export function filterWrapperClasses(
  classCounts: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cls, count] of Object.entries(classCounts)) {
    if (HIDDEN_WRAPPER_CLASSES.has(cls)) continue;
    out[cls] = count;
  }
  return out;
}

/**
 * Count of distinct user-visible classes after wrapper filtering.
 * Replaces `Object.keys(data.classCounts).length` everywhere that
 * count is shown to the user.
 */
export function countDisplayClasses(
  classCounts: Record<string, number>,
): number {
  let n = 0;
  for (const cls of Object.keys(classCounts)) {
    if (HIDDEN_WRAPPER_CLASSES.has(cls)) continue;
    n += 1;
  }
  return n;
}

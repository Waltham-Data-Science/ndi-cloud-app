/**
 * Format helpers used across catalog + detail surfaces.
 * Ported from `ndi-data-browser-v2/frontend/src/lib/format.ts`.
 *
 * **Locale pinned to `en-US`**: SSR runs on Vercel functions (Node
 * default = en-US-ish) while client runs in the browser (whatever
 * the user's locale is). `toLocaleString(undefined)` defers to the
 * runtime default, so server and client can format the same number
 * /date differently — that's a hydration mismatch (React error #418)
 * any time a non-en-US client visits an SSR'd page. Pinning to
 * `en-US` ensures byte-identical output on both sides.
 *
 * The platform's content language is English; users see consistent
 * formatting regardless of their browser locale. If a future
 * internationalization pass needs locale-aware formatting, do it via
 * a `useLocale()` client-side hook (post-hydration) so SSR and the
 * first client paint stay aligned.
 */

const LOCALE = 'en-US';

export function formatNumber(n: number): string {
  return new Intl.NumberFormat(LOCALE).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Date + time variant for surfaces where the precise capture moment
 * matters (document detail timestamps, etc.). Renders as
 * `Apr 22, 2026 at 4:33 PM` — the team review feedback's preferred
 * human-readable form. Returns the same `'—'` / fallback shape as
 * `formatDate` for missing or unparseable input.
 *
 * Locale pinned to en-US for the same SSR/hydration reason as the
 * helpers above (en-US render is byte-identical on Vercel functions
 * and any browser). The string `' at '` is hard-coded rather than
 * relying on Intl.DateTimeFormat's locale-aware separator (`,` in
 * en-US) so the visual style is consistent.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString(LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timePart = d.toLocaleTimeString(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} at ${timePart}`;
}

export function truncate(s: string | null | undefined, n = 120): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Human-readable byte count. 0 → "0 B". Negative → absolute value. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const n = Math.abs(bytes);
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = n / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIdx]}`;
}

/**
 * Strip a leading "Dataset:" / "Dataset -" / "Dataset –" prefix from
 * a dataset name. The cloud admin UI lets uploaders save names with
 * a literal `Dataset:` prefix; some legacy entries have it, newer
 * entries don't. Surface them uniformly on read so cards / hero /
 * page titles don't show "Dataset: Dataset: …" or read like a
 * placeholder.
 *
 * Conservative: only strips the very first prefix; the rest of the
 * string (including the substring "dataset" mid-sentence) is left
 * untouched. Returns the input unchanged if no prefix matches.
 */
export function cleanDatasetName(
  name: string | null | undefined,
): string {
  if (!name) return '';
  // Trim, then strip a leading "Dataset" + optional separator (`:`,
  // `-`, en-dash, em-dash) + whitespace. Case-insensitive for
  // robustness against "DATASET:" / "dataset:" / "Dataset -" variants.
  return name
    .trim()
    .replace(/^dataset\s*[:\-–—]\s*/i, '')
    .trim();
}

/**
 * Strip cloud-side processing markers from an abstract.
 *
 * The synthesizer pipeline injects `DATASET BEING PROCESSED.` at
 * the head of abstracts whose enrichment is in-flight. That marker
 * is meant for ops, not readers — it leaks into catalog cards + the
 * detail Overview tab and reads like a system-error message inside
 * the abstract paragraph. Strip it on render; the optional
 * `processing` return tells the caller it was present so a
 * "Processing" badge can render alongside the abstract if desired.
 *
 * Returns `{ text, processing }` so callers can choose to render a
 * separate badge instead of inlining the marker in body copy.
 */
export function cleanAbstract(
  abstract: string | null | undefined,
): { text: string; processing: boolean } {
  if (!abstract) return { text: '', processing: false };
  const trimmed = abstract.trim();
  // Anchor on the literal placeholder (case-insensitive). The
  // trailing period + optional whitespace is consumed so the next
  // sentence doesn't read with leading punctuation.
  const match = trimmed.match(/^DATASET BEING PROCESSED\.?\s*/i);
  if (match) {
    return { text: trimmed.slice(match[0].length), processing: true };
  }
  return { text: trimmed, processing: false };
}

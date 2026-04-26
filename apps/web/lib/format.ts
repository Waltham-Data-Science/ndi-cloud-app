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

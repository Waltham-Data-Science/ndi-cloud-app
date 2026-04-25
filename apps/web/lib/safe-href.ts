/**
 * Validate that a string is a safe, renderable URL for an `<a href>`.
 * Rejects javascript:, data:, vbscript:, and any other non-navigational
 * scheme. React 19 does not block these at render time (only warns in dev).
 *
 * Returns the canonical URL string if safe, or `undefined` if the input is
 * missing or the protocol is not one of http:, https:, mailto:. Callers
 * should treat `undefined` as "do not render as a clickable link".
 *
 * SSR/RSC note: relative URLs need an origin to parse. In the browser we
 * use `window.location.origin`; on the server we use a fixed sentinel
 * (`https://ndi-cloud.local`) so the validation gate still runs. The
 * sentinel never reaches the user — the only thing the caller does with
 * a relative-resolved URL is reject schemes and read the protocol.
 */
const SSR_SENTINEL_ORIGIN = 'https://ndi-cloud.local';

export function safeHref(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  // Whitespace-only inputs: per WHATWG, browsers collapse leading/trailing
  // whitespace before parsing, so `new URL("  ", origin)` resolves to the
  // origin itself — which would turn a blank field into a clickable link
  // back to the current page. Trim-check up front.
  if (!raw.trim()) return undefined;

  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : SSR_SENTINEL_ORIGIN;

  try {
    const u = new URL(raw, base);
    if (
      u.protocol === 'http:' ||
      u.protocol === 'https:' ||
      u.protocol === 'mailto:'
    ) {
      return u.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

'use client';

/**
 * ShareConversationButton — single-purpose copy-to-clipboard control
 * for the /ask chat.
 *
 * On click, copies `shareUrl` to the clipboard using the
 * `navigator.clipboard` API and shows a transient "Copied!" tooltip
 * for ~1500ms. If the Clipboard API isn't available (older browsers,
 * insecure contexts) we fall back to a temporary `<textarea>` +
 * `document.execCommand('copy')`.
 *
 * The button is rendered as disabled when `shareUrl` is null (i.e.
 * before the first message is sent). The icon is a Lucide
 * `Link` icon (already in deps via `lucide-react`).
 */
import { Link as LinkIcon, Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  /** The URL to copy. Null disables the button. */
  shareUrl: string | null;
  /** Optional className escape hatch for layout tweaks. */
  className?: string;
};

const COPIED_TOAST_MS = 1500;

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context — fall through to the
      // execCommand fallback so we still copy in HTTP environments.
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ShareConversationButton({ shareUrl, className }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (!shareUrl) return;
    const ok = await copyToClipboard(shareUrl);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_TOAST_MS);
  }, [shareUrl]);

  const disabled = !shareUrl;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={
        disabled ? 'Share unavailable — send a message first' : 'Copy share link'
      }
      title={
        disabled
          ? 'Send a message to enable sharing'
          : copied
            ? 'Copied!'
            : 'Copy share link'
      }
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium',
        'border border-gray-200 bg-white text-gray-700',
        'hover:bg-gray-50 hover:text-gray-900',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-gray-700',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'transition-colors duration-(--duration-base) ease-(--ease-out)',
        className ?? '',
      ].join(' ')}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Share</span>
        </>
      )}
    </button>
  );
}

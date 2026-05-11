'use client';

/**
 * DownloadFileButton — render a button that downloads a string as a
 * named file when clicked.
 *
 * Round-5 review (2026-04-29): the cite-this-dataset modal grew a
 * Download affordance for BibTeX (`.bib`) and RIS (`.ris`) blocks
 * because Endnote / Mendeley / Zotero accept file uploads as a faster
 * import path than the round-trip through clipboard. The button sits
 * adjacent to the existing Copy button in the cite modal and shares
 * its visual treatment so the two affordances feel symmetric.
 *
 * Implementation: build a `Blob` from the string + MIME, get an
 * object-URL via `URL.createObjectURL`, click a hidden `<a download>`
 * to trigger the browser's save dialog, then revoke the object-URL.
 * Standard pattern; no external dependency. Tested in jsdom by
 * stubbing the click flow.
 *
 * Same accessibility envelope as CopyButton: aria-label, focus-visible
 * ring, data-testid, transient "Saved" confirmation on success.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface DownloadFileButtonProps {
  /** The string content saved to the file when the button is clicked. */
  value: string;
  /** Filename suggested to the browser's save dialog (e.g. `citation.bib`). */
  filename: string;
  /**
   * MIME type for the Blob. Common values:
   *   - `application/x-bibtex` for `.bib`
   *   - `application/x-research-info-systems` for `.ris`
   *   - `text/plain` for plain text
   */
  mime: string;
  /** Human-readable label announced to screen readers. */
  ariaLabel?: string;
  className?: string;
  /** Visible label alongside the icon. Defaults to "Download"/"Saved". */
  label?: string;
  /** Optional test id override; defaults to `download-button`. */
  testId?: string;
}

export function DownloadFileButton({
  value,
  filename,
  mime,
  ariaLabel,
  className,
  label,
  testId = 'download-button',
}: DownloadFileButtonProps) {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<number | null>(null);

  const download = useCallback(() => {
    try {
      const blob = new Blob([value], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      // The anchor doesn't need to be in the DOM for the click to
      // trigger the download, but Firefox historically had quirks
      // with detached anchors. Append + remove for safety.
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Release the blob URL on the next tick — Safari occasionally
      // races the download against an immediate revoke.
      window.setTimeout(() => URL.revokeObjectURL(url), 100);
      setSaved(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setSaved(false), 1500);
    } catch {
      // Swallow — download failures are non-critical. The cite block
      // content is visible text the user can copy instead.
    }
  }, [value, filename, mime]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={download}
      aria-label={ariaLabel ?? `Download ${filename}`}
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border-strong bg-bg-surface px-2 py-1 text-xs',
        'text-fg-secondary transition-colors hover:bg-bg-muted hover:text-brand-navy',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ndi-teal',
        className,
      )}
      data-testid={testId}
      data-saved={saved ? 'true' : 'false'}
    >
      {saved ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <Download className="h-3 w-3" aria-hidden />
      )}
      <span>{saved ? 'Saved' : label ?? 'Download'}</span>
    </button>
  );
}

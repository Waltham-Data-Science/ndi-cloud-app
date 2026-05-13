'use client';

/**
 * CitationChip — the small `[N]` clickable marker rendered inline next
 * to any factual claim in an assistant message.
 *
 * Hover shows a preview tooltip with the source document's title +
 * snippet + NDI class badge. Click opens the document in the Document
 * Explorer (new tab, so the chat session is preserved).
 *
 * Visually a tight inline chip — small enough not to break the flow of
 * a sentence, big enough to be a comfortable click target.
 */
import Link from 'next/link';
import { useId, useState } from 'react';

import type { Reference } from '@/lib/ai/references';

interface Props {
  number: number;
  reference: Reference;
}

export function CitationChip({ number, reference }: Props) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span className="relative inline-block align-baseline">
      <Link
        href={reference.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={tooltipId}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-0.5 -mt-0.5 align-middle text-[10px] font-semibold leading-none rounded-md bg-brand-blue/10 text-brand-blue hover:bg-brand-blue hover:text-white transition-colors no-underline cursor-pointer"
      >
        {number}
      </Link>
      {open && (
        <span
          role="tooltip"
          id={tooltipId}
          className="absolute z-50 left-0 top-full mt-1 w-72 p-3 rounded-md bg-white border border-gray-200 shadow-lg text-[12px] leading-snug text-gray-700 pointer-events-none"
        >
          <span className="block font-semibold text-gray-900 mb-1 line-clamp-2">
            {reference.title}
          </span>
          {reference.snippet && (
            <span className="block text-gray-600 mb-1.5 line-clamp-2">
              {reference.snippet}
            </span>
          )}
          <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-700">
            {reference.class}
          </span>
        </span>
      )}
    </span>
  );
}

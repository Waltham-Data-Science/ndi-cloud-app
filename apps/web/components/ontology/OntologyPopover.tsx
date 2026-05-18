'use client';

/**
 * OntologyPopover — interactive ontology term chip.
 *
 * **Closes audit 2026-04-23 #66.** The data-browser shipped a 327-LOC
 * popover with bespoke placement / portal / scroll re-anchor logic. This
 * implementation hands those concerns to `FloatingPanel` (Phase 3a
 * primitive) and focuses on the ontology-specific UX:
 *
 *   - **Open delay**: 150ms after hover so a cursor swiping past a term
 *     doesn't trigger an unwanted popover flash.
 *   - **Close grace**: 100ms after `mouseleave` so the cursor can transit
 *     the 4px trigger-popover gap without dismissing.
 *   - **Focus on the trigger opens immediately** (no hover delay) — keyboard
 *     users expect immediate feedback.
 *   - **Escape** closes.
 *   - **`safeHref`** guard on the provider URL (audit M3 from PR #76 carries):
 *     a malicious ontology provider can't slip a `javascript:` / `data:` URI.
 *   - **`EMPTY:` prefix** renders as static monospace text (NDI internal
 *     ID, no external lookup).
 *
 * The popover content is wrapped in `role="dialog"` (interactive — has
 * the "View on provider" link) per FloatingPanel's role override.
 *
 * Hover semantics: a shared close timer is canceled when the cursor
 * enters EITHER the trigger or the popover, so the cursor can travel
 * between them without dismissing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useOntologyLookup } from '@/lib/api/ontology';
import { ontologyUrl } from '@/lib/ontology/url-builder';
import { safeHref } from '@/lib/safe-href';
import { normalizeOntologyTerm } from '@/lib/ontology/utils';

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 100;

interface OntologyPopoverProps {
  termId: string;
  /** Optional — when set, "Find everywhere" link in the popover points
   * at the query page preloaded with this term. Wired up in Phase 3e
   * when /query lands. */
  findEverywherePath?: string;
}

export function OntologyPopover({
  termId,
  findEverywherePath,
}: OntologyPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const displayId = termId.trim();
  const isEmptyTerm = displayId.startsWith('EMPTY:');

  const lookupTerm = isOpen && !isEmptyTerm ? displayId : '';
  const { data, isLoading } = useOntologyLookup(lookupTerm);
  const normalized = normalizeOntologyTerm(displayId) ?? displayId;

  const cancelTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    cancelTimers();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      setIsOpen(true);
    }, OPEN_DELAY_MS);
  }, [cancelTimers]);

  const scheduleClose = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
    }, CLOSE_DELAY_MS);
  }, []);

  const openImmediately = useCallback(() => {
    cancelTimers();
    setIsOpen(true);
  }, [cancelTimers]);

  // Cleanup pending timers on unmount.
  useEffect(() => () => cancelTimers(), [cancelTimers]);

  // Escape closes when open. The trigger gets focus while a keyboard
  // user is interacting; the popover is portaled into document.body
  // so a window-level keydown listener catches Escape regardless of
  // where focus lives.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancelTimers();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, cancelTimers]);

  // EMPTY: terms — static monospace, no popover.
  if (isEmptyTerm) {
    const id = displayId.replace('EMPTY:', '');
    return (
      <span
        className="font-mono text-xs text-gray-500"
        title="NDI internal identifier (no ontology mapping)"
        data-ontology-term={displayId}
      >
        {id}
      </span>
    );
  }

  const hasDefinition = !!data && !!data.label;

  // Round-3 fix (team review): when the prefix maps to a known
  // resolver (Wormbase, NCBI Taxonomy, EBI OLS4, SciCrunch), render
  // an inline external-link icon next to the chip so users can jump
  // directly to the canonical provider page without going through
  // the popover. The chip itself still opens the popover; the icon
  // is a separate `<a>` with `stopPropagation` so a click hits the
  // link cleanly. `safeHref` guards against any future resolver
  // change emitting a non-http(s) scheme.
  const directLink = safeHref(ontologyUrl(displayId) ?? undefined);

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <button
          ref={triggerRef}
          type="button"
          className="text-brand-600 hover:text-brand-700 underline decoration-dotted cursor-help font-mono text-xs"
          data-ontology-term={displayId}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
          onFocus={openImmediately}
          onBlur={scheduleClose}
          onClick={(e) => {
            // Keep the popover open + don't trigger an enclosing row's onRowClick.
            e.stopPropagation();
            openImmediately();
          }}
          aria-expanded={isOpen}
          aria-label={`Ontology term ${displayId}. Click for definition.`}
        >
          {displayId}
        </button>
        {directLink && (
          <a
            href={directLink}
            target="_blank"
            rel="noopener noreferrer"
            // Stop propagation so the click hits the anchor, not the
            // table row's onRowClick or the popover trigger.
            onClick={(e) => e.stopPropagation()}
            className="text-fg-muted hover:text-brand-600 inline-flex"
            title={`Open ${displayId} on the provider site`}
            aria-label={`Open ${displayId} on the provider site (new tab)`}
            data-ontology-link={displayId}
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </span>
      <FloatingPanel
        open={isOpen}
        anchorRef={triggerRef}
        preferredPlacement="above"
        width={288}
        estimatedHeight={180}
        offset={4}
        viewportMargin={8}
        role="dialog"
        ariaLabel={`Ontology term ${displayId}`}
        className="rounded-md border border-gray-200 bg-white p-3 shadow-lg text-xs"
        testId={`ontology-popover-${displayId}`}
        dataAttrs={{ 'data-ontology-popover': displayId }}
        onMouseEnter={openImmediately}
        onMouseLeave={scheduleClose}
      >
        {isLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : hasDefinition ? (
          <div className="space-y-1.5">
            <div className="font-medium text-gray-900">{data!.label}</div>
            <div className="font-mono text-[10px] text-gray-500">
              {`${data!.provider}:${data!.termId}`}
            </div>
            {data!.definition && (
              <p className="text-gray-600 leading-relaxed">
                {data!.definition}
              </p>
            )}
            <ProviderLink url={data?.url} />
            {findEverywherePath && (
              <a
                href={findEverywherePath}
                className="block text-brand-600 underline decoration-dotted pt-1"
              >
                Find everywhere →
              </a>
            )}
          </div>
        ) : (
          <div className="text-gray-500">
            No definition found for{' '}
            <span className="font-mono">{normalized}</span>
          </div>
        )}
      </FloatingPanel>
    </>
  );
}

/** Audit M3 (PR #76) safeHref guard: route the provider URL so a
 * compromised ontology provider can't slip `javascript:` / `data:`. */
function ProviderLink({ url }: { url: string | null | undefined }) {
  const safe = safeHref(url ?? undefined);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="text-brand-600 underline decoration-dotted"
    >
      View on provider →
    </a>
  );
}

'use client';

/**
 * AskPanel — the three-mode workspace chat panel.
 *
 * Phase D of the workspace redesign (2026-05-16). Renders AskShell
 * inside a panel chrome that supports three expansion modes the user
 * cycles between:
 *
 *   Drawer (default):
 *     420px right-side overlay, slides in from right, white surface,
 *     shadow-xl. Overlays workspace content. Dismissable with Esc +
 *     close button. Does NOT have a click-outside dismiss to avoid
 *     losing a conversation mid-sentence.
 *
 *   Sidebar:
 *     520px right-side persistent column. No overlay backdrop. The
 *     panel renders at its full width and the parent layout is
 *     responsible for reflowing workspace content (`data-ask-panel-mode`
 *     attribute on the panel + a CSS rule on the layout would do it).
 *     For Phase D v1 the sidebar overlays — Phase E adds the layout
 *     reflow.
 *
 *   Fullscreen:
 *     Takes the full viewport. Workspace stays in URL but is visually
 *     hidden behind the panel. Chat log centered, max-w-[760px],
 *     matching ChatGPT / Claude.ai layout.
 *
 * Mode controls (toolbar buttons in the header):
 *   ⤢ Expand   — cycles drawer → sidebar → fullscreen (stops at max)
 *   ⤡ Contract — cycles fullscreen → sidebar → drawer (stops at min)
 *   × Close    — removes ?ask from the URL
 *   Esc        — same as Close (handled globally via useEffect)
 *
 * ARIA: `role="dialog"` + `aria-modal="true"` for drawer and
 * fullscreen (they overlay content). Sidebar is `role="complementary"`
 * (persistent, not modal). The close button gets initial focus when
 * the panel opens so keyboard users land inside the dialog.
 *
 * Renders null when `?ask` is absent — no DOM at all.
 */
import { Maximize2, MessageSquare, Minimize2, X } from 'lucide-react';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AskShell, type AskShellContext } from '@/components/ai/AskShell';
import { cn } from '@/lib/cn';
import {
  subscribeToAskPrefill,
  type AskPrefillPayload,
} from '@/lib/ai/ask-prefill-bus';
import { useAskPanelState } from '@/lib/ai/use-ask-panel-state';
import { useWorkspaceSelection } from '@/lib/workspace/use-workspace-selection';

export interface AskPanelProps {
  /**
   * Baseline context from the workspace layout (datasetId,
   * datasetName). AskPanel enriches it with live selection state
   * read from `useWorkspaceSelection` — when the user picks a
   * subject/session/etc., subsequent chat turns carry that selection
   * automatically.
   *
   * Phase F (W7 audit fix). Pre-fix, context was theatre only; the
   * AskPanel header read "Asking about: &lt;dataset&gt;" with zero
   * API impact. Post-fix, the selection IS forwarded to /api/ask.
   */
  context?: AskShellContext;
}

export function AskPanel({ context }: AskPanelProps) {
  const { open, mode, openPanel, expand, contract, close } = useAskPanelState();
  const { selection } = useWorkspaceSelection();

  // Phase G — listen for "Ask Claude about these" gestures from
  // anywhere in the workspace (today: WorkspaceDataGrid bulk-actions
  // bar). On event: open the panel (if closed) and forward the
  // payload to AskShell, which stages text + optionally auto-sends.
  // The staged value clears after consumption so re-renders don't
  // double-fire.
  const [pendingPrefill, setPendingPrefill] =
    useState<AskPrefillPayload | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeToAskPrefill((payload) => {
      setPendingPrefill(payload);
      openPanel();
    });
    return unsubscribe;
  }, [openPanel]);
  const handlePrefillConsumed = useCallback(() => {
    setPendingPrefill(null);
  }, []);

  // Merge selection into the baseline context. AskShell stringifies
  // this to detect transport rebuilds, so we don't include null /
  // undefined keys — they'd flap the JSON stable-ish.
  const enrichedContext: AskShellContext | undefined = useMemo(() => {
    const base: AskShellContext = { ...context };
    if (selection.subject) base.selectedSubjectId = selection.subject;
    if (selection.session) base.selectedSessionId = selection.session;
    if (selection.probe) base.selectedProbeId = selection.probe;
    if (selection.stimulus) base.selectedStimulusId = selection.stimulus;
    if (selection.unit) base.selectedUnitId = selection.unit;
    return Object.keys(base).length > 0 ? base : undefined;
  }, [
    context,
    selection.subject,
    selection.session,
    selection.probe,
    selection.stimulus,
    selection.unit,
  ]);

  // Focus close button when the panel opens — keyboard users should
  // land inside the dialog, not behind it.
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Esc closes the panel from anywhere inside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  if (!open) return null;

  const canExpand = mode !== 'fullscreen';
  const canContract = mode !== 'drawer';

  const title = 'Ask';
  const contextLine = context?.datasetName
    ? `Asking about: ${context.datasetName}`
    : null;

  if (mode === 'fullscreen') {
    return (
      <FullscreenPanel
        title={title}
        contextLine={contextLine}
        context={enrichedContext}
        canContract={canContract}
        onContract={contract}
        onClose={close}
        closeButtonRef={closeButtonRef}
        prefill={pendingPrefill}
        onPrefillConsumed={handlePrefillConsumed}
      />
    );
  }

  if (mode === 'sidebar') {
    return (
      <SidebarPanel
        title={title}
        contextLine={contextLine}
        context={enrichedContext}
        canExpand={canExpand}
        canContract={canContract}
        onExpand={expand}
        onContract={contract}
        onClose={close}
        closeButtonRef={closeButtonRef}
        prefill={pendingPrefill}
        onPrefillConsumed={handlePrefillConsumed}
      />
    );
  }

  // Default: drawer
  return (
    <DrawerPanel
      title={title}
      contextLine={contextLine}
      context={enrichedContext}
      canExpand={canExpand}
      onExpand={expand}
      onClose={close}
      closeButtonRef={closeButtonRef}
      prefill={pendingPrefill}
      onPrefillConsumed={handlePrefillConsumed}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Shared header toolbar                                                       */
/* -------------------------------------------------------------------------- */

interface PanelHeaderProps {
  title: string;
  contextLine: string | null;
  canExpand: boolean;
  canContract: boolean;
  onExpand?: () => void;
  onContract?: () => void;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
}

function PanelHeader({
  title,
  contextLine,
  canExpand,
  canContract,
  onExpand,
  onContract,
  onClose,
  closeButtonRef,
}: PanelHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-border-subtle shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <MessageSquare
          className="h-4 w-4 shrink-0 text-ndi-teal"
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-fg-primary leading-tight m-0">
            {title}
          </h2>
          {contextLine && (
            <p className="text-[11.5px] text-fg-muted leading-tight mt-0.5 truncate">
              {contextLine}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {onExpand && (
          <ToolbarButton
            onClick={onExpand}
            disabled={!canExpand}
            aria-label="Expand panel"
            title="Expand (Ctrl+\)"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
        {onContract && (
          <ToolbarButton
            onClick={onContract}
            disabled={!canContract}
            aria-label="Contract panel"
            title="Contract"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
        <span
          className="text-[10px] text-fg-muted/60 font-mono px-1 select-none"
          aria-hidden
        >
          Esc
        </span>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close Ask panel"
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal transition-colors duration-(--duration-base) ease-(--ease-out)"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </header>
  );
}

function ToolbarButton({
  children,
  disabled,
  onClick,
  'aria-label': ariaLabel,
  title,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  'aria-label': string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal transition-colors duration-(--duration-base) ease-(--ease-out)"
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* DrawerPanel                                                                 */
/* -------------------------------------------------------------------------- */

interface DrawerPanelProps {
  title: string;
  contextLine: string | null;
  context?: AskShellContext;
  canExpand: boolean;
  onExpand: () => void;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  prefill: AskPrefillPayload | null;
  onPrefillConsumed: () => void;
}

function DrawerPanel({
  title,
  contextLine,
  context,
  canExpand,
  onExpand,
  onClose,
  closeButtonRef,
  prefill,
  onPrefillConsumed,
}: DrawerPanelProps) {
  return (
    <>
      {/* Inert backdrop — visual depth only, no dismiss-on-click. */}
      <div
        className="fixed inset-0 z-40 bg-black/10 pointer-events-none"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask panel"
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col',
          'w-[420px] bg-bg-surface border-l border-border-subtle',
          'shadow-xl',
        )}
        style={{
          animation:
            'askPanelSlideIn 200ms cubic-bezier(0.22,0.61,0.36,1) forwards',
        }}
      >
        <PanelHeader
          title={title}
          contextLine={contextLine}
          canExpand={canExpand}
          canContract={false}
          onExpand={onExpand}
          onClose={onClose}
          closeButtonRef={closeButtonRef}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <AskShell
            context={context}
            compact
            prefill={prefill}
            onPrefillConsumed={onPrefillConsumed}
          />
        </div>
      </div>
      <style>{`
        @keyframes askPanelSlideIn {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* SidebarPanel                                                                */
/* -------------------------------------------------------------------------- */

interface SidebarPanelProps {
  title: string;
  contextLine: string | null;
  context?: AskShellContext;
  canExpand: boolean;
  canContract: boolean;
  onExpand: () => void;
  onContract: () => void;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  prefill: AskPrefillPayload | null;
  onPrefillConsumed: () => void;
}

function SidebarPanel({
  title,
  contextLine,
  context,
  canExpand,
  canContract,
  onExpand,
  onContract,
  onClose,
  closeButtonRef,
  prefill,
  onPrefillConsumed,
}: SidebarPanelProps) {
  // Sidebar: not a modal overlay — `role="complementary"`. v1 still
  // renders position:fixed (same as drawer) so it doesn't require
  // reflowing the workspace layout. Phase E adds the reflow via a
  // sibling-flex layout + data-attribute.
  return (
    <aside
      role="complementary"
      aria-label="Ask panel"
      data-ask-panel-mode="sidebar"
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex flex-col',
        'w-[520px] bg-bg-surface border-l border-border-subtle',
        'shadow-xl',
      )}
    >
      <PanelHeader
        title={title}
        contextLine={contextLine}
        canExpand={canExpand}
        canContract={canContract}
        onExpand={onExpand}
        onContract={onContract}
        onClose={onClose}
        closeButtonRef={closeButtonRef}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <AskShell
          context={context}
          compact
          prefill={prefill}
          onPrefillConsumed={onPrefillConsumed}
        />
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* FullscreenPanel                                                             */
/* -------------------------------------------------------------------------- */

interface FullscreenPanelProps {
  title: string;
  contextLine: string | null;
  context?: AskShellContext;
  canContract: boolean;
  onContract: () => void;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  prefill: AskPrefillPayload | null;
  onPrefillConsumed: () => void;
}

function FullscreenPanel({
  title,
  contextLine,
  context,
  canContract,
  onContract,
  onClose,
  closeButtonRef,
  prefill,
  onPrefillConsumed,
}: FullscreenPanelProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask panel — fullscreen"
      className="fixed inset-0 z-50 flex flex-col bg-bg-surface"
    >
      {/* Fullscreen header — wider, max-width matches workspace shell. */}
      <header className="flex items-center justify-between gap-3 px-6 py-3.5 border-b border-border-subtle shrink-0 max-w-[1200px] mx-auto w-full">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare
            className="h-4 w-4 shrink-0 text-ndi-teal"
            aria-hidden
          />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-fg-primary leading-tight m-0">
              {contextLine ? `${title} — ${contextLine}` : title}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ToolbarButton
            onClick={onContract}
            disabled={!canContract}
            aria-label="Contract panel"
            title="Contract"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <span
            className="text-[10px] text-fg-muted/60 font-mono px-1 select-none"
            aria-hidden
          >
            Esc
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close Ask panel"
            title="Back to workspace"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-fg-secondary hover:text-fg-primary hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ndi-teal transition-colors duration-(--duration-base) ease-(--ease-out)"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Chat area — centered, max-w-[760px] like ChatGPT / Claude.ai. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden max-w-[760px] mx-auto w-full flex flex-col">
          <AskShell
            context={context}
            compact
            prefill={prefill}
            onPrefillConsumed={onPrefillConsumed}
          />
        </div>
      </div>
    </div>
  );
}

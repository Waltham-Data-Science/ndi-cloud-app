'use client';

/**
 * AskShell — the chat surface reused across all entry points.
 *
 * Previously lived at `app/(marketing)/ask/ask-shell.tsx`. Moved to
 * `components/ai/` in Phase D of the workspace redesign (2026-05-16)
 * so it can be imported by `AskPanel` without a cross-route-group
 * import. The suggested-prompts data also moves into `lib/ai/` for
 * the same reason.
 *
 * Consumers (post-Phase-D):
 *   - `components/ai/AskPanel` — the workspace drawer / sidebar /
 *     fullscreen chat panel.
 *   - Nothing else. Both legacy `/ask` routes retire to redirects
 *     as part of Phase D.
 *
 * # Compact vs. full chrome
 *
 * The `compact` prop (default `false`) controls whether the shell
 * renders its own `<header>` ("Ask the Commons" title + lede + share/
 * stop button row) and the page-height container, or just the inner
 * chat-thread + input column. The AskPanel needs `compact=true` because
 * it provides its own header chrome and a flex container that owns the
 * height calculation.
 *
 * # Context prop
 *
 * Optional `context` carries workspace selection state (datasetId,
 * datasetName, selection.subject / session / probe / stimulus / unit).
 *
 * Phase F (W7 fix from the 2026-05-16 audit): the context now IS
 * forwarded to `/api/ask` via `DefaultChatTransport.body`. The route
 * reads `body.context` and prepends a workspace-context system
 * message so the model knows "the user is currently in dataset X
 * looking at subject Y." Pre-fix, the prop was plumbed but
 * underscored as unused — the AskPanel header line "Asking about:
 * &lt;dataset name&gt;" was visual theater with zero API impact.
 *
 * # State management (unchanged from the pre-move version)
 *
 * The outer `AskShell` resolves the URL-hash conversation id via
 * `useConversation`, then renders the inner `AskChat` keyed by
 * `conversationId` so `useChat` reinitializes cleanly on "New chat".
 * v5 of `@ai-sdk/react` — transport via `DefaultChatTransport`, send
 * via `sendMessage({ text })`. See `lib/ai/use-conversation.ts` for
 * the conversation-id + localStorage persistence layer.
 */
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ChatInput } from '@/components/ai/ChatInput';
import { ChatThread, type ThreadEntry } from '@/components/ai/ChatThread';
import { ShareConversationButton } from '@/components/ai/ShareConversationButton';
import { SuggestedPromptChips } from '@/components/ai/SuggestedPromptChips';
import { SUGGESTED_PROMPTS } from '@/lib/ai/suggested-prompts';
import { useConversation } from '@/lib/ai/use-conversation';

export interface AskShellContext {
  datasetId?: string;
  datasetName?: string;
  /**
   * The full 5-key selection from the workspace canvas, optional.
   * Forwarded to `/api/ask` so the model knows which subject /
   * session / probe / stimulus / unit the user is currently looking
   * at when they ask a question. Absent → the chat falls back to
   * dataset-only context.
   */
  selectedSubjectId?: string;
  selectedSessionId?: string;
  selectedProbeId?: string;
  selectedStimulusId?: string;
  selectedUnitId?: string;
}

export interface AskShellProps {
  /**
   * Workspace context. Forwarded to /api/ask via
   * `DefaultChatTransport.body` so the server can prepend a
   * workspace-context system message ("the user is in dataset X
   * looking at subject Y"). Phase F (W7 fix) flips this from
   * theater to wiring.
   */
  context?: AskShellContext;
  /**
   * When true, render the inner chat column only (no shell header,
   * no fixed-height container). Used by `AskPanel` which provides
   * its own header + height management.
   */
  compact?: boolean;
}

/**
 * Outer shell: resolves the conversation id (URL hash + localStorage
 * restore) before handing off to the inner `AskChat`. We key
 * `AskChat` by `conversationId` so:
 *
 *   - On initial mount, the inner only renders once the id and
 *     `initialMessages` are settled (no hydration mismatch from
 *     touching window early).
 *   - On "New chat", `conversationId` changes → React unmounts and
 *     remounts the inner → `useChat` reinitializes from scratch
 *     with `messages: []`.
 */
export function AskShell({
  context,
  compact = false,
}: AskShellProps = {}) {
  const {
    conversationId,
    initialMessages,
    persist,
    startNewConversation,
    shareUrl,
  } = useConversation();

  // Until the conversation hook has resolved, render a minimal
  // placeholder. `conversationId` is the empty string before the
  // mount effect fires.
  if (!conversationId) {
    return (
      <div
        className={
          compact
            ? 'flex flex-col flex-1 min-h-0 bg-bg-surface'
            : 'flex flex-col h-[calc(100vh-128px)] max-w-3xl mx-auto bg-white border-x border-gray-100'
        }
      >
        {!compact && (
          <header className="px-6 py-5 border-b border-gray-100">
            <h1 className="text-[22px] font-semibold text-gray-900 m-0">
              Ask the Commons
            </h1>
          </header>
        )}
      </div>
    );
  }

  return (
    <AskChat
      key={conversationId}
      conversationId={conversationId}
      initialMessages={initialMessages}
      persist={persist}
      onNewConversation={startNewConversation}
      shareUrl={shareUrl}
      compact={compact}
      context={context}
    />
  );
}

type AskChatProps = {
  conversationId: string;
  initialMessages: UIMessage[];
  persist: (messages: UIMessage[]) => void;
  onNewConversation: () => void;
  shareUrl: string | null;
  compact: boolean;
  context: AskShellContext | undefined;
};

function AskChat({
  conversationId,
  initialMessages,
  persist,
  onNewConversation,
  shareUrl,
  compact,
  context,
}: AskChatProps) {
  const [input, setInput] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  // Stringify context once per change so the transport rebuilds only
  // when the user actually picks a different subject/session/etc.
  // (URL state writes can fire several times per click; we don't want
  // to thrash the transport.)
  const contextKey = useMemo(() => JSON.stringify(context ?? null), [context]);

  // Transport built per-context — DefaultChatTransport's `body`
  // option is merged into every POST to /api/ask. The server reads
  // `body.context` and prepends a workspace-context system message
  // so the model knows what selection the user is asking from.
  // Phase F (W7 audit fix): pre-fix, context was theatre only.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ask',
        body: context ? { context } : undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contextKey],
  );

  const { messages, sendMessage, status, stop } = useChat({
    transport,
    id: conversationId,
    messages: initialMessages,
    onError: (err) => {
      const msg = err?.message ?? '';
      if (msg.includes('rate_limited') || msg.includes('429')) {
        setErrorBanner(
          "You've sent a lot of messages — wait a minute and try again.",
        );
        setRetryAt(Date.now() + 60_000);
      } else if (msg.includes('chat_disabled') || msg.includes('503')) {
        setErrorBanner('Chat preview is not enabled in this environment.');
      } else {
        setErrorBanner('Connection hiccup — try again.');
      }
    },
  });

  // Watchdog timer — see pre-move comment for the rationale (P0-B fix
  // 2026-05-14). Carried over verbatim.
  const STREAM_TIMEOUT_MS = 65_000;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreamingNow = status === 'streaming' || status === 'submitted';
  useEffect(() => {
    if (isStreamingNow) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        stop();
        setErrorBanner(
          'The model took too long to answer. Try again with a more specific question, or wait a moment.',
        );
        timeoutRef.current = null;
      }, STREAM_TIMEOUT_MS);
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    return undefined;
  }, [isStreamingNow, stop]);

  // Retry-after countdown.
  useEffect(() => {
    if (!retryAt) return;
    const t = setInterval(() => {
      if (Date.now() >= retryAt) {
        setRetryAt(null);
        setErrorBanner(null);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [retryAt]);

  // Persist on every message change. The hook's debounce inside
  // `useConversation` coalesces streaming tokens.
  useEffect(() => {
    persist(messages);
  }, [messages, persist]);

  const entries: ThreadEntry[] = useMemo(() => {
    const out: ThreadEntry[] = [];
    for (const m of messages) {
      const parts = m.parts as
        | Array<{
            type: string;
            text?: string;
            toolName?: string;
            input?: unknown;
            output?: unknown;
          }>
        | undefined;

      if (!Array.isArray(parts)) continue;

      let buf = '';
      const toolCallsForMsg: Array<{
        toolName: string;
        args: unknown;
        result?: unknown;
      }> = [];

      for (const p of parts) {
        if (p.type === 'text' && typeof p.text === 'string') {
          buf += p.text;
        } else if (p.type.startsWith('tool-')) {
          if (buf) {
            out.push({
              kind: 'message',
              role: m.role as 'user' | 'assistant',
              content: buf,
            });
            buf = '';
          }
          const toolName = p.toolName ?? p.type.replace(/^tool-/, '');
          out.push({ kind: 'tool-call', toolName });
          if (m.role === 'assistant') {
            toolCallsForMsg.push({
              toolName,
              args: p.input,
              result: p.output,
            });
          }
        }
      }
      if (buf) {
        out.push({
          kind: 'message',
          role: m.role as 'user' | 'assistant',
          content: buf,
          ...(m.role === 'assistant' && toolCallsForMsg.length > 0
            ? { toolCalls: toolCallsForMsg }
            : {}),
        });
      } else if (m.role === 'assistant' && toolCallsForMsg.length > 0) {
        for (let i = out.length - 1; i >= 0; i--) {
          const entry = out[i]!;
          if (entry.kind === 'message' && entry.role === 'assistant') {
            entry.toolCalls = [
              ...(entry.toolCalls ?? []),
              ...toolCallsForMsg,
            ];
            break;
          }
        }
      }
    }
    return out;
  }, [messages]);

  const lastUserQuestion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.role !== 'user') continue;
      const parts = (m.parts ?? []) as Array<{ type: string; text?: string }>;
      const text = parts
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
      if (text) return text;
    }
    return undefined;
  }, [messages]);

  const chatUrl =
    typeof window !== 'undefined' ? window.location.href : undefined;

  const isStreaming = status === 'streaming' || status === 'submitted';
  const isEmpty = messages.length === 0;

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setErrorBanner(null);
    setInput('');
    void sendMessage({ text });
  };

  const handleChipSelect = (prompt: string) => {
    if (isStreaming) return;
    setErrorBanner(null);
    void sendMessage({ text: prompt });
  };

  const handleStop = () => {
    stop();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setErrorBanner('Stopped. Try a different question or rephrase.');
  };

  const hasAnyMessages = messages.length > 0;

  return (
    <div
      className={
        compact
          ? 'flex flex-col flex-1 min-h-0 bg-bg-surface'
          : 'flex flex-col h-[calc(100vh-128px)] max-w-3xl mx-auto bg-white border-x border-gray-100'
      }
    >
      {!compact && (
        <header className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-semibold text-gray-900 m-0">
                Ask the Commons
              </h1>
              <p className="mt-1 text-[14px] text-gray-500 m-0">
                Experimental preview. Ask about published NDI datasets in plain
                English — counts, contents, contributors, anything in the
                public catalog.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ShareConversationButton shareUrl={shareUrl} />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex items-center rounded-md px-2 py-1 text-[12.5px] font-medium border border-gray-200 bg-white text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 transition-colors duration-(--duration-base) ease-(--ease-out)"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  Stop
                </button>
              ) : (
                hasAnyMessages && (
                  <button
                    type="button"
                    onClick={onNewConversation}
                    className="inline-flex items-center rounded-md px-2 py-1 text-[12.5px] font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors duration-(--duration-base) ease-(--ease-out)"
                    aria-label="Start a new conversation"
                    title="Start a new conversation"
                  >
                    New chat
                  </button>
                )
              )}
            </div>
          </div>
        </header>
      )}

      {isEmpty ? (
        <SuggestedPromptChips
          prompts={SUGGESTED_PROMPTS}
          onSelect={handleChipSelect}
        />
      ) : (
        <ChatThread
          entries={entries}
          isStreaming={isStreaming}
          question={lastUserQuestion}
          chatUrl={chatUrl}
        />
      )}

      {errorBanner && (
        <div
          role="alert"
          className="px-6 py-2.5 bg-amber-50 border-t border-amber-200 text-[13.5px] text-amber-900"
        >
          {errorBanner}
        </div>
      )}

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={isStreaming || retryAt !== null}
      />

      {/* Compact mode: surface the "New chat" affordance inline since
          the header is suppressed. Placed at the bottom of the column
          so it doesn't compete with the input field for focus. */}
      {compact && hasAnyMessages && !isStreaming && (
        <div className="px-4 py-2 border-t border-border-subtle bg-bg-muted/40 flex justify-end">
          <button
            type="button"
            onClick={onNewConversation}
            className="inline-flex items-center rounded-md px-2 py-1 text-[12px] font-medium border border-border-subtle bg-bg-surface text-fg-secondary hover:bg-bg-muted hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors duration-(--duration-base) ease-(--ease-out)"
            aria-label="Start a new conversation"
            title="Start a new conversation"
          >
            New chat
          </button>
        </div>
      )}
    </div>
  );
}

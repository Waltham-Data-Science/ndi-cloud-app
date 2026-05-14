'use client';

/**
 * Top-level client component for /ask.
 *
 * Composes:
 *   - ChatThread (messages + tool-call indicators)
 *   - SuggestedPromptChips (shown only when thread is empty)
 *   - ChatInput (textarea + Send)
 *   - ShareConversationButton (copy stable URL to clipboard)
 *
 * State managed by `useChat()` from `@ai-sdk/react` v5 — handles
 * streaming, SSE parsing, AbortSignal on unmount, and message
 * accumulation. We layer a tiny adapter on top to flatten the
 * SDK's `UIMessage[]` (each message has `parts: [{type: 'text' | 'tool-X', ...}]`)
 * into our `ThreadEntry[]` shape that ChatThread consumes.
 *
 * # Persistence (added 2026-05-14)
 *
 * The outer `AskShell` resolves the URL-hash conversation id via
 * `useConversation`, then renders the inner `AskChat` component
 * keyed by `conversationId` so `useChat` reinitializes cleanly when
 * the user clicks "New chat" (which mints a new id). Inner consumes
 * `initialMessages` as the AI SDK's `messages` init and writes the
 * latest snapshot back to localStorage via the hook's `persist`
 * callback on every `messages` change (debounced 300ms inside the
 * hook).
 *
 * v5 differences from v4 (important):
 *   - Hook does NOT manage input state — we own the textarea.
 *   - Endpoint is configured via DefaultChatTransport, not an `api`
 *     option.
 *   - Send via sendMessage({ text }), not handleSubmit.
 *
 * Failure modes:
 *   - 503 / chat_disabled: shown as friendly notice
 *   - 429 / rate_limited: shown inline with retry-after countdown
 *   - Network blip: shown as toast-like error
 */
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useState } from 'react';

import { ChatInput } from '@/components/ai/ChatInput';
import { ChatThread, type ThreadEntry } from '@/components/ai/ChatThread';
import { ShareConversationButton } from '@/components/ai/ShareConversationButton';
import { SuggestedPromptChips } from '@/components/ai/SuggestedPromptChips';
import { useConversation } from '@/lib/ai/use-conversation';

import { SUGGESTED_PROMPTS } from './suggested-prompts';

/**
 * Outer shell: resolves the conversation id (URL hash + localStorage
 * restore) BEFORE handing off to the inner `AskChat`. We key
 * `AskChat` by `conversationId` so:
 *
 *   - On initial mount, the inner only renders once the id and
 *     `initialMessages` are settled (no hydration mismatch from
 *     touching window early).
 *   - On "New chat", `conversationId` changes → React unmounts and
 *     remounts the inner → `useChat` reinitializes from scratch
 *     with `messages: []`.
 *
 * We render a "hold" state during the brief moment between mount
 * and the conversation effect — but since the effect runs
 * synchronously on the first commit, this is essentially a single
 * paint of an empty shell with a spinner-free header.
 */
export function AskShell() {
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
      <div className="flex flex-col h-[calc(100vh-128px)] max-w-3xl mx-auto bg-white border-x border-gray-100">
        <header className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-[22px] font-semibold text-gray-900 m-0">
            Ask the Commons
          </h1>
        </header>
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
    />
  );
}

type AskChatProps = {
  conversationId: string;
  initialMessages: UIMessage[];
  persist: (messages: UIMessage[]) => void;
  onNewConversation: () => void;
  shareUrl: string | null;
};

function AskChat({
  conversationId,
  initialMessages,
  persist,
  onNewConversation,
  shareUrl,
}: AskChatProps) {
  const [input, setInput] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  // Transport built once — DefaultChatTransport posts UIMessages to
  // /api/ask and reads the AI SDK UI message stream back.
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/ask' }),
    [],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    id: conversationId,
    messages: initialMessages,
    onError: (err) => {
      // The AI SDK surfaces Response errors as Error with response
      // attached. Parse for our typed error envelope.
      const msg = err?.message ?? '';
      if (msg.includes('rate_limited') || msg.includes('429')) {
        setErrorBanner("You've sent a lot of messages — wait a minute and try again.");
        setRetryAt(Date.now() + 60_000);
      } else if (msg.includes('chat_disabled') || msg.includes('503')) {
        setErrorBanner('Chat preview is not enabled in this environment.');
      } else {
        setErrorBanner('Connection hiccup — try again.');
      }
    },
  });

  // Retry-after countdown (re-renders every second while we're rate-limited).
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

  // Persist the latest message snapshot whenever it changes. The
  // `persist` callback is internally debounced 300ms in the hook so
  // streaming tokens coalesce into a single write per pause.
  useEffect(() => {
    persist(messages);
  }, [messages, persist]);

  const entries: ThreadEntry[] = useMemo(() => {
    const out: ThreadEntry[] = [];
    for (const m of messages) {
      // v5 UIMessage has `parts: Array<{ type: 'text' | 'tool-<name>' | ... }>`.
      // We flatten: text parts → message entries; tool parts → tool-call
      // indicators. For assistant messages we ALSO collect each tool
      // part into a `toolCalls` array attached to the resulting message
      // entry, so the "Show code" button can render the exported
      // snippet against the same source of truth.
      const parts = m.parts as
        | Array<{
            type: string;
            text?: string;
            toolName?: string;
            // AI SDK v5 ToolUIPart fields. `state` advances through
            // input-streaming → input-available → output-available; we
            // record whatever inputs/outputs are present at render
            // time. See node_modules/.pnpm/ai@5.0.186/dist/index.d.mts
            // around line 1655 for the canonical type.
            input?: unknown;
            output?: unknown;
          }>
        | undefined;

      if (!Array.isArray(parts)) continue;

      let buf = '';
      // Accumulator for tool calls in this message — gets attached to
      // the final assistant message entry pushed below so the "Show
      // code" button shows up once at the end of the turn.
      const toolCallsForMsg: Array<{
        toolName: string;
        args: unknown;
        result?: unknown;
      }> = [];

      for (const p of parts) {
        if (p.type === 'text' && typeof p.text === 'string') {
          buf += p.text;
        } else if (p.type.startsWith('tool-')) {
          // Flush any buffered text before showing the tool indicator
          // so the order in the UI matches the model's timeline.
          if (buf) {
            out.push({
              kind: 'message',
              role: m.role as 'user' | 'assistant',
              content: buf,
            });
            buf = '';
          }
          const toolName = p.toolName ?? p.type.replace(/^tool-/, '');
          out.push({
            kind: 'tool-call',
            toolName,
          });
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
        // Edge case: assistant turn that ended with a tool result but
        // no trailing text. Attach the tool history to the previous
        // assistant message entry so the button still renders.
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

  // Latest user question, for the snippet header banner.
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

  // Best-effort chat URL for the snippet header. SSR-safe — returns
  // undefined during server render so the snippet just omits the line.
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

  const hasAnyMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-128px)] max-w-3xl mx-auto bg-white border-x border-gray-100">
      <header className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-semibold text-gray-900 m-0">Ask the Commons</h1>
            <p className="mt-1 text-[14px] text-gray-500 m-0">
              Experimental preview. Ask about published NDI datasets in plain
              English — counts, contents, contributors, anything in the
              public catalog.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShareConversationButton shareUrl={shareUrl} />
            {hasAnyMessages && (
              <button
                type="button"
                onClick={onNewConversation}
                className="inline-flex items-center rounded-md px-2 py-1 text-[12.5px] font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors duration-(--duration-base) ease-(--ease-out)"
                aria-label="Start a new conversation"
                title="Start a new conversation"
              >
                New chat
              </button>
            )}
          </div>
        </div>
      </header>

      {isEmpty ? (
        <SuggestedPromptChips prompts={SUGGESTED_PROMPTS} onSelect={handleChipSelect} />
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
    </div>
  );
}

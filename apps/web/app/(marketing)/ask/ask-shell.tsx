'use client';

/**
 * Top-level client component for /ask.
 *
 * Composes:
 *   - ChatThread (messages + tool-call indicators)
 *   - SuggestedPromptChips (shown only when thread is empty)
 *   - ChatInput (textarea + Send)
 *
 * State managed by `useChat()` from `@ai-sdk/react` v5 — handles
 * streaming, SSE parsing, AbortSignal on unmount, and message
 * accumulation. We layer a tiny adapter on top to flatten the
 * SDK's `UIMessage[]` (each message has `parts: [{type: 'text' | 'tool-X', ...}]`)
 * into our `ThreadEntry[]` shape that ChatThread consumes.
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
import { DefaultChatTransport } from 'ai';
import { useEffect, useMemo, useState } from 'react';

import { ChatInput } from '@/components/ai/ChatInput';
import { ChatThread, type ThreadEntry } from '@/components/ai/ChatThread';
import { SuggestedPromptChips } from '@/components/ai/SuggestedPromptChips';

import { SUGGESTED_PROMPTS } from './suggested-prompts';

export function AskShell() {
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

  const entries: ThreadEntry[] = useMemo(() => {
    const out: ThreadEntry[] = [];
    for (const m of messages) {
      // v5 UIMessage has `parts: Array<{ type: 'text' | 'tool-<name>' | ... }>`.
      // We flatten: text parts → message entries; tool parts → tool-call indicators.
      const parts = m.parts as Array<{
        type: string;
        text?: string;
        toolName?: string;
      }> | undefined;

      if (!Array.isArray(parts)) continue;

      let buf = '';
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
          out.push({
            kind: 'tool-call',
            toolName: p.toolName ?? p.type.replace(/^tool-/, ''),
          });
        }
      }
      if (buf) {
        out.push({
          kind: 'message',
          role: m.role as 'user' | 'assistant',
          content: buf,
        });
      }
    }
    return out;
  }, [messages]);

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

  return (
    <div className="flex flex-col h-[calc(100vh-128px)] max-w-3xl mx-auto bg-white border-x border-gray-100">
      <header className="px-6 py-5 border-b border-gray-100">
        <h1 className="text-[22px] font-semibold text-gray-900 m-0">Ask the Commons</h1>
        <p className="mt-1 text-[14px] text-gray-500 m-0">
          Experimental preview. Ask about published NDI datasets in plain
          English — counts, contents, contributors, anything in the
          public catalog.
        </p>
      </header>

      {isEmpty ? (
        <SuggestedPromptChips prompts={SUGGESTED_PROMPTS} onSelect={handleChipSelect} />
      ) : (
        <ChatThread entries={entries} isStreaming={isStreaming} />
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

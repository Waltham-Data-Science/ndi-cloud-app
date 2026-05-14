'use client';

import { useEffect, useRef } from 'react';

import type { RecordedToolCall } from '@/lib/ai/code-export/types';

import { ChatMessage, type ChatRole } from './ChatMessage';
import { ToolCallIndicator } from './ToolCallIndicator';

export type ThreadEntry =
  | {
      kind: 'message';
      role: ChatRole;
      content: string;
      /**
       * Recorded tool calls for this message (assistant messages only).
       * Surfaces the "Show code" button when non-empty. Optional —
       * older callers that don't track tool history still work.
       */
      toolCalls?: RecordedToolCall[];
    }
  | { kind: 'tool-call'; toolName: string };

type Props = {
  entries: ThreadEntry[];
  isStreaming: boolean;
  /**
   * Latest user question, propagated to each assistant message so the
   * exported snippet's banner can include it. Optional — the snippet
   * renders a generic header when absent.
   */
  question?: string;
  /** Browser URL of the chat, also pasted into the snippet banner. */
  chatUrl?: string;
};

/**
 * Scrollable thread that renders messages + in-flight tool-call
 * indicators. Auto-scrolls to bottom on new entries AND on streaming
 * updates (so the latest tokens stay visible).
 *
 * Auto-scroll heuristic: only auto-scroll when the user is already
 * near the bottom. If they've scrolled up to re-read, don't yank
 * them back down.
 */
export function ChatThread({ entries, isStreaming, question, chatUrl }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const SCROLL_THRESHOLD_PX = 100;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD_PX;
    if (wasNearBottomRef.current || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
    wasNearBottomRef.current = nearBottom;
  }, [entries, isStreaming]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-6 py-4 space-y-3"
      role="log"
      aria-live="polite"
      aria-label="Chat conversation"
    >
      {entries.map((entry, idx) => {
        if (entry.kind === 'message') {
          return (
            <ChatMessage
              key={idx}
              role={entry.role}
              content={entry.content}
              toolCalls={entry.toolCalls}
              question={question}
              chatUrl={chatUrl}
            />
          );
        }
        return <ToolCallIndicator key={idx} toolName={entry.toolName} />;
      })}
    </div>
  );
}

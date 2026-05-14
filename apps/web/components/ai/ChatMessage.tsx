'use client';

import type { RecordedToolCall } from '@/lib/ai/code-export/types';

import { CodeExportButton } from './CodeExportButton';
import { Markdown } from './Markdown';

export type ChatRole = 'user' | 'assistant';

type Props = {
  role: ChatRole;
  content: string;
  /**
   * Optional recorded tool history for this assistant message. When
   * supplied (and non-empty), a "Show code" button is rendered below
   * the message body so the user can export the equivalent
   * Python + MATLAB snippets. Ignored for user messages.
   */
  toolCalls?: RecordedToolCall[];
  /**
   * Optional user-question + chat URL used to populate the snippet
   * banner. Both are best-effort; the snippet falls back to a generic
   * header when unset.
   */
  question?: string;
  chatUrl?: string;
};

/**
 * One chat bubble. User messages right-aligned brand-navy; assistant
 * messages left-aligned dark-on-light-gray, markdown rendered.
 *
 * No avatar, no timestamp, no read receipts — keep the demo visually
 * minimal so the *response quality* is the focus.
 */
export function ChatMessage({
  role,
  content,
  toolCalls,
  question,
  chatUrl,
}: Props) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-brand-navy text-white px-4 py-2.5 text-[15px] leading-relaxed shadow-sm">
          {content}
        </div>
      </div>
    );
  }
  const hasToolHistory = Array.isArray(toolCalls) && toolCalls.length > 0;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-gray-50 text-gray-900 px-4 py-2.5 text-[15px] border border-gray-100">
        <Markdown content={content} />
        {hasToolHistory && (
          <div className="mt-2 flex items-center gap-2">
            <CodeExportButton
              toolCalls={toolCalls!}
              question={question}
              chatUrl={chatUrl}
            />
          </div>
        )}
      </div>
    </div>
  );
}

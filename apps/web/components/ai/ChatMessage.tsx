'use client';

import { Markdown } from './Markdown';

export type ChatRole = 'user' | 'assistant';

type Props = {
  role: ChatRole;
  content: string;
};

/**
 * One chat bubble. User messages right-aligned brand-navy; assistant
 * messages left-aligned dark-on-light-gray, markdown rendered.
 *
 * No avatar, no timestamp, no read receipts — keep the demo visually
 * minimal so the *response quality* is the focus.
 */
export function ChatMessage({ role, content }: Props) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-brand-navy text-white px-4 py-2.5 text-[15px] leading-relaxed shadow-sm">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-gray-50 text-gray-900 px-4 py-2.5 text-[15px] border border-gray-100">
        <Markdown content={content} />
      </div>
    </div>
  );
}

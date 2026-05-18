'use client';

import { useRef, type FormEvent, type KeyboardEvent } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Multi-line text input + Send button.
 *
 * - Enter sends (Shift+Enter newline).
 * - Disabled state during in-flight stream + when rate-limited.
 * - Auto-grows up to ~5 lines, then scrolls (avoids the bubble
 *   taking over the whole viewport on long pastes).
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Ask about the NDI Commons catalog…',
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim().length > 0) onSubmit();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled && value.trim().length > 0) onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 p-3 border-t border-gray-200 bg-white"
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-gray-300 px-3.5 py-2.5 text-[15px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-gray-50 disabled:text-gray-400 max-h-[140px] overflow-y-auto"
        aria-label="Message input"
      />
      <button
        type="submit"
        disabled={disabled || value.trim().length === 0}
        className="rounded-xl bg-ndi-teal text-white px-5 py-2.5 text-[14px] font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed hover:-translate-y-px transition-transform duration-(--duration-base) ease-(--ease-out)"
      >
        Send
      </button>
    </form>
  );
}

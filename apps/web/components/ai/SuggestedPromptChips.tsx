'use client';

type Props = {
  prompts: readonly string[];
  onSelect: (prompt: string) => void;
};

/**
 * Starter prompt chips, shown only when the thread is empty.
 *
 * Mobile: single column.
 * Desktop: 2-column grid.
 */
export function SuggestedPromptChips({ prompts, onSelect }: Props) {
  return (
    <div className="px-6 py-4">
      <p className="text-[13px] uppercase tracking-wider text-gray-500 font-semibold mb-3">
        Try asking
      </p>
      <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2.5">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="text-left rounded-xl border border-gray-200 px-4 py-3 text-[14px] text-gray-700 hover:border-brand-300 hover:bg-brand-50 transition-colors duration-(--duration-base) ease-(--ease-out)"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

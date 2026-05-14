'use client';

import type { RecordedToolCall } from '@/lib/ai/code-export/types';
import type { Reference } from '@/lib/ai/references';

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
  // Granular completeness: collect every reference produced by the
  // assistant's tool calls and pass them to Markdown. The LLM's
  // `### Sources` footnote definitions are merged with these into
  // the SourcesPanel, so every chip the tools produced is visible
  // EVEN IF the LLM doesn't explicitly cite it via [^N] in prose.
  // Without this, per-group sample-row references (Saline / CNO
  // bucket samples) would be silently dropped whenever the LLM
  // chose not to footnote them.
  const toolReferences = hasToolHistory
    ? collectToolReferences(toolCalls!)
    : undefined;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-gray-50 text-gray-900 px-4 py-2.5 text-[15px] border border-gray-100">
        <Markdown content={content} toolReferences={toolReferences} />
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

/**
 * Walk every tool call's `result.references` array and return the
 * deduplicated union, keyed by URL. Tool results may be untyped at
 * the call-site (the AI SDK's `output` field is `unknown`), so we
 * defensively narrow.
 */
function collectToolReferences(toolCalls: RecordedToolCall[]): Reference[] {
  const seen = new Set<string>();
  const out: Reference[] = [];
  for (const call of toolCalls) {
    const result = call.result;
    if (!result || typeof result !== 'object') continue;
    const refs = (result as { references?: unknown }).references;
    if (!Array.isArray(refs)) continue;
    for (const r of refs) {
      if (!r || typeof r !== 'object') continue;
      const ref = r as Record<string, unknown>;
      const url = typeof ref.url === 'string' ? ref.url : '';
      const docId = typeof ref.doc_id === 'string' ? ref.doc_id : '';
      const title = typeof ref.title === 'string' ? ref.title : '';
      const cls = typeof ref.class === 'string' ? ref.class : 'reference';
      const snippet = typeof ref.snippet === 'string' ? ref.snippet : '';
      if (!url || !title) continue;
      // Dedupe by URL — same docId could surface from multiple
      // tool calls (e.g. semantic_search + ndi_query on the same
      // dataset).
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ doc_id: docId || url, url, class: cls, title, snippet });
    }
  }
  return out;
}

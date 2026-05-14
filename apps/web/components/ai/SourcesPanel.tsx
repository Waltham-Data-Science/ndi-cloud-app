'use client';

/**
 * SourcesPanel — the deduplicated list of citations at the bottom of an
 * assistant message. Renders each reference as a row with title, NDI
 * class badge, and a click-through to the Document Explorer.
 *
 * The LLM's "### Sources" section in the message body becomes this
 * panel. We override remark-gfm's default footnote-definition list
 * styling so the resulting panel matches the rest of the chat UI
 * rather than looking like raw markdown footnotes.
 *
 * # Plain `<a>` only — see CitationChip.tsx for the rationale. SPA
 * navigation via Next's `<Link>` was tearing users off /ask onto the
 * dataset detail page during streaming (visual-UX audit, P0-A).
 */
import type { Reference } from '@/lib/ndi/references';

interface Props {
  references: Reference[];
}

export function SourcesPanel({ references }: Props) {
  if (references.length === 0) return null;

  return (
    <aside className="mt-3 pt-3 border-t border-gray-200">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Sources
      </h4>
      <ol className="space-y-1.5 list-none p-0 m-0">
        {references.map((ref, i) => (
          <li key={`${ref.doc_id}-${i}`} className="flex items-start gap-2 text-[13px]">
            <span className="inline-flex shrink-0 items-center justify-center min-w-[18px] h-[18px] px-1 mt-0.5 text-[10px] font-semibold leading-none rounded-md bg-brand-blue/10 text-brand-blue">
              {i + 1}
            </span>
            <span className="flex-1 min-w-0">
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-900 hover:text-brand-blue no-underline hover:underline font-medium"
              >
                {ref.title}
              </a>
              <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-600 align-baseline">
                {ref.class}
              </span>
              {ref.snippet && (
                <span className="block text-[12px] text-gray-500 mt-0.5 line-clamp-1">
                  {ref.snippet}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

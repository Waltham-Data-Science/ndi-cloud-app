'use client';

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown renderer for assistant messages.
 *
 * Why react-markdown over a custom parser: handles GFM (tables,
 * strikethrough), code blocks, and link safety out of the box.
 * Disabling raw HTML (default) prevents the model from injecting
 * `<script>` even if a prompt-injection coaxed it.
 *
 * Internal-link rewriting: `/datasets/...` paths use next/link for
 * client-side nav; external URLs use `<a target="_blank">`.
 *
 * Styling: matches the marketing typography — slightly tighter than
 * default markdown so chat bubbles read as conversation, not a blog
 * post.
 */
type Props = { content: string };

export function Markdown({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...rest }) => {
          const url = href ?? '';
          const isInternal = url.startsWith('/') && !url.startsWith('//');
          if (isInternal) {
            return (
              <Link href={url} className="text-brand-blue underline hover:text-brand-blue-2">
                {children}
              </Link>
            );
          }
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-blue underline hover:text-brand-blue-2"
              {...rest}
            >
              {children}
            </a>
          );
        },
        p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-1">{children}</ol>,
        code: ({ children }) => (
          <code className="px-1 py-0.5 rounded bg-gray-100 text-[0.92em] font-mono">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-2 p-3 rounded-md bg-gray-50 border border-gray-200 overflow-x-auto text-[0.92em]">
            {children}
          </pre>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

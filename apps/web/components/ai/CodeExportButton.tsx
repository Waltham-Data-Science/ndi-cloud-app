'use client';

/**
 * "Show code" button + Python/MATLAB tabbed modal.
 *
 * Rendered next to every assistant message that has at least one
 * recorded tool call. Clicking opens a Modal with two language tabs;
 * each tab carries:
 *
 *   - the generated snippet inside a <pre><code>
 *   - a "Copy" button (navigator.clipboard.writeText)
 *   - a "Download .py" / "Download .m" button (Blob + anchor)
 *
 * Accessibility is provided by the shared <Modal/> primitive in
 * components/ui/Modal.tsx — focus trap, ESC, role="dialog",
 * aria-labelledby (via title), opener-focus restore on close. We
 * don't reinvent any of that here.
 *
 * Why the snippet is regenerated lazily (only when the modal opens):
 * each chat message can have a dozen tool calls; generating + holding
 * both languages on every render of every assistant message would
 * spike CPU on a busy thread. The lazy compute fires once per modal
 * open and the result is memoized for the modal's lifetime.
 */
import { useCallback, useMemo, useState } from 'react';

import { Modal } from '@/components/ui/Modal';

import type { RecordedToolCall } from '@/lib/ndi/code-export/types';
import { generateMatlabSnippet } from '@/lib/ndi/code-export/matlab';
import { generatePythonSnippet } from '@/lib/ndi/code-export/python';

interface Props {
  toolCalls: RecordedToolCall[];
  /** Optional banner data for the snippet header (question + chat URL). */
  question?: string;
  chatUrl?: string;
}

type Lang = 'python' | 'matlab';

export function CodeExportButton({ toolCalls, question, chatUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>('python');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  // Lazy snippet generation. Memoized on (open, toolCalls, lang etc.)
  // so it doesn't refire on unrelated re-renders. We still gate on
  // `open` so the work is skipped entirely while the modal is closed.
  const snippet = useMemo(() => {
    if (!open) return '';
    if (lang === 'python') {
      return generatePythonSnippet(toolCalls, { question, chatUrl });
    }
    return generateMatlabSnippet(toolCalls, { question, chatUrl });
  }, [open, lang, toolCalls, question, chatUrl]);

  const handleCopy = useCallback(async () => {
    try {
      // Older Safari + insecure-context environments don't have the
      // Clipboard API. We surface a small status pill rather than
      // crashing the button.
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        setCopyState('error');
        return;
      }
      await navigator.clipboard.writeText(snippet);
      setCopyState('copied');
      // Reset the pill after ~2s so repeated copies stay obvious.
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
    }
  }, [snippet]);

  const handleDownload = useCallback(() => {
    const ext = lang === 'python' ? 'py' : 'm';
    const mime =
      lang === 'python' ? 'text/x-python' : 'text/x-matlab';
    const blob = new Blob([snippet], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ndi-ask-snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [snippet, lang]);

  // Don't render anything when there's nothing to export. The parent
  // already filters on "assistant + has tool calls" before mounting,
  // but a defensive guard keeps the test surface clean.
  if (toolCalls.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setCopyState('idle');
        }}
        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        aria-haspopup="dialog"
        data-testid="code-export-button"
      >
        <span aria-hidden>{'</>'}</span>
        Show code
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Reproduce in your notebook"
        description="Python + MATLAB snippets that mirror the tool calls the chat made."
        size="xl"
      >
        <div data-testid="code-export-modal">
          <div
            role="tablist"
            aria-label="Snippet language"
            className="flex gap-1 border-b border-gray-200 mb-3"
          >
            <TabButton
              label="Python"
              active={lang === 'python'}
              onClick={() => {
                setLang('python');
                setCopyState('idle');
              }}
            />
            <TabButton
              label="MATLAB"
              active={lang === 'matlab'}
              onClick={() => {
                setLang('matlab');
                setCopyState('idle');
              }}
            />
          </div>

          <div className="flex items-center justify-between mb-2 gap-2">
            <div
              role="status"
              aria-live="polite"
              className="text-[12px] text-gray-500 min-h-[1em]"
              data-testid="code-export-status"
            >
              {copyState === 'copied' && 'Copied to clipboard.'}
              {copyState === 'error' && 'Clipboard unavailable — use Download.'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
                data-testid="code-export-copy"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-md bg-brand-navy px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-navy/90"
                data-testid="code-export-download"
              >
                Download .{lang === 'python' ? 'py' : 'm'}
              </button>
            </div>
          </div>

          <pre
            role="tabpanel"
            aria-label={lang === 'python' ? 'Python snippet' : 'MATLAB snippet'}
            data-testid="code-export-snippet"
            className="max-h-[55vh] overflow-auto rounded-md bg-gray-900 text-gray-100 p-3 text-[12.5px] leading-snug font-mono whitespace-pre"
          >
            <code className={`language-${lang}`}>{snippet}</code>
          </pre>
        </div>
      </Modal>
    </>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'px-3 py-1.5 text-[13px] font-medium border-b-2 -mb-px ' +
        (active
          ? 'border-brand-navy text-brand-navy'
          : 'border-transparent text-gray-500 hover:text-gray-800')
      }
    >
      {label}
    </button>
  );
}

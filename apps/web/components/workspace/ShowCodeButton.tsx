'use client';

/**
 * ShowCodeButton — wraps the existing CodeExportButton for use inside
 * workspace panels.
 *
 * The chat surfaces "Show code" once per ASSISTANT MESSAGE, collecting
 * every tool call that ran for that message. The workspace pattern is
 * different — each panel has ONE tool call (the latest run), so we
 * adapt the CodeExportButton API by wrapping a single-call array:
 *
 *   <ShowCodeButton
 *     toolName="fetch_signal"
 *     args={{ datasetId: "...", docId: "...", downsample: 2000 }}
 *     result={lastRunResult}
 *     disabled={!hasRun}
 *   />
 *
 * The underlying CodeExportButton then renders the Python + MATLAB
 * tabbed modal with the canonical snippet for that one tool call. No
 * duplication — same snippet generators that power the chat.
 */
import type { RecordedToolCall } from '@/lib/ai/code-export/types';

import { CodeExportButton } from '@/components/ai/CodeExportButton';

interface ShowCodeButtonProps {
  /** Tool registry key, e.g. "fetch_signal" or "tabular_query". */
  toolName: string;
  /** The parameter form values from the panel's last run. */
  args: unknown;
  /** The tool response (optional — generators handle missing result). */
  result?: unknown;
  /** When true, the button is hidden — useful when no run has happened. */
  disabled?: boolean;
}

export function ShowCodeButton({
  toolName,
  args,
  result,
  disabled = false,
}: ShowCodeButtonProps) {
  if (disabled) return null;
  const toolCalls: RecordedToolCall[] = [{ toolName, args, result }];
  return <CodeExportButton toolCalls={toolCalls} />;
}

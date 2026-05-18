/**
 * Shared type definition for one recorded tool call exposed to the
 * code-export generators.
 *
 * The chat UI walks each assistant `UIMessage.parts` and flattens any
 * `tool-<name>` part into this shape. We keep the structure narrow on
 * purpose: snippet generators only need the name, the inputs the
 * model passed, and (optionally) the output it received. Everything
 * else from the AI SDK's `ToolUIPart` (callId, state machine,
 * provider metadata) is intentionally dropped — adding more fields
 * makes the generator harder to test without buying any code-quality
 * win.
 */

export interface RecordedToolCall {
  /** Tool registry key (e.g. "tabular_query", "fetch_signal"). */
  toolName: string;
  /** Validated inputs the model passed to the tool. JSON-ish. */
  args: unknown;
  /**
   * Tool result, when available. Some snippets (semantic_search →
   * comment-list) read the result to surface the dataset IDs the
   * chat found. Most don't need it. Optional because the generator
   * runs on the latest message state, including in-flight tool
   * calls whose result hasn't streamed in yet.
   */
  result?: unknown;
}

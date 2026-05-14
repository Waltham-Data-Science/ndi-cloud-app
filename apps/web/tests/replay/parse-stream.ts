/**
 * AI SDK v5 UI message stream parser for the replay harness.
 *
 * The /api/ask endpoint returns Vercel AI SDK's UI message stream
 * format: Server-Sent Events where every event is one line of the
 * form `data: <json>\n` followed by a blank line. Each JSON chunk
 * is a UIMessageChunk discriminated by its `type` field (see
 * `node_modules/ai/dist/index.d.ts` line ~1847 for the union).
 *
 * The chunk types we care about:
 *
 *   text-start / text-delta / text-end
 *     The assistant's natural-language answer streams as text-delta
 *     chunks each carrying a `delta: string`. We concatenate all
 *     deltas for the final assistant text. Multiple text streams can
 *     be open in parallel — each has its own `id`.
 *
 *   tool-input-available
 *     Fired when the model has decided on a tool call and its input
 *     is fully assembled (after any tool-input-delta streaming). We
 *     capture {toolName, input, toolCallId} here. Order matters — the
 *     replay assertions check tool invocation order.
 *
 *   tool-output-available
 *     Fired after the tool handler returns. Carries the parsed JSON
 *     output keyed by toolCallId. We pair each output back to its
 *     matching input call.
 *
 *   tool-output-error / tool-input-error
 *     Soft failures from the tool layer (e.g. upstream timeout).
 *     Recorded so the replay can distinguish "model picked the right
 *     tool but the upstream broke" from "model picked the wrong tool".
 *
 *   error
 *     Stream-level error from the AI SDK itself (e.g. Anthropic 503).
 *
 *   start / finish / start-step / finish-step / abort
 *     Control-flow chunks. We don't capture these — they don't affect
 *     the assertions.
 *
 * Anything else is ignored — forward-compat.
 *
 * The parser is byte-stream driven: we feed it Uint8Array chunks
 * (one per fetch ReadableStream pull) and it emits parsed events as
 * they're discovered. Newline boundaries don't necessarily align with
 * chunk boundaries, so we keep a rolling buffer.
 */

export interface ToolCallRecord {
  /** Tool name as registered in lib/ai/tools.ts (e.g. "list_published_datasets"). */
  toolName: string;
  /** The model's chosen input arguments — parsed JSON. */
  input: unknown;
  /** AI SDK-assigned identifier; pairs input ↔ output chunks. */
  toolCallId: string;
  /** Parsed output, populated when the matching tool-output-available chunk arrives. */
  output?: unknown;
  /** Set if the tool failed at the input-validation or output stage. */
  error?: string;
}

export interface ParsedStream {
  /** Concatenated text-delta payloads in order, across all text streams. */
  assistantText: string;
  /** Tool calls in the order they appeared (tool-input-available events). */
  toolCalls: ToolCallRecord[];
  /** Stream-level error, if the AI SDK emitted one. */
  streamError?: string;
}

/**
 * Synchronous parser: takes the raw concatenated SSE body as a string
 * and returns the aggregated result. Used by the unit tests (which
 * synthesize stream bodies directly) and by the Playwright replay
 * after it has drained the response body.
 *
 * Stream-format notes:
 *   - Each event is `data: <json>\n\n` (per the SSE spec the AI SDK
 *     follows). Some chunks may share the same `data:` line if the
 *     SDK ever changes — we tolerate either layout by splitting on
 *     the leading `data:` token rather than on the blank-line
 *     delimiter alone.
 *   - Comments / heartbeats start with `:` per SSE; we skip those.
 */
export function parseStreamBody(body: string): ParsedStream {
  const result: ParsedStream = { assistantText: '', toolCalls: [] };
  // Index by toolCallId so we can fold output chunks onto their
  // matching input record. Tool order is preserved in result.toolCalls.
  const byCallId = new Map<string, ToolCallRecord>();

  for (const line of body.split('\n')) {
    const trimmed = line.trimStart();
    if (!trimmed) continue;
    if (trimmed.startsWith(':')) continue; // SSE comment / heartbeat
    if (!trimmed.startsWith('data:')) continue;

    const payload = trimmed.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') continue;

    let chunk: unknown;
    try {
      chunk = JSON.parse(payload);
    } catch {
      // Malformed line — could be a split chunk we haven't fully
      // accumulated. The streaming variant handles this; the sync
      // parser is only called on a complete body so just skip.
      continue;
    }

    applyChunk(chunk, result, byCallId);
  }

  return result;
}

/**
 * Streaming variant — call `feed()` with each Uint8Array as it arrives
 * from a ReadableStream, then `finalize()` to flush any trailing
 * partial event. Useful when running against a live HTTP endpoint
 * where we want to surface tool calls as they happen (for debug
 * logging) rather than only at the end.
 */
export function createStreamParser(): {
  feed: (chunk: Uint8Array) => ToolCallRecord[];
  finalize: () => ParsedStream;
} {
  const decoder = new TextDecoder();
  let buffer = '';
  const result: ParsedStream = { assistantText: '', toolCalls: [] };
  const byCallId = new Map<string, ToolCallRecord>();

  function drainCompleteLines(): ToolCallRecord[] {
    const newCalls: ToolCallRecord[] = [];
    let idx: number;
    // SSE delimiter is \n\n, but we also split on single \n so we
    // process each `data:` line as soon as it's complete. This matches
    // how the AI SDK serializes — one chunk per line.
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);

      const trimmed = line.trimStart();
      if (!trimmed) continue;
      if (trimmed.startsWith(':')) continue;
      if (!trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice('data:'.length).trim();
      if (!payload || payload === '[DONE]') continue;

      let chunk: unknown;
      try {
        chunk = JSON.parse(payload);
      } catch {
        // Incomplete JSON — put the line back at the front of the
        // buffer (with its newline) so the next feed() can re-try
        // once the rest arrives.
        buffer = `${line}\n${buffer}`;
        break;
      }

      const beforeCount = result.toolCalls.length;
      applyChunk(chunk, result, byCallId);
      if (result.toolCalls.length > beforeCount) {
        newCalls.push(result.toolCalls[result.toolCalls.length - 1]!);
      }
    }
    return newCalls;
  }

  return {
    feed(chunk: Uint8Array): ToolCallRecord[] {
      buffer += decoder.decode(chunk, { stream: true });
      return drainCompleteLines();
    },
    finalize(): ParsedStream {
      // Decode any pending bytes (flushes the TextDecoder).
      buffer += decoder.decode();
      // Make sure a trailing line without a terminating \n is still
      // processed.
      if (buffer && !buffer.endsWith('\n')) buffer += '\n';
      drainCompleteLines();
      return result;
    },
  };
}

// ─── internal: dispatch a single parsed chunk into the accumulator ──

function applyChunk(
  chunk: unknown,
  acc: ParsedStream,
  byCallId: Map<string, ToolCallRecord>,
): void {
  if (!chunk || typeof chunk !== 'object') return;
  const c = chunk as { type?: string } & Record<string, unknown>;
  switch (c.type) {
    case 'text-delta': {
      if (typeof c.delta === 'string') acc.assistantText += c.delta;
      return;
    }
    case 'tool-input-available': {
      const toolCallId = typeof c.toolCallId === 'string' ? c.toolCallId : '';
      const toolName = typeof c.toolName === 'string' ? c.toolName : '';
      if (!toolCallId || !toolName) return;
      const record: ToolCallRecord = {
        toolName,
        input: c.input,
        toolCallId,
      };
      acc.toolCalls.push(record);
      byCallId.set(toolCallId, record);
      return;
    }
    case 'tool-output-available': {
      const id = typeof c.toolCallId === 'string' ? c.toolCallId : '';
      const rec = byCallId.get(id);
      if (rec) rec.output = c.output;
      return;
    }
    case 'tool-output-error': {
      const id = typeof c.toolCallId === 'string' ? c.toolCallId : '';
      const rec = byCallId.get(id);
      if (rec) rec.error = typeof c.errorText === 'string' ? c.errorText : 'tool-output-error';
      return;
    }
    case 'tool-input-error': {
      // Input-error chunks may arrive before any input-available, so
      // synthesize a record if we haven't seen the call yet.
      const toolCallId = typeof c.toolCallId === 'string' ? c.toolCallId : '';
      const toolName = typeof c.toolName === 'string' ? c.toolName : '';
      if (!toolCallId || !toolName) return;
      let rec = byCallId.get(toolCallId);
      if (!rec) {
        rec = { toolName, input: c.input, toolCallId };
        acc.toolCalls.push(rec);
        byCallId.set(toolCallId, rec);
      }
      rec.error = typeof c.errorText === 'string' ? c.errorText : 'tool-input-error';
      return;
    }
    case 'error': {
      acc.streamError = typeof c.errorText === 'string' ? c.errorText : 'stream error';
      return;
    }
    default:
      // start / finish / start-step / finish-step / text-start /
      // text-end / reasoning-* / source-* / file / data-* / abort /
      // message-metadata — ignored by the replay harness.
      return;
  }
}

// ─── helper assertions used by the replay spec ──────────────────────

/**
 * Count [^N] footnote DEFINITIONS in the assistant text. The system
 * prompt mandates `### Sources` followed by `[^N]: [Title](url) — class`.
 * We count distinct N values that appear at the start of a line as
 * `[^N]:` so the replay can enforce expected_references_min.
 *
 * Why not count inline `[^N]` markers? Because the model is allowed
 * to reuse the same N (cite source 1 in three different sentences),
 * so inline counts are noisy. Definitions are 1-to-1 with sources.
 */
export function countReferenceDefinitions(text: string): number {
  const seen = new Set<string>();
  const re = /^\s*\[\^(\d+)\]\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    seen.add(m[1]!);
  }
  return seen.size;
}

/**
 * Detect a fenced code block with the given language tag, e.g.
 * extractChartFence(text, 'violin-chart') -> true if any
 * ```violin-chart\n…\n``` block exists.
 *
 * The tag may sit on the same line as the opening fence with optional
 * trailing whitespace; the model occasionally emits a CRLF, which we
 * also tolerate.
 */
export function hasChartFence(text: string, tag: string): boolean {
  // Escape regex-special chars in the tag (none of our tags have any,
  // but future-proof anyway).
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\`\`\`\\s*${escaped}\\s*\\r?\\n[\\s\\S]*?\\r?\\n\`\`\``);
  return re.test(text);
}

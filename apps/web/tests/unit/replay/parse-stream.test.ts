/**
 * Unit tests for the AI SDK v5 stream parser used by the replay harness.
 *
 * The replay harness's correctness hinges on this parser correctly:
 *   1. Recognizing tool-input-available chunks and capturing them in order
 *   2. Pairing tool-output-available back to its tool-input-available by
 *      toolCallId
 *   3. Accumulating text-delta across multiple text streams
 *   4. Tolerating split SSE lines across chunk boundaries (streaming mode)
 *   5. Detecting chart fences (signal-chart / violin-chart)
 *   6. Counting [^N] footnote definitions for the references-min assertion
 *
 * We feed synthetic stream bodies that mimic what the AI SDK actually
 * emits (cross-referenced against node_modules/ai/dist/index.d.ts
 * lines ~1847-1951 where UIMessageChunk is defined).
 */
import { describe, it, expect } from 'vitest';

import {
  countReferenceDefinitions,
  createStreamParser,
  hasChartFence,
  parseStreamBody,
} from '@/tests/replay/parse-stream';

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

describe('parseStreamBody', () => {
  it('returns empty result for an empty body', () => {
    const r = parseStreamBody('');
    expect(r.assistantText).toBe('');
    expect(r.toolCalls).toEqual([]);
    expect(r.streamError).toBeUndefined();
  });

  it('concatenates text-delta payloads into assistantText', () => {
    const body =
      sse({ type: 'start', messageId: 'm1' }) +
      sse({ type: 'start-step' }) +
      sse({ type: 'text-start', id: 't1' }) +
      sse({ type: 'text-delta', delta: 'Hello ', id: 't1' }) +
      sse({ type: 'text-delta', delta: 'world.', id: 't1' }) +
      sse({ type: 'text-end', id: 't1' }) +
      sse({ type: 'finish-step' }) +
      sse({ type: 'finish' });
    const r = parseStreamBody(body);
    expect(r.assistantText).toBe('Hello world.');
    expect(r.toolCalls).toEqual([]);
  });

  it('captures tool-input-available calls in order', () => {
    const body =
      sse({ type: 'start', messageId: 'm1' }) +
      sse({
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'list_published_datasets',
        input: { pageSize: 1 },
      }) +
      sse({
        type: 'tool-output-available',
        toolCallId: 'call-1',
        output: { totalNumber: 3, datasets: [] },
      }) +
      sse({
        type: 'tool-input-available',
        toolCallId: 'call-2',
        toolName: 'get_dataset_summary',
        input: { id: 'abc' },
      }) +
      sse({
        type: 'tool-output-available',
        toolCallId: 'call-2',
        output: { name: 'Dabrowska' },
      }) +
      sse({ type: 'finish' });

    const r = parseStreamBody(body);
    expect(r.toolCalls.map((c) => c.toolName)).toEqual([
      'list_published_datasets',
      'get_dataset_summary',
    ]);
    expect(r.toolCalls[0]!.input).toEqual({ pageSize: 1 });
    expect(r.toolCalls[0]!.output).toEqual({ totalNumber: 3, datasets: [] });
    expect(r.toolCalls[1]!.output).toEqual({ name: 'Dabrowska' });
  });

  it('records tool-output-error against the matching call', () => {
    const body =
      sse({
        type: 'tool-input-available',
        toolCallId: 'call-1',
        toolName: 'fetch_signal',
        input: { datasetId: 'x', docId: 'y' },
      }) +
      sse({
        type: 'tool-output-error',
        toolCallId: 'call-1',
        errorText: 'binary not decodable',
      });
    const r = parseStreamBody(body);
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]!.error).toBe('binary not decodable');
    expect(r.toolCalls[0]!.output).toBeUndefined();
  });

  it('captures stream-level error chunks', () => {
    const body = sse({ type: 'error', errorText: 'Anthropic 529' });
    const r = parseStreamBody(body);
    expect(r.streamError).toBe('Anthropic 529');
  });

  it('ignores chunks with unknown types (forward-compat)', () => {
    const body =
      sse({ type: 'text-delta', delta: 'hi', id: 't1' }) +
      sse({ type: 'future-unknown', payload: 42 }) +
      sse({ type: 'text-delta', delta: ' there', id: 't1' });
    const r = parseStreamBody(body);
    expect(r.assistantText).toBe('hi there');
  });

  it('skips SSE comments and the [DONE] sentinel', () => {
    const body =
      ': heartbeat\n\n' +
      sse({ type: 'text-delta', delta: 'ok', id: 't1' }) +
      'data: [DONE]\n\n';
    const r = parseStreamBody(body);
    expect(r.assistantText).toBe('ok');
  });

  it('tolerates malformed JSON lines mid-stream', () => {
    const body =
      sse({ type: 'text-delta', delta: 'before ', id: 't1' }) +
      'data: {not json\n\n' +
      sse({ type: 'text-delta', delta: 'after', id: 't1' });
    const r = parseStreamBody(body);
    expect(r.assistantText).toBe('before after');
  });

  it('interleaves text and tool calls in stream order', () => {
    // The model can emit text BEFORE calling a tool (preamble), tool
    // results come in, then more text. Our parser concatenates ALL
    // text across the message — the order is captured by toolCalls
    // appearing in their stream position, but assistantText is the
    // final accumulated answer.
    const body =
      sse({ type: 'text-delta', delta: 'Let me check. ', id: 't1' }) +
      sse({
        type: 'tool-input-available',
        toolCallId: 'c1',
        toolName: 'list_published_datasets',
        input: {},
      }) +
      sse({ type: 'tool-output-available', toolCallId: 'c1', output: { totalNumber: 8 } }) +
      sse({ type: 'text-delta', delta: 'There are 8 datasets.', id: 't2' });
    const r = parseStreamBody(body);
    expect(r.assistantText).toBe('Let me check. There are 8 datasets.');
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]!.toolName).toBe('list_published_datasets');
  });
});

describe('createStreamParser (streaming)', () => {
  function feedAll(parser: ReturnType<typeof createStreamParser>, body: string): void {
    // Feed in 17-byte chunks to exercise the boundary-crossing path.
    const enc = new TextEncoder();
    const bytes = enc.encode(body);
    for (let i = 0; i < bytes.length; i += 17) {
      parser.feed(bytes.subarray(i, Math.min(i + 17, bytes.length)));
    }
  }

  it('produces the same result as parseStreamBody for a complete body', () => {
    const body =
      sse({
        type: 'tool-input-available',
        toolCallId: 'c1',
        toolName: 'list_published_datasets',
        input: { pageSize: 1 },
      }) +
      sse({ type: 'tool-output-available', toolCallId: 'c1', output: { totalNumber: 8 } }) +
      sse({ type: 'text-delta', delta: 'Hello.', id: 't1' });

    const stream = createStreamParser();
    feedAll(stream, body);
    const r = stream.finalize();

    expect(r.assistantText).toBe('Hello.');
    expect(r.toolCalls.map((c) => c.toolName)).toEqual(['list_published_datasets']);
    expect(r.toolCalls[0]!.output).toEqual({ totalNumber: 8 });
  });

  it('returns newly-discovered tool calls from each feed()', () => {
    const parser = createStreamParser();
    const enc = new TextEncoder();
    const part1 = sse({
      type: 'tool-input-available',
      toolCallId: 'c1',
      toolName: 'list_published_datasets',
      input: {},
    });
    const newCalls1 = parser.feed(enc.encode(part1));
    expect(newCalls1).toHaveLength(1);
    expect(newCalls1[0]!.toolName).toBe('list_published_datasets');

    // A second call surfaces from a follow-up feed.
    const part2 = sse({
      type: 'tool-input-available',
      toolCallId: 'c2',
      toolName: 'get_dataset_summary',
      input: { id: 'abc' },
    });
    const newCalls2 = parser.feed(enc.encode(part2));
    expect(newCalls2).toHaveLength(1);
    expect(newCalls2[0]!.toolName).toBe('get_dataset_summary');
  });

  it('handles a JSON chunk that spans multiple feed() calls', () => {
    const parser = createStreamParser();
    const enc = new TextEncoder();
    const fullEvent = sse({ type: 'text-delta', delta: 'hello world', id: 't1' });
    // Split in the middle of the JSON payload.
    const splitAt = fullEvent.length / 2;
    parser.feed(enc.encode(fullEvent.slice(0, splitAt)));
    parser.feed(enc.encode(fullEvent.slice(splitAt)));
    const r = parser.finalize();
    expect(r.assistantText).toBe('hello world');
  });
});

describe('countReferenceDefinitions', () => {
  it('returns 0 when there are no footnotes', () => {
    expect(countReferenceDefinitions('Hello world.')).toBe(0);
  });

  it('counts distinct [^N] definitions in a Sources block', () => {
    const text = `
There are 8 datasets [^1].

### Sources
[^1]: [NDI catalog](/datasets) — facets
[^2]: [Dabrowska](/datasets/x/overview) — dataset
`;
    expect(countReferenceDefinitions(text)).toBe(2);
  });

  it('ignores inline [^N] markers — only counts definitions', () => {
    // Six inline references, but only 1 definition. We want 1.
    const text = `
The dataset has 9 strains [^1] and 215 subjects [^1] across 606 probes [^1].
Three more references [^1] [^1] [^1].

### Sources
[^1]: [Dataset](/datasets/x) — dataset
`;
    expect(countReferenceDefinitions(text)).toBe(1);
  });

  it('deduplicates repeated definitions', () => {
    // Pathological: two [^1] definitions (LLM mistake). Count = 1.
    const text = `
[^1]: [A](/a) — x
[^1]: [B](/b) — x
[^2]: [C](/c) — y
`;
    expect(countReferenceDefinitions(text)).toBe(2);
  });
});

describe('hasChartFence', () => {
  it('detects a violin-chart fence with payload', () => {
    const text =
      'Here is the comparison [^1].\n\n' +
      '```violin-chart\n' +
      '{"datasetId":"x","variableNameContains":"EPM"}\n' +
      '```\n';
    expect(hasChartFence(text, 'violin-chart')).toBe(true);
  });

  it('detects a signal-chart fence', () => {
    const text =
      '```signal-chart\n' + '{"datasetId":"x","docId":"y"}\n' + '```';
    expect(hasChartFence(text, 'signal-chart')).toBe(true);
  });

  it('returns false when the requested fence is absent', () => {
    const text = '```violin-chart\n{}\n```';
    expect(hasChartFence(text, 'signal-chart')).toBe(false);
  });

  it('returns false on an opening fence with no closer', () => {
    const text = '```violin-chart\n{"datasetId":"x"}';
    expect(hasChartFence(text, 'violin-chart')).toBe(false);
  });

  it('tolerates CRLF line endings', () => {
    const text = '```violin-chart\r\n{"a":1}\r\n```';
    expect(hasChartFence(text, 'violin-chart')).toBe(true);
  });
});

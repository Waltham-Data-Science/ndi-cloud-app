/**
 * Demo-prompt replay harness for the experimental /ask chat.
 *
 * For each prompt in prompts.json:
 *   1. POST it to <REPLAY_TARGET_URL>/api/ask as a single user UIMessage
 *   2. Drain the AI SDK v5 UI message stream (text-delta + tool-* chunks)
 *   3. Assert tool path matches expected_tools (order-sensitive,
 *      allows interleaved exploratory calls as long as the expected
 *      sequence appears as a subsequence)
 *   4. Assert no forbidden_tools fired (catches misroutes — e.g.
 *      query_documents for a tabular_query prompt)
 *   5. Assert chart fence presence iff expected_chart_fence set
 *   6. Assert final text contains expected substrings (case-insensitive)
 *   7. Assert reference-definition count >= expected_references_min
 *
 * Skip mode: when REPLAY_TARGET_URL is unset, every test calls
 * test.skip(). This keeps the suite green in CI environments where
 * we haven't pinned a preview URL. The replay is intended to run
 * against:
 *
 *   - A Vercel preview deploy for the feat/experimental-ask-chat
 *     branch (deploys the experimental backend wiring)
 *   - A local `pnpm dev` against ndb-v2-experimental Railway
 *
 * Per-prompt timeout: 60s (matches /api/ask's maxDuration). The full
 * suite runs sequentially (workers: 1 in the config below) because
 * the upstream rate-limiter is per-IP and parallel calls would
 * trigger 429s on a busy preview.
 *
 * Cost note: each replay run hits Anthropic ~10 times (one model
 * turn per prompt × ~3-12 steps per turn × ~1500 input tokens
 * cached). Roughly $0.50-$1.50 per full replay against a Sonnet
 * tier. Run on PR review and on demand, not on every commit.
 *
 * After the run, a verdict table is printed to stdout. The
 * Playwright HTML report at playwright-report/ has the full per-
 * prompt streaming transcripts as test attachments.
 */
import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  countReferenceDefinitions,
  createStreamParser,
  hasChartFence,
  type ToolCallRecord,
} from './parse-stream';

interface PromptFixture {
  id: string;
  prompt: string;
  expected_tools: string[];
  forbidden_tools: string[];
  expected_chart_fence: string | null;
  expected_text_contains: string[];
  expected_references_min: number;
  notes: string;
}

interface PromptsFile {
  prompts: PromptFixture[];
}

interface Verdict {
  id: string;
  status: 'pass' | 'fail' | 'skip';
  reason?: string;
  toolsFired: string[];
  durationMs: number;
}

const PROMPTS_PATH = path.join(__dirname, 'prompts.json');
const TARGET_URL = process.env.REPLAY_TARGET_URL;

// Module-scope so the final reporter sees every verdict regardless of
// which test populates it. Playwright runs each test in the same node
// worker (we pin workers: 1 below) so this Map is safe to share.
const VERDICTS: Verdict[] = [];

const fixtures: PromptsFile = JSON.parse(
  fs.readFileSync(PROMPTS_PATH, 'utf-8'),
) as PromptsFile;

test.describe('/ask replay harness', () => {
  // Single worker — sequential across prompts. The upstream rate-
  // limiter is per-IP, and parallel preview-URL calls share an IP at
  // the Vercel edge, so 2+ workers would trip 429s on the second
  // prompt in flight.
  test.describe.configure({ mode: 'serial' });

  for (const fx of fixtures.prompts) {
    test(`replay: ${fx.id} — ${fx.prompt.slice(0, 60)}…`, async ({}, testInfo) => {
      testInfo.setTimeout(60_000);

      if (!TARGET_URL) {
        VERDICTS.push({
          id: fx.id,
          status: 'skip',
          reason: 'REPLAY_TARGET_URL unset',
          toolsFired: [],
          durationMs: 0,
        });
        test.skip(true, 'REPLAY_TARGET_URL not set — skipping live replay');
        return;
      }

      const started = Date.now();
      let toolsFired: string[] = [];
      let assistantText = '';
      let streamError: string | undefined;
      let reason: string | undefined;

      try {
        const result = await runOne(TARGET_URL, fx.prompt);
        toolsFired = result.toolCalls.map((c) => c.toolName);
        assistantText = result.assistantText;
        streamError = result.streamError;

        // Attach full transcript to the Playwright report for
        // post-mortem debugging.
        await testInfo.attach('assistant-text.md', {
          body: assistantText,
          contentType: 'text/markdown',
        });
        await testInfo.attach('tool-calls.json', {
          body: JSON.stringify(result.toolCalls, null, 2),
          contentType: 'application/json',
        });

        // --- Stream-level error gates everything else ---
        if (streamError) {
          throw new Error(`Stream emitted error chunk: ${streamError}`);
        }

        // --- Tool-path assertion (order-sensitive subsequence) ---
        expect(
          isSubsequence(fx.expected_tools, toolsFired),
          `expected tool sequence ${JSON.stringify(fx.expected_tools)} as a subsequence of actual ${JSON.stringify(toolsFired)}`,
        ).toBe(true);

        // --- Forbidden tools ---
        for (const forbidden of fx.forbidden_tools) {
          expect(
            toolsFired.includes(forbidden),
            `forbidden tool "${forbidden}" was called — full trace: ${JSON.stringify(toolsFired)}`,
          ).toBe(false);
        }

        // --- Chart fence ---
        if (fx.expected_chart_fence) {
          expect(
            hasChartFence(assistantText, fx.expected_chart_fence),
            `expected a \`\`\`${fx.expected_chart_fence} fence in assistant answer`,
          ).toBe(true);
        }

        // --- Text contains ---
        for (const needle of fx.expected_text_contains) {
          expect(
            assistantText.toLowerCase().includes(needle.toLowerCase()),
            `expected assistant text to contain "${needle}"`,
          ).toBe(true);
        }

        // --- References min ---
        const refCount = countReferenceDefinitions(assistantText);
        expect(
          refCount >= fx.expected_references_min,
          `expected ≥${fx.expected_references_min} reference definitions, got ${refCount}`,
        ).toBe(true);

        VERDICTS.push({
          id: fx.id,
          status: 'pass',
          toolsFired,
          durationMs: Date.now() - started,
        });
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
        VERDICTS.push({
          id: fx.id,
          status: 'fail',
          reason,
          toolsFired,
          durationMs: Date.now() - started,
        });
        throw e;
      }
    });
  }

  test.afterAll(() => {
    printVerdictTable(VERDICTS);
  });
});

/**
 * Drive one prompt end-to-end: POST to /api/ask, drain the UI message
 * stream, return the aggregated parse result.
 *
 * Body shape matches what useChat()+DefaultChatTransport posts (see
 * `app/api/ask/route.ts` / `app/(marketing)/ask/ask-shell.tsx`):
 *
 *   {
 *     "messages": [
 *       { "role": "user",
 *         "parts": [{ "type": "text", "text": "<prompt>" }] }
 *     ]
 *   }
 *
 * The AI SDK's convertToModelMessages() on the server reads `parts`
 * (v5 UIMessage shape), not the v4 `content` string field.
 */
async function runOne(
  targetUrl: string,
  prompt: string,
): Promise<{
  assistantText: string;
  toolCalls: ToolCallRecord[];
  streamError?: string;
}> {
  const url = `${targetUrl.replace(/\/$/, '')}/api/ask`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(
      `POST ${url} returned ${res.status}: ${await res.text().catch(() => '')}`,
    );
  }
  if (!res.body) {
    throw new Error(`POST ${url} returned no body`);
  }

  const parser = createStreamParser();
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parser.feed(value);
  }
  return parser.finalize();
}

/**
 * True iff `needles` appears as an ordered subsequence of `haystack`.
 * Used to allow interleaved exploratory tool calls — the expected
 * tools must appear in the specified order, but extra calls between
 * them are fine (e.g. expected=[semantic_search, fetch_signal] passes
 * even if the model also called list_published_datasets in the middle).
 *
 * Empty needles always returns true (vacuously satisfied) — that's
 * the contract for the out-of-scope deflection prompt where
 * expected_tools=[].
 */
function isSubsequence(needles: string[], haystack: string[]): boolean {
  let i = 0;
  for (const tool of haystack) {
    if (i < needles.length && tool === needles[i]) i++;
  }
  return i === needles.length;
}

/**
 * Print a per-prompt verdict table at the end of the run. Markdown-
 * formatted so it pastes cleanly into PR comments.
 */
function printVerdictTable(verdicts: Verdict[]): void {
  if (verdicts.length === 0) return;
  // process.stdout.write avoids the no-console lint rule while
  // preserving the human-readable run summary that PR reviewers paste
  // into comments. The replay harness is a test-runner CLI — emitting
  // a final report to stdout is the point.
  const lines: string[] = [];
  lines.push('', '', '=== /ask replay verdicts ===', '');
  lines.push('| Prompt | Status | Duration | Tools fired |');
  lines.push('|---|---|---|---|');
  for (const v of verdicts) {
    const icon =
      v.status === 'pass' ? 'PASS' : v.status === 'fail' ? 'FAIL' : 'SKIP';
    const tools = v.toolsFired.length === 0 ? '(none)' : v.toolsFired.join(', ');
    lines.push(`| ${v.id} | ${icon} | ${v.durationMs}ms | ${tools} |`);
    if (v.reason) {
      lines.push(`|  | reason: ${v.reason.replace(/\n/g, ' ')} |  |  |`);
    }
  }
  lines.push('', '=============================', '');
  process.stdout.write(lines.join('\n'));
}

/**
 * POST /api/ask — experimental chat endpoint.
 *
 * Pipeline:
 *   1. Feature-flag check (ANTHROPIC_API_KEY) → 503 if off.
 *   2. Per-IP rate-limit → 429 if exceeded.
 *   3. Body parse + minimal shape check → 400 if malformed.
 *   4. streamText with bound tools → SSE stream back to client.
 *
 * Runtime: Node (not edge). Originally edge-runtime for streaming
 * TTFB, but the RAG layer imports a multi-MB dataset-index.json
 * (~500 datasets × 1024-d float32 embeddings + text + metadata).
 * Bundling that into the edge function would push us against
 * Vercel's 4 MB compressed-edge-function limit. Node serverless
 * has a 250 MB limit and ~200-500ms cold start — fine for the
 * demo cadence. Streaming still works the same way through the AI
 * SDK; only the runtime label changes.
 *
 * Anonymous-only. No CSRF check (no cookies, no auth, public-data
 * only). Origin enforcement at the Vercel middleware still applies.
 */
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type UIMessage,
} from 'ai';

import { chatModel } from '@/lib/ai/anthropic-client';
import { askEnabled } from '@/lib/ai/feature-flag';
import { checkRateLimit } from '@/lib/ai/rate-limit';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { tools } from '@/lib/ai/tools';

export const runtime = 'nodejs';
// Allow up to 60s — gives Claude room for 4 tool roundtrips at
// 8s each plus output streaming. Vercel default is 10s on Hobby
// and 60s on Pro for serverless functions.
export const maxDuration = 60;

function clientIp(req: Request): string {
  // Vercel sets x-forwarded-for; first hop is the real client.
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

export async function POST(req: Request): Promise<Response> {
  // 1. Feature flag.
  if (!askEnabled(process.env)) {
    return Response.json({ error: 'chat_disabled' }, { status: 503 });
  }

  // 2. Rate limit (before any expensive parsing).
  // Two layered limits: 10/10min short-window and 100/day daily cap.
  // The daily cap bounds worst-case per-IP spend at ~$5/day at 5¢/req,
  // even when the short-window throughput stays under threshold. See
  // `lib/ai/rate-limit.ts` for the rationale and Bucket-rejection
  // logging.
  const ip = clientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return Response.json(
      {
        error: 'rate_limited',
        bucket: rl.bucket,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  // 3. Body parse + shape check.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const messages = extractMessages(body);
  if (!messages) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  // 4. Stream.
  //
  // # Anthropic prompt caching (added 2026-05-14)
  //
  // The SYSTEM_PROMPT is ~10K tokens of stable instructions (tool
  // usage hints, citation rules, dataset disambiguation). Pre-cache,
  // every tool roundtrip paid the full input cost again — and a
  // multi-tool turn can roundtrip 4-7 times. At Sonnet 4.5 pricing
  // ($3/MTok input), that's ~30¢ per turn just on the system prompt.
  // With `cacheControl: { type: 'ephemeral' }` on the system message,
  // Anthropic caches the prompt for 5 minutes after first write and
  // bills cache reads at 10% of the input rate (~$0.30/MTok). Within
  // a conversation, the second turn onward hits the cache → input
  // cost on system drops to ~3¢ per turn (a ~10× reduction on the
  // system slice of the budget).
  //
  // The cache breakpoint here goes on the system message ONLY — that
  // captures the largest stable prefix without forcing us to manage
  // breakpoints across the user's growing message history. Anthropic
  // allows up to 4 breakpoints per request; if we wanted to also cache
  // accumulated history we'd add one to the last assistant message.
  // Future work — for now the single-breakpoint win is large enough.
  //
  // The `system` arg is replaced by a `system`-role message at the
  // front of `messages` because that's where the AI SDK exposes
  // per-message `providerOptions`. Functionally equivalent — the
  // Anthropic-side API receives the system instruction the same way.
  const systemMessage: ModelMessage = {
    role: 'system',
    content: SYSTEM_PROMPT,
    providerOptions: {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    },
  };
  const result = streamText({
    model: chatModel(),
    messages: [systemMessage, ...convertToModelMessages(messages)],
    tools,
    // Cap output + tool loops to bound cost. See spec §Cost.
    //
    // maxOutputTokens trajectory:
    //   1024 (until 2026-05-14) — too tight. Chatbot accuracy E2E
    //                              audit caught violin-chart fences
    //                              and signal-chart fences being
    //                              truncated mid-stream BEFORE the
    //                              model reaches the ```chart fence.
    //                              The tool succeeds, the
    //                              chart_payload is in the tool
    //                              result, but the model runs out
    //                              of output tokens while composing
    //                              prose and never emits the fence.
    //                              P5 (violin) and P10 (signal)
    //                              from the audit failed this way —
    //                              correct numeric answers, no
    //                              chart rendered.
    //   3072 (now) — gives the model enough budget to compose the
    //                full per-group summary (Saline/CNO stats) AND
    //                emit the chart fence AND list the Sources
    //                section. Cost ceiling per output increases
    //                3× to ~$0.045/msg output (was $0.015) but
    //                input remains the binding cost (~$0.04/msg).
    //                Worst-case overall: ~$0.40/msg vs prior $0.31.
    maxOutputTokens: 3072,
    // stopWhen replaces v4's `maxSteps`. Cap at 12 model turns so
    // deep scientific exploration finishes within one user turn.
    // Trajectory of cap bumps:
    //   5  (initial) — too tight; "show me a voltage trace" needs to
    //                  find the right binary doc which typically
    //                  requires 4-6 exploratory tool calls before
    //                  fetch_signal is even called
    //   8  (Day-4)   — multi-tool "what probes in dataset X" worked
    //                  but voltage-trace prompts still ran out of
    //                  steps mid-exploration before reaching
    //                  fetch_signal
    //   12 (now)     — enough headroom for the full exploration arc:
    //                  semantic_search → get_dataset_class_counts →
    //                  query_documents (probe) → query_documents
    //                  (element) → query_documents
    //                  (daqreader_mfdaq_epochdata_ingested) →
    //                  fetch_signal → compose answer with chart +
    //                  citations.
    stopWhen: stepCountIs(12),
    temperature: 0.3,
    // The AI SDK's default `maxRetries: 2` (1 initial + 2 retries =
    // 3 attempts) with exponential backoff burns up to ~55s of the
    // 60s server budget on transient failures before the error
    // surfaces to the client. Pre-fix, when Anthropic rate-limited
    // upstream the chat would silently stall for the full minute
    // before showing the 429. With maxRetries=1, one quick retry
    // catches single-shot blips but a hard failure (real rate-limit,
    // bad input) surfaces in ~5s. (P1 audit follow-up, 2026-05-14.)
    maxRetries: 1,
  });

  return result.toUIMessageStreamResponse();
}

function extractMessages(body: unknown): UIMessage[] | null {
  if (!body || typeof body !== 'object') return null;
  const m = (body as { messages?: unknown }).messages;
  if (!Array.isArray(m) || m.length === 0) return null;
  // Trust the AI SDK to validate further at convertToModelMessages —
  // we just need the array shape OK to forward.
  return m as UIMessage[];
}

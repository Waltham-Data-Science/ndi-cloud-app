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
  const ip = clientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfterSeconds: rl.retryAfterSeconds },
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
  const result = streamText({
    model: chatModel(),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools,
    // Cap output + tool loops to bound cost. See spec §Cost.
    maxOutputTokens: 1024,
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
    // maxOutputTokens=1024 still bounds the LLM's output regardless
    // of step count, so the cost ceiling per turn is unchanged.
    stopWhen: stepCountIs(12),
    temperature: 0.3,
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

/**
 * POST /api/ask — experimental chat endpoint.
 *
 * Pipeline:
 *   1. Feature-flag check (ANTHROPIC_API_KEY) → 503 if off.
 *   2. Per-IP rate-limit → 429 if exceeded.
 *   3. Body parse + minimal shape check → 400 if malformed.
 *   4. streamText with bound tools → SSE stream back to client.
 *
 * Edge runtime: streaming endpoints belong at edge (faster TTFB, no
 * cold start). Tool handlers fetch over public network to Railway,
 * which works fine from edge.
 *
 * Anonymous-only. No CSRF check (no cookies, no auth, public-data
 * only). Origin enforcement at the Vercel edge middleware still
 * applies — this is POST to a chat-only route with no DB writes,
 * documented exemption.
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

export const runtime = 'edge';

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
    // stopWhen replaces v4's `maxSteps`. We allow up to 5 model
    // turns (initial + 4 tool roundtrips).
    stopWhen: stepCountIs(5),
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

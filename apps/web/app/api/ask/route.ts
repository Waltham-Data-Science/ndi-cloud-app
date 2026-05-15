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
import { checkRateLimitKv } from '@/lib/ai/rate-limit-kv';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { tools } from '@/lib/ai/chat-tools';
import { env } from '@/lib/env';
import { logEvent } from '@/lib/ndi/tools/shared';
import { logUsage } from '@/lib/usage/log';
import type { ProviderUsage } from '@/lib/usage/rate-card';

// Stream 3.2 — single source of truth for the model id we report on
// each usage event. Update in lockstep with `chatModel()` in
// `lib/ai/anthropic-client.ts`.
const ASK_MODEL_ID = 'claude-sonnet-4.x';

function zeroProviderUsage(): ProviderUsage {
  return {
    anthropicInputTokens: 0,
    anthropicOutputTokens: 0,
    anthropicCacheReadTokens: 0,
    anthropicCacheCreateTokens: 0,
    voyageEmbedTokens: 0,
    voyageRerankUnits: 0,
  };
}

export const runtime = 'nodejs';
// Allow up to 180s. Trajectory of bumps:
//   60s — initial cap; covered 4 tool roundtrips at ~8s each + compose.
//   180s — current; exploratory dataset overview prompts ("how many
//          subjects, what classes, figure coverage…") chain 5-7 tools
//          and at 60s the stream was being cut off mid-compose with
//          no assistant summary text emitted (caught live during
//          2026-05-14 tutorial-parity smoke). 180s gives the model
//          comfortable headroom; 99th-percentile latency on healthy
//          chains is still ~25-40s so this only bites pathologically
//          long traces. Vercel Pro tier allows up to 300s; 180s
//          leaves margin to grow.
export const maxDuration = 180;

/**
 * Stream 3.4 (2026-05-15) — per-org access verdict for `/api/ask`.
 *
 * Returns one of:
 *   - `{ verdict: 'anonymous' }`            — no session cookie.
 *   - `{ verdict: 'allowed',   userId, orgId? }` — session ok + canUseAsk=true.
 *   - `{ verdict: 'forbidden', userId, orgId? }` — session ok + canUseAsk=false.
 *
 * Stream 3.2 piggybacks on the same /me call to capture the user-id
 * we attribute the chat_usage_events row to. The cookie path runs
 * once per request; both gates read from the same parsed body.
 *
 * On any error fetching /me we conservatively allow — preserves the
 * existing behavior under degraded upstream, fails open during the
 * experimental phase. Once auth becomes a hard requirement (post
 * Stream 3.1), this fallback should fail closed.
 */
interface AskVerdict {
  verdict: 'anonymous' | 'allowed' | 'forbidden';
  userId: string;
  organizationId: string | null;
}

async function canUseAskFor(req: Request): Promise<AskVerdict> {
  const cookie = req.headers.get('cookie');
  if (!cookie) {
    return { verdict: 'anonymous', userId: 'anonymous', organizationId: null };
  }
  // Resolve the FastAPI base the same way the chat tools do — branch-
  // aware so the experimental preview hits the experimental Railway env.
  const upstream =
    env.VERCEL_GIT_COMMIT_REF === 'feat/experimental-ask-chat'
      ? 'https://ndb-v2-experimental.up.railway.app'
      : env.INTERNAL_API_URL;
  if (!upstream) {
    return { verdict: 'anonymous', userId: 'anonymous', organizationId: null };
  }
  try {
    const res = await fetch(`${upstream}/api/auth/me`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.status === 401) {
      return { verdict: 'anonymous', userId: 'anonymous', organizationId: null };
    }
    if (!res.ok) {
      // Fail-open during the experimental phase — we don't have a
      // userId to attribute usage to, so use 'anonymous'.
      return { verdict: 'allowed', userId: 'anonymous', organizationId: null };
    }
    const body = (await res.json()) as {
      userId?: string;
      canUseAsk?: boolean;
      organizationIds?: string[];
    };
    const userId =
      typeof body.userId === 'string' && body.userId
        ? body.userId
        : 'anonymous';
    const organizationId =
      Array.isArray(body.organizationIds) && body.organizationIds.length > 0
        ? body.organizationIds[0]!
        : null;
    return {
      verdict: body.canUseAsk === false ? 'forbidden' : 'allowed',
      userId,
      organizationId,
    };
  } catch {
    return { verdict: 'allowed', userId: 'anonymous', organizationId: null };
  }
}

/**
 * Stream 3.2 — generate a stable request id for cross-boundary
 * tracing. Same shape as the FastAPI middleware's regex
 * (`[A-Za-z0-9_.-]{8,128}`); 16 hex chars is enough entropy at our
 * request volume.
 */
function freshRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

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
  if (!askEnabled()) {
    logEvent('ask.feature_disabled');
    return Response.json({ error: 'chat_disabled' }, { status: 503 });
  }

  // 1b. Stream 3.4 (2026-05-15) — per-org access gate. The route is
  // STILL ANONYMOUS-CAPABLE during the experimental phase: requests
  // without a session cookie skip the gate (the chat is open to
  // anyone today). Once Stream 3.1 moves /ask under /my/ask the
  // route becomes auth-required; this gate then enforces the
  // FastAPI-side ENABLE_ASK_ORG_IDS allowlist (admins always pass;
  // empty allowlist means "every authenticated user").
  const askVerdict = await canUseAskFor(req);
  if (askVerdict.verdict === 'forbidden') {
    logEvent('ask.feature_not_enabled_for_org', { userId: askVerdict.userId });
    return Response.json(
      { error: 'feature_not_enabled' },
      { status: 403 },
    );
  }
  // Stream 3.2 — userId/organizationId reused by the usage event
  // emitted from streamText's onFinish/onError below. requestId
  // correlates with the X-Request-Id propagated through
  // toolContextFromRequest into FastAPI logs.
  const userId = askVerdict.userId;
  const organizationId = askVerdict.organizationId;
  const requestId = freshRequestId();
  const askStartedAtMs = Date.now();

  // 2. Rate limit (before any expensive parsing).
  // Stream 3.3 (2026-05-15): swapped the per-IP in-memory limiter
  // for a per-USER KV-backed limiter (with in-memory fallback when
  // KV isn't configured — local dev / preview). Authenticated chat
  // keys on userId so multi-instance Vercel deploys honor the cap
  // across the whole fleet. Anonymous chat still keys on IP.
  const ip = clientIp(req);
  const subject = userId !== 'anonymous' ? `user:${userId}` : `ip:${ip}`;
  const rl = await checkRateLimitKv(subject);
  if (!rl.ok) {
    logEvent('ask.rate_limited', {
      subject,
      bucket: rl.bucket,
      retryAfterSeconds: rl.retryAfterSeconds,
    });
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
    logEvent('ask.invalid_body', { reason: 'invalid_json' });
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const messages = extractMessages(body);
  if (!messages) {
    logEvent('ask.invalid_body', { reason: 'shape_mismatch' });
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Request observability — size-only, never message content.
  const lastUserMessage = lastUserText(messages);
  logEvent('ask.request.start', {
    ip,
    messageCount: messages.length,
    mostRecentUserMessage_length: lastUserMessage.length,
  });

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
  // v6 (2026-05-15, Stream 6.12): convertToModelMessages is now
  // async — destructure the awaited array into the prompt. The
  // single-line edit the upgrade-inventory doc flagged
  // (apps/web/docs/specs/2026-05-15-ai-sdk-v6-upgrade-inventory.md).
  const modelMessages = await convertToModelMessages(messages);
  const result = streamText({
    model: chatModel(),
    messages: [systemMessage, ...modelMessages],
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
    onError: ({ error }) => {
      const e = error instanceof Error ? error : new Error(String(error));
      logEvent('ask.stream.error', {
        errorType: e.name,
        message: e.message.slice(0, 200),
      });
      // Stream 3.2 — record the failure as a usage event so the
      // admin cost-dashboard can attribute failed turns. Anthropic
      // tokens are zero on a hard error (request didn't bill); we
      // still want the row for outcome attribution.
      void logUsage({
        userId,
        organizationId: organizationId ?? null,
        conversationId: null,
        requestId,
        startedAt: new Date(askStartedAtMs),
        durationMs: Date.now() - askStartedAtMs,
        provider: zeroProviderUsage(),
        toolCallsCount: 0,
        toolNames: [],
        outcome: 'upstream_error',
        errorKind: e.name,
        modelId: ASK_MODEL_ID,
        streamed: true,
      });
    },
    onFinish: ({ usage, finishReason }) => {
      // Stream 3.2 — happy-path usage event. The AI SDK's
      // `usage` callback on streamText returns the aggregated
      // token counts across every tool-loop turn for this
      // request, mapped here onto the rate-card shape.
      void logUsage({
        userId,
        organizationId: organizationId ?? null,
        conversationId: null,
        requestId,
        startedAt: new Date(askStartedAtMs),
        durationMs: Date.now() - askStartedAtMs,
        provider: {
          anthropicInputTokens: usage?.inputTokens ?? 0,
          anthropicOutputTokens: usage?.outputTokens ?? 0,
          anthropicCacheReadTokens: usage?.cachedInputTokens ?? 0,
          anthropicCacheCreateTokens: 0,
          // Voyage counts aren't surfaced through streamText.usage
          // because Voyage is called inside our tool handlers, not
          // through the AI SDK. Per-tool Voyage accounting is a
          // future Stream 3.2 extension; for now we leave Voyage
          // costs at 0 in the row. Total cost still rolls up
          // Anthropic accurately (the binding cost line item).
          voyageEmbedTokens: 0,
          voyageRerankUnits: 0,
        },
        toolCallsCount: 0, // populated by a tool-counter follow-up
        toolNames: [],
        outcome:
          finishReason === 'stop' || finishReason === 'tool-calls'
            ? 'success'
            : 'aborted',
        modelId: ASK_MODEL_ID,
        streamed: true,
      });
    },
  });

  logEvent('ask.stream.start', { ip });
  return result.toUIMessageStreamResponse();
}

/**
 * Extract the text of the most recent user message for size-only
 * logging. Walks the UIMessage parts array (the AI SDK's canonical
 * shape) and joins any text-typed parts. Returns '' when no text part
 * is found — never throws, never inspects message content beyond
 * computing a length.
 */
function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== 'user') continue;
    const parts = (m as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) return '';
    const texts: string[] = [];
    for (const p of parts) {
      if (p && typeof p === 'object' && (p as { type?: unknown }).type === 'text') {
        const t = (p as { text?: unknown }).text;
        if (typeof t === 'string') texts.push(t);
      }
    }
    return texts.join('');
  }
  return '';
}

function extractMessages(body: unknown): UIMessage[] | null {
  if (!body || typeof body !== 'object') return null;
  const m = (body as { messages?: unknown }).messages;
  if (!Array.isArray(m) || m.length === 0) return null;
  // Trust the AI SDK to validate further at convertToModelMessages —
  // we just need the array shape OK to forward.
  return m as UIMessage[];
}

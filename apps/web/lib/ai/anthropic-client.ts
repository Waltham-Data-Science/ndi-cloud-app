/**
 * Anthropic client singleton for the experimental /ask chat.
 *
 * Wraps `@ai-sdk/anthropic`'s `createAnthropic()` so callers don't
 * have to thread the model id literal everywhere. The model name is
 * pinned here so a sweep is one place.
 *
 * `claude-sonnet-4-6` is the current Sonnet model id (2026-05-14).
 * Sonnet 4.5 (`claude-sonnet-4-5`) was the prior generation and is
 * now in Anthropic's legacy tier. Same $3/MTok input · $15/MTok
 * output pricing as 4.5, but better intelligence + the 1M-token
 * context window that 4.5 didn't have on the API. When Anthropic
 * ships a successor, update this constant; no other code changes
 * needed.
 */
import { createAnthropic } from '@ai-sdk/anthropic';

import { env } from '@/lib/env';

export const CLAUDE_MODEL_ID = 'claude-sonnet-4-6';

let _client: ReturnType<typeof createAnthropic> | null = null;

export function getAnthropicClient() {
  if (!_client) {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set');
    }
    _client = createAnthropic({ apiKey });
  }
  return _client;
}

/**
 * The bound model handle used by streamText().
 */
export function chatModel() {
  return getAnthropicClient()(CLAUDE_MODEL_ID);
}

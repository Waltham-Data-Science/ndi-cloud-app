/**
 * Anthropic client singleton for the experimental /ask chat.
 *
 * Wraps `@ai-sdk/anthropic`'s `createAnthropic()` so callers don't
 * have to thread the model id literal everywhere. The model name is
 * pinned here so a sweep is one place.
 *
 * `claude-sonnet-4-5` is the current Sonnet model id (2026-05). When
 * Anthropic ships a successor, update this constant; no other code
 * changes needed.
 */
import { createAnthropic } from '@ai-sdk/anthropic';

export const CLAUDE_MODEL_ID = 'claude-sonnet-4-5';

let _client: ReturnType<typeof createAnthropic> | null = null;

export function getAnthropicClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
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

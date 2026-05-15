/**
 * Stream 3.2 (2026-05-15) — chat usage event writer.
 *
 * `logUsage()` persists one row to `chat_usage_events` per /api/ask
 * invocation. Called from `/api/ask/route.ts:onFinish` after the
 * stream completes (success) OR from `onError` (failure). Best-
 * effort: a Postgres write failure logs a structured event but
 * never fails the user-facing chat response.
 *
 * Privacy invariant: the function signature ONLY accepts counts +
 * opaque IDs. There's no parameter for prompt text / response text /
 * tool body — those literally can't be passed in. See the audit-log
 * policy at apps/web/docs/operations/audit-log-policy.md.
 */
import type { PoolClient } from 'pg';

import { getPool } from '@/lib/ai/db/pool';
import { logEvent } from '@/lib/ndi/tools/shared';
import { computeCost, type ProviderUsage } from './rate-card';

export interface UsageEventInput {
  userId: string;
  organizationId: string | null;
  conversationId: string | null;
  requestId: string;
  startedAt: Date;
  durationMs: number;
  provider: ProviderUsage;
  toolCallsCount: number;
  toolNames: readonly string[];
  outcome: 'success' | 'rate_limited' | 'quota_exceeded' | 'upstream_error' | 'aborted';
  errorKind?: string;
  modelId: string;
  streamed: boolean;
}

/**
 * Write one usage event row. Returns `true` on success, `false` on
 * any failure (network / Postgres). The chat response is unaffected
 * either way — usage logging is BEST EFFORT, reconciled weekly
 * against Anthropic + Voyage dashboards.
 */
export async function logUsage(input: UsageEventInput): Promise<boolean> {
  const cost = computeCost(input.provider);
  let client: PoolClient | null = null;
  try {
    const pool = getPool();
    client = await pool.connect();
    await client.query(
      `INSERT INTO chat_usage_events (
         user_id, organization_id, conversation_id, request_id,
         started_at, duration_ms,
         input_tokens, output_tokens,
         cache_read_tokens, cache_create_tokens,
         voyage_embed_tokens, voyage_rerank_units,
         anthropic_input_cost_cents, anthropic_output_cost_cents,
         voyage_embed_cost_cents, voyage_rerank_cost_cents,
         tool_calls_count, tool_names,
         outcome, error_kind,
         model_id, streamed
       )
       VALUES (
         $1, $2, $3, $4,
         $5, $6,
         $7, $8,
         $9, $10,
         $11, $12,
         $13, $14,
         $15, $16,
         $17, $18,
         $19, $20,
         $21, $22
       )`,
      [
        input.userId,
        input.organizationId,
        input.conversationId,
        input.requestId,
        input.startedAt.toISOString(),
        input.durationMs,
        input.provider.anthropicInputTokens,
        input.provider.anthropicOutputTokens,
        input.provider.anthropicCacheReadTokens,
        input.provider.anthropicCacheCreateTokens,
        input.provider.voyageEmbedTokens,
        input.provider.voyageRerankUnits,
        cost.anthropicInputCostCents,
        cost.anthropicOutputCostCents,
        cost.voyageEmbedCostCents,
        cost.voyageRerankCostCents,
        input.toolCallsCount,
        input.toolNames,
        input.outcome,
        input.errorKind ?? null,
        input.modelId,
        input.streamed,
      ],
    );
    logEvent('usage.event.recorded', {
      user_id: input.userId,
      total_cost_cents: cost.totalCostCents,
      tool_calls_count: input.toolCallsCount,
      outcome: input.outcome,
    });
    return true;
  } catch (err) {
    logEvent('usage.event.write_failed', {
      user_id: input.userId,
      request_id: input.requestId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return false;
  } finally {
    client?.release();
  }
}

/**
 * Compute the start-of-month timestamp in UTC for monthly rollups.
 * Exposed for the future admin dashboard's per-user / per-org
 * spending charts.
 */
export function monthStartUTC(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}

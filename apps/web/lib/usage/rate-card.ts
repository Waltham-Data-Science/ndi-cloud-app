/**
 * Provider rate card — cents per million tokens / per query.
 *
 * Stream 3.2 (2026-05-15). Hand-pinned per the provider rate sheets
 * as of the date in `LAST_REVIEWED`. Update + bump that date when a
 * provider changes pricing. The values are used by `logUsage()` in
 * `lib/usage/log.ts` to compute `total_cost_cents` server-side BEFORE
 * persisting to `chat_usage_events`.
 *
 * Why server-side: deterministic vs. round-tripping a (potentially
 * stale) client-side rate card; survives provider rate sheet
 * additions without breaking the existing rows.
 */

export const LAST_REVIEWED = '2026-05-15';

// --- Anthropic (Sonnet 4.x) ---
// 2026-05-15 pricing: input $3/M, output $15/M, cache read $0.30/M,
// cache write $3.75/M. Cents-per-million keeps the math integer.
export const ANTHROPIC_SONNET_INPUT_CENTS_PER_MILLION = 300;
export const ANTHROPIC_SONNET_OUTPUT_CENTS_PER_MILLION = 1500;
export const ANTHROPIC_CACHE_READ_CENTS_PER_MILLION = 30;
export const ANTHROPIC_CACHE_WRITE_CENTS_PER_MILLION = 375;

// --- Voyage AI ---
export const VOYAGE_EMBED_CENTS_PER_MILLION = 12;
// Rerank is priced per QUERY (one query = up to N candidates per
// rerank call). At ~$0.05/query for voyage rerank-2.5.
export const VOYAGE_RERANK_CENTS_PER_QUERY = 5; // 5 = 0.05 USD = 5 cents

/**
 * Compute total cost in cents (integer). Caller passes the raw
 * provider counters; this function applies the rate card.
 *
 * Anthropic returns `input_tokens` / `output_tokens` / `cache_read_input_tokens`
 * / `cache_creation_input_tokens` in its `usage` block. We map them
 * 1:1 here. Voyage's `embed` returns tokens; rerank returns a query
 * count (1 per rerank call).
 */
export interface ProviderUsage {
  anthropicInputTokens: number;
  anthropicOutputTokens: number;
  anthropicCacheReadTokens: number;
  anthropicCacheCreateTokens: number;
  voyageEmbedTokens: number;
  voyageRerankUnits: number;
}

export interface CostBreakdown {
  anthropicInputCostCents: number;
  anthropicOutputCostCents: number;
  voyageEmbedCostCents: number;
  voyageRerankCostCents: number;
  totalCostCents: number;
}

function tokensToCents(tokens: number, centsPerMillion: number): number {
  // Round to nearest cent — fractional cents don't exist on the
  // provider's invoice either.
  return Math.round((tokens * centsPerMillion) / 1_000_000);
}

export function computeCost(usage: ProviderUsage): CostBreakdown {
  const anthropicInputCostCents =
    tokensToCents(
      usage.anthropicInputTokens,
      ANTHROPIC_SONNET_INPUT_CENTS_PER_MILLION,
    ) +
    tokensToCents(
      usage.anthropicCacheReadTokens,
      ANTHROPIC_CACHE_READ_CENTS_PER_MILLION,
    ) +
    tokensToCents(
      usage.anthropicCacheCreateTokens,
      ANTHROPIC_CACHE_WRITE_CENTS_PER_MILLION,
    );
  const anthropicOutputCostCents = tokensToCents(
    usage.anthropicOutputTokens,
    ANTHROPIC_SONNET_OUTPUT_CENTS_PER_MILLION,
  );
  const voyageEmbedCostCents = tokensToCents(
    usage.voyageEmbedTokens,
    VOYAGE_EMBED_CENTS_PER_MILLION,
  );
  const voyageRerankCostCents =
    usage.voyageRerankUnits * VOYAGE_RERANK_CENTS_PER_QUERY;
  return {
    anthropicInputCostCents,
    anthropicOutputCostCents,
    voyageEmbedCostCents,
    voyageRerankCostCents,
    totalCostCents:
      anthropicInputCostCents +
      anthropicOutputCostCents +
      voyageEmbedCostCents +
      voyageRerankCostCents,
  };
}

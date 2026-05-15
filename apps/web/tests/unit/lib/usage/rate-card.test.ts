/**
 * Stream 3.2 — rate-card cost computation.
 *
 * The function is pure (no I/O); we lock the math against the
 * published 2026-05-15 provider rates so a future rate-card edit
 * surfaces as a test diff.
 */
import { describe, expect, it } from 'vitest';

import {
  ANTHROPIC_SONNET_INPUT_CENTS_PER_MILLION,
  ANTHROPIC_SONNET_OUTPUT_CENTS_PER_MILLION,
  ANTHROPIC_CACHE_READ_CENTS_PER_MILLION,
  ANTHROPIC_CACHE_WRITE_CENTS_PER_MILLION,
  VOYAGE_EMBED_CENTS_PER_MILLION,
  VOYAGE_RERANK_CENTS_PER_QUERY,
  computeCost,
} from '@/lib/usage/rate-card';

describe('rate-card computeCost', () => {
  it('returns all-zero costs on all-zero usage', () => {
    const out = computeCost({
      anthropicInputTokens: 0,
      anthropicOutputTokens: 0,
      anthropicCacheReadTokens: 0,
      anthropicCacheCreateTokens: 0,
      voyageEmbedTokens: 0,
      voyageRerankUnits: 0,
    });
    expect(out.anthropicInputCostCents).toBe(0);
    expect(out.anthropicOutputCostCents).toBe(0);
    expect(out.voyageEmbedCostCents).toBe(0);
    expect(out.voyageRerankCostCents).toBe(0);
    expect(out.totalCostCents).toBe(0);
  });

  it('computes Anthropic input at $3/M ($0.0003 per 1K)', () => {
    // 1M tokens → 300 cents = $3.
    const out = computeCost({
      anthropicInputTokens: 1_000_000,
      anthropicOutputTokens: 0,
      anthropicCacheReadTokens: 0,
      anthropicCacheCreateTokens: 0,
      voyageEmbedTokens: 0,
      voyageRerankUnits: 0,
    });
    expect(out.anthropicInputCostCents).toBe(300);
    expect(out.totalCostCents).toBe(300);
  });

  it('computes Anthropic output at $15/M', () => {
    const out = computeCost({
      anthropicInputTokens: 0,
      anthropicOutputTokens: 1_000_000,
      anthropicCacheReadTokens: 0,
      anthropicCacheCreateTokens: 0,
      voyageEmbedTokens: 0,
      voyageRerankUnits: 0,
    });
    expect(out.anthropicOutputCostCents).toBe(1500);
  });

  it('cache reads at 10% of input rate (~$0.30/M)', () => {
    const out = computeCost({
      anthropicInputTokens: 0,
      anthropicOutputTokens: 0,
      anthropicCacheReadTokens: 1_000_000,
      anthropicCacheCreateTokens: 0,
      voyageEmbedTokens: 0,
      voyageRerankUnits: 0,
    });
    // Cache reads roll into input cost (single column for storage).
    expect(out.anthropicInputCostCents).toBe(30);
  });

  it('cache writes at 1.25x input rate (~$3.75/M)', () => {
    const out = computeCost({
      anthropicInputTokens: 0,
      anthropicOutputTokens: 0,
      anthropicCacheReadTokens: 0,
      anthropicCacheCreateTokens: 1_000_000,
      voyageEmbedTokens: 0,
      voyageRerankUnits: 0,
    });
    expect(out.anthropicInputCostCents).toBe(375);
  });

  it('Voyage embed at $0.12/M', () => {
    const out = computeCost({
      anthropicInputTokens: 0,
      anthropicOutputTokens: 0,
      anthropicCacheReadTokens: 0,
      anthropicCacheCreateTokens: 0,
      voyageEmbedTokens: 1_000_000,
      voyageRerankUnits: 0,
    });
    expect(out.voyageEmbedCostCents).toBe(VOYAGE_EMBED_CENTS_PER_MILLION);
  });

  it('Voyage rerank charged per query, not per token', () => {
    const out = computeCost({
      anthropicInputTokens: 0,
      anthropicOutputTokens: 0,
      anthropicCacheReadTokens: 0,
      anthropicCacheCreateTokens: 0,
      voyageEmbedTokens: 0,
      voyageRerankUnits: 4,
    });
    expect(out.voyageRerankCostCents).toBe(4 * VOYAGE_RERANK_CENTS_PER_QUERY);
  });

  it('totalCostCents is the sum of every component', () => {
    const out = computeCost({
      anthropicInputTokens: 500_000,
      anthropicOutputTokens: 100_000,
      anthropicCacheReadTokens: 1_000_000,
      anthropicCacheCreateTokens: 0,
      voyageEmbedTokens: 50_000,
      voyageRerankUnits: 2,
    });
    const expected =
      Math.round(
        (500_000 * ANTHROPIC_SONNET_INPUT_CENTS_PER_MILLION) / 1_000_000,
      ) +
      Math.round((1_000_000 * ANTHROPIC_CACHE_READ_CENTS_PER_MILLION) / 1_000_000) +
      Math.round(
        (100_000 * ANTHROPIC_SONNET_OUTPUT_CENTS_PER_MILLION) / 1_000_000,
      ) +
      Math.round((50_000 * VOYAGE_EMBED_CENTS_PER_MILLION) / 1_000_000) +
      2 * VOYAGE_RERANK_CENTS_PER_QUERY;
    expect(out.totalCostCents).toBe(expected);
  });

  it('rate-card constants are not zero (sanity)', () => {
    // Belt and suspenders — a future "clear constants" refactor that
    // accidentally zeroed these would yield free chat cost forever.
    expect(ANTHROPIC_SONNET_INPUT_CENTS_PER_MILLION).toBeGreaterThan(0);
    expect(ANTHROPIC_SONNET_OUTPUT_CENTS_PER_MILLION).toBeGreaterThan(0);
    expect(ANTHROPIC_CACHE_READ_CENTS_PER_MILLION).toBeGreaterThan(0);
    expect(ANTHROPIC_CACHE_WRITE_CENTS_PER_MILLION).toBeGreaterThan(0);
    expect(VOYAGE_EMBED_CENTS_PER_MILLION).toBeGreaterThan(0);
    expect(VOYAGE_RERANK_CENTS_PER_QUERY).toBeGreaterThan(0);
  });
});

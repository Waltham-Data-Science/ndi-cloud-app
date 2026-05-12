/**
 * system-prompt.ts — ensures the scope-limiting clauses don't get
 * accidentally edited out. The bot's safety properties depend on
 * specific instructions being present (no fabrication, redirect
 * out-of-scope questions, never claim to be another product).
 */
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';

describe('lib/ai/system-prompt', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains a SCOPE clause limiting to published NDI datasets', () => {
    expect(SYSTEM_PROMPT).toMatch(/SCOPE/i);
    expect(SYSTEM_PROMPT).toMatch(/published/i);
    expect(SYSTEM_PROMPT).toMatch(/NDI Commons/i);
  });

  it('forbids fabrication of dataset metadata', () => {
    // The model gets tools to fetch real data; it must use them.
    expect(SYSTEM_PROMPT).toMatch(/never (fabricate|invent)/i);
  });

  it('instructs the model to redirect out-of-scope questions', () => {
    expect(SYSTEM_PROMPT).toMatch(/redirect/i);
  });

  it('forbids identity-spoofing (claiming to be ChatGPT/Gemini/etc.)', () => {
    expect(SYSTEM_PROMPT).toMatch(/never claim/i);
    expect(SYSTEM_PROMPT).toMatch(/ChatGPT|Gemini|Bard/i);
  });

  it('flags itself as an experimental preview', () => {
    expect(SYSTEM_PROMPT).toMatch(/experimental/i);
  });

  it('teaches the model about semantic_search_datasets', () => {
    expect(SYSTEM_PROMPT).toMatch(/semantic_search_datasets/);
  });

  it('teaches semantic-vs-keyword tool selection (concept vs. substring)', () => {
    expect(SYSTEM_PROMPT).toMatch(/concept/i);
    expect(SYSTEM_PROMPT).toMatch(/substring|literal keyword/i);
  });

  it('instructs graceful fallback when semantic_search is unavailable', () => {
    expect(SYSTEM_PROMPT).toMatch(/fall back|VOYAGE_API_KEY|index empty/i);
  });
});

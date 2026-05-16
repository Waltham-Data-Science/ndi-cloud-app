/**
 * Starter prompts shown when the chat thread is empty.
 *
 * Moved from `app/(marketing)/ask/suggested-prompts.ts` → `lib/ai/`
 * (Phase D of the workspace redesign, 2026-05-16) so the AskShell —
 * also moved out of the route group — can import them without a
 * cross-route-group import (which TS and Next.js treat as a red flag).
 *
 * Both the workspace panel and any future marketing surface (the Data
 * Browser product page when it launches publicly) import from here.
 *
 * Smoke-tested 2026-05-13: every prompt returns a complete, sourced
 * answer against the public Commons catalog.
 */
export const SUGGESTED_PROMPTS = [
  'How many published datasets are in the Commons?',
  'What datasets relate to memory or learning across species?',
  'What probe types were used in the Dabrowska BNST dataset?',
  'What strains were used in the Bhar C. elegans memory dataset?',
] as const;

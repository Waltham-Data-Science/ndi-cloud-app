/**
 * Starter prompts shown when the chat thread is empty.
 *
 * Picked to demonstrate the breadth of scientific-depth capabilities
 * added in the Day-1-4 arc:
 *   - Catalog count (list_published_datasets) — fastest, instant cite
 *   - Cross-dataset semantic search (semantic_search_datasets) — RAG
 *     pipeline + curated sidecar surface lab-specific keywords
 *   - Document-level probe enumeration (query_documents on the
 *     `element` table for the Dabrowska BNST set) — multi-tool
 *     navigation with per-row citations
 *   - PI-name + structured-lookup combo (semantic_search +
 *     get_dataset_summary) for strain enumeration
 *
 * Note on naming: the Bhar dataset is C. elegans memory transfer, not
 * tree shrew (a prior placeholder mislabeled it). Sticking to the
 * actual catalog truth — every prompt below was smoke-tested 2026-05-13
 * to return a complete, sourced answer.
 */
export const SUGGESTED_PROMPTS = [
  'How many published datasets are in the Commons?',
  'What datasets relate to memory or learning across species?',
  'What probe types were used in the Dabrowska BNST dataset?',
  'What strains were used in the Bhar C. elegans memory dataset?',
] as const;

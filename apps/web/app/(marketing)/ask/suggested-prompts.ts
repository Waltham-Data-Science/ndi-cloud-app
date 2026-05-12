/**
 * Starter prompts shown when the chat thread is empty.
 *
 * Picked for breadth: a count question (uses list_published_datasets
 * with pageSize=1), a filter question (uses query param), a specific
 * dataset question (uses get_dataset_summary), and a facet question
 * (uses get_facets).
 *
 * Goal: each one demonstrates a different tool to the demo audience.
 */
export const SUGGESTED_PROMPTS = [
  'How many published datasets are in the Commons?',
  'Show me datasets involving the visual cortex',
  'Tell me about the Bhar tree shrew dataset',
  'What species are represented across the catalog?',
] as const;

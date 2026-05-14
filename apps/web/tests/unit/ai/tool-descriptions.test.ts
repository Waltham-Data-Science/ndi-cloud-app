/**
 * Lint test: tool description strings.
 *
 * # Why this test exists
 *
 * A real bug in earlier `tabular_query` drafts: the description listed
 * `"treatment_group"` as an example column-key value the LLM could pass
 * to `groupBy`. The LLM dutifully copied it on EVERY violin-plot
 * request — but no real NDI dataset has a column literally named
 * `treatment_group` (the actual keys look like
 * `Treatment_CNOOrSalineAdministration`, `StimulationGroup`, etc).
 * Result: every chart request failed with empty groups.
 *
 * Pattern: tool descriptions that contain quoted snake_case strings
 * are HIGH-RISK for self-fulfilling-prophecy bugs because LLMs treat
 * quoted examples as canonical values. This test catches them before
 * they ship.
 *
 * # The lint rules
 *
 *   1. **Quoted-snake-case rule.** Any double-quoted token matching
 *      `[a-z]+_[a-z]+(?:_[a-z]+)*` that ISN'T on the curated
 *      allowlist (NDI document classes + NDI Query DSL operations)
 *      fails the test, UNLESS the token appears in close proximity
 *      (within ~120 chars) to a negative-context marker like "NEVER
 *      assume", "is NOT a real", "do not invent" — explicit
 *      counter-examples are treated as already-explained.
 *
 *   2. **Substring-match advisory rule.** Each tool description that
 *      takes a user-supplied class / column / field hint MUST
 *      reference one of the "broad substring" / "substring match" /
 *      "case-insensitive" / "broad hint" phrases (or close variants:
 *      "fuzzy", "synonym", "broad and case-insensitive", "discover
 *      the field"), signaling to the LLM that exact names should not
 *      be invented from thin air. Tools whose descriptions don't
 *      accept user-supplied field/class hints (the simple list/get
 *      tools, fetch_signal, lookup_ontology, walk_provenance) are
 *      exempted by name.
 *
 * # When to update the allowlist
 *
 * Add a new entry ONLY when it is genuinely a STABLE NDI primitive
 * (class name, operation name, ontology-table column key in a STABLE
 * sense — never a dataset-specific column). When in doubt, use a
 * placeholder like `"COLUMN_NAME"` or `"<columnKey>"` in the
 * description rather than a real-looking name.
 */
import { describe, expect, it } from 'vitest';
import { tools } from '@/lib/ai/chat-tools';

/**
 * Well-known NDI document class names. These are the canonical
 * `class` values stored on every NDI document — stable across all
 * datasets. Safe to use literally in tool descriptions.
 */
const NDI_DOC_CLASSES = new Set<string>([
  'probe',
  'subject',
  'element',
  'element_epoch',
  'stimulus_presentation',
  'stimulus_response',
  'vmspikesummary',
  'tuningcurve_calc',
  'treatment',
  'openminds_subject',
  'epochid',
  'ontologyTableRow',
]);

/**
 * Well-known NDI Query DSL operation names. These come from
 * `ndi.query.Query` (Python) / `ndi.query` (MATLAB) and are stable.
 * Safe to use literally as `operation: "..."` examples.
 */
const NDI_OPERATIONS = new Set<string>([
  'isa',
  'exact_string',
  'exact_string_anycase',
  'contains_string',
  'regexp',
  'hasfield',
  'hasmember',
  'hasanysubfield_contains_string',
  'hasanysubfield_exact_string',
  'exact_number',
  'lessthan',
  'lessthaneq',
  'greaterthan',
  'greaterthaneq',
  'depends_on',
  'or',
  // Stable enum values used as `kind` discriminators in tool inputs.
  // These are NOT dataset-specific column names — they're our own
  // tool surface, identical across every dataset.
  'isi_histogram',
  'spike_raster',
]);

/**
 * Tool names whose descriptions do NOT need a "broad substring" /
 * "case-insensitive" disclaimer because the tool doesn't accept any
 * user-supplied field / column / class name as input (their inputs
 * are typed IDs and pagination only).
 *
 * walk_provenance is exempted: it takes a starting docId and walks
 * the depends_on graph — no user-supplied field-name hint.
 * fetch_signal is exempted: it takes datasetId + docId, not column
 * names.
 * lookup_ontology is exempted: it takes a CURIE string, not column
 * names.
 * query_documents is exempted: it takes a `className` from a fixed
 * closed vocabulary (the NDI document classes enumerated in the
 * description) — there is no fuzzy match happening, so the
 * "broad substring" disclaimer doesn't apply.
 */
const EXEMPT_FROM_SUBSTRING_RULE = new Set<string>([
  'list_published_datasets',
  'get_dataset',
  'get_dataset_summary',
  'get_dataset_class_counts',
  'get_facets',
  'fetch_signal',
  'lookup_ontology',
  'walk_provenance',
  'query_documents',
  // New chart tools that take a typed docId / datasetId only — no
  // fuzzy column / class hint passes through.
  'fetch_image',
  'treatment_timeline',
  // Sprint 1.5: only takes a datasetId, returns SDK-derived summary.
  'ndi_dataset_overview',
  // Takes a datasetId + docId; chains from ndi_query / query_documents.
  'get_document',
]);

/**
 * Phrases that signal "exact column names should not be invented" —
 * any one of these in the description satisfies the advisory rule.
 * Case-insensitive substring match (the matcher lowercases both
 * sides), and we strip non-alphanumeric chars (so "case-insensitive"
 * matches "case-insensitively" and "broad substring" matches
 * "broad-substring").
 *
 * The list is intentionally broad — we want this to FAIL only when
 * a description has zero signal that the LLM should match fuzzily.
 */
const SUBSTRING_PHRASES = [
  'broad substring',
  'substring match',
  'substring-match',
  'substring matches',
  'case-insensitive',
  'case insensitive',
  'case-insensitively',
  'broad hint',
  'broad and case-insensitive',
  'fuzzy',
  'synonym',
  'synonym-heavy',
  'fuzzy or synonym',
  'discover the field',
  'discover the field name',
  'broad match',
  'topical search',
  'best match',
];

/**
 * Negative-context markers. When a suspicious snake_case token is
 * found within `NEGATIVE_CONTEXT_WINDOW` chars of any of these, the
 * token is treated as an EXPLAINED counter-example and not flagged.
 *
 * Example: `tabular_query` says "NEVER assume a specific column name
 * like 'treatment_group' exists — that is NOT a real NDI column
 * convention." That's a teach-by-counter-example pattern; we want
 * to ALLOW it.
 */
const NEGATIVE_MARKERS = [
  'never assume',
  'is not a real',
  'are not a real',
  'do not invent',
  "don't invent",
  'not a real ndi',
  'never invent',
  'do not assume',
];

const NEGATIVE_CONTEXT_WINDOW = 160;

const SNAKE_CASE_RE = /"([a-z][a-z0-9]*_[a-z0-9][a-z0-9_]*)"/g;

interface ToolEntry {
  description: string;
}

function isToolEntry(value: unknown): value is ToolEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { description?: unknown }).description === 'string'
  );
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
}

function hasSubstringDisclaimer(description: string): boolean {
  const norm = normalize(description);
  return SUBSTRING_PHRASES.some((p) => norm.includes(normalize(p)));
}

function isNearNegativeMarker(description: string, index: number): boolean {
  const lower = description.toLowerCase();
  const start = Math.max(0, index - NEGATIVE_CONTEXT_WINDOW);
  const end = Math.min(lower.length, index + NEGATIVE_CONTEXT_WINDOW);
  const window = lower.slice(start, end);
  return NEGATIVE_MARKERS.some((m) => window.includes(m));
}

function findSuspiciousQuotedNames(description: string): string[] {
  const found = new Set<string>();
  for (const match of description.matchAll(SNAKE_CASE_RE)) {
    const token = match[1];
    if (typeof token !== 'string') continue;
    if (NDI_DOC_CLASSES.has(token)) continue;
    if (NDI_OPERATIONS.has(token)) continue;
    // If the token appears inside an explicit counter-example
    // ("NEVER assume X exists — it is NOT a real NDI column"), treat
    // it as explained and don't flag.
    if (
      typeof match.index === 'number' &&
      isNearNegativeMarker(description, match.index)
    ) {
      continue;
    }
    found.add(token);
  }
  return [...found].sort();
}

describe('lib/ai/tools — description lint', () => {
  it('exposes a non-empty tool registry', () => {
    expect(Object.keys(tools).length).toBeGreaterThan(0);
  });

  // Self-test the heuristics so we know the test is doing real work.
  // Without these, the test could silently become a no-op if someone
  // accidentally widened the allowlist or broke the regex.
  describe('lint heuristics self-test', () => {
    it('flags a positively-cited unknown snake_case token', () => {
      const bad =
        'Pass groupBy="treatment_group" to split by treatment arm.';
      expect(findSuspiciousQuotedNames(bad)).toEqual(['treatment_group']);
    });

    it('allowlists known NDI class names', () => {
      const ok = 'Use className "element_epoch" for epochs.';
      expect(findSuspiciousQuotedNames(ok)).toEqual([]);
    });

    it('allowlists known NDI Query DSL operations', () => {
      const ok =
        'Pass operation "contains_string" or "depends_on" as needed.';
      expect(findSuspiciousQuotedNames(ok)).toEqual([]);
    });

    it('does not flag tokens explained as counter-examples', () => {
      const explained =
        'NEVER assume a specific column name like "fake_column" exists — that is NOT a real NDI column convention.';
      expect(findSuspiciousQuotedNames(explained)).toEqual([]);
    });

    it('flags a token even when negative phrasing exists far away', () => {
      // Negative phrasing 400+ chars from the bad token; should still flag.
      const padded =
        'NEVER assume names. ' +
        ' '.repeat(400) +
        'Pass "real_looking_thing" as the column.';
      expect(findSuspiciousQuotedNames(padded)).toEqual([
        'real_looking_thing',
      ]);
    });

    it('substring disclaimer matcher accepts the canonical phrasings', () => {
      expect(hasSubstringDisclaimer('uses a broad substring match')).toBe(
        true,
      );
      expect(hasSubstringDisclaimer('case-insensitive substring')).toBe(true);
      expect(hasSubstringDisclaimer('exact match only')).toBe(false);
    });
  });

  // Generate one test per tool. Wrapping in describe.each-like
  // iteration keeps the failure messages clear: each failure names the
  // specific tool that broke the rule.
  for (const [toolName, entry] of Object.entries(tools)) {
    describe(toolName, () => {
      it('description is a non-empty string', () => {
        expect(isToolEntry(entry)).toBe(true);
        const description = isToolEntry(entry) ? entry.description : '';
        expect(description.length).toBeGreaterThan(20);
      });

      it('does not contain unexplained quoted snake_case field/column names', () => {
        if (!isToolEntry(entry)) return;
        const suspicious = findSuspiciousQuotedNames(entry.description);
        const msg = suspicious
          .map(
            (name) =>
              `${toolName} description contains "${name}" which looks like a dataset-specific column name. ` +
              `Generic examples should use either an allowlisted NDI class name OR a placeholder like "COLUMN_NAME".`,
          )
          .join('\n');
        expect(suspicious, msg).toEqual([]);
      });

      it('signals to the LLM that exact names should not be invented', () => {
        if (EXEMPT_FROM_SUBSTRING_RULE.has(toolName)) return;
        if (!isToolEntry(entry)) return;
        const ok = hasSubstringDisclaimer(entry.description);
        expect(
          ok,
          `${toolName} description must mention one of: ` +
            SUBSTRING_PHRASES.map((p) => `"${p}"`).join(', ') +
            `. This signals to the LLM that exact column / class names ` +
            `should not be invented from thin air.`,
        ).toBe(true);
      });
    });
  }
});

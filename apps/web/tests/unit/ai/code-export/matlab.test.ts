/**
 * MATLAB code-export snippet shape per tool. Same approach as the
 * Python sibling — assert substring presence rather than full-string
 * diffs so banner / whitespace tweaks don't churn tests.
 */
import { describe, expect, it } from 'vitest';

import { generateMatlabSnippet } from '@/lib/ai/code-export/matlab';
import type { RecordedToolCall } from '@/lib/ai/code-export/types';

function gen(calls: RecordedToolCall[], question = 'How many datasets exist?') {
  return generateMatlabSnippet(calls, {
    question,
    timestamp: '2026-05-14T00:00:00.000Z',
    chatUrl: 'https://ndi-cloud.com/ask',
  });
}

describe('generateMatlabSnippet', () => {
  it('opens with a leading % comment banner including question + chat URL', () => {
    const snip = gen([]);
    expect(snip).toContain('% NDI Ask — reproducible MATLAB snippet.');
    expect(snip).toContain('% Question: How many datasets exist?');
    expect(snip).toContain('% Generated: 2026-05-14T00:00:00.000Z');
    expect(snip).toContain('% Chat: https://ndi-cloud.com/ask');
  });

  it('reports gracefully when no tool calls were recorded', () => {
    const snip = gen([]);
    expect(snip).toMatch(/no tool calls were recorded/i);
  });

  it('uses %% section markers (one per tool call) for run-section nav', () => {
    const snip = gen([
      { toolName: 'get_dataset', args: { id: 'A' } },
      { toolName: 'get_dataset', args: { id: 'B' } },
    ]);
    expect(snip).toContain('%% Step 1: get_dataset');
    expect(snip).toContain('%% Step 2: get_dataset');
  });

  it('escapes single quotes in string arguments by doubling them', () => {
    const snip = gen([
      { toolName: 'get_dataset', args: { id: "O'Brien-1" } },
    ]);
    expect(snip).toContain("'O''Brien-1'");
  });

  it('renders list_published_datasets via getPublished with name/value args', () => {
    const snip = gen([
      {
        toolName: 'list_published_datasets',
        args: { page: 3, pageSize: 50 },
      },
    ]);
    expect(snip).toContain("ndi.cloud.api.datasets.getPublished('page', 3, 'pageSize', 50");
  });

  it('renders get_dataset with the MATLAB single-quoted id', () => {
    const snip = gen([
      { toolName: 'get_dataset', args: { id: 'DS1' } },
    ]);
    expect(snip).toContain("ndi.cloud.api.datasets.getDataset('DS1')");
  });

  it('renders get_dataset_class_counts with documentClassCounts', () => {
    const snip = gen([
      { toolName: 'get_dataset_class_counts', args: { id: 'DS1' } },
    ]);
    expect(snip).toContain(
      "ndi.cloud.api.documents.documentClassCounts('DS1')",
    );
  });

  it('renders get_facets as a webread TODO comment', () => {
    const snip = gen([{ toolName: 'get_facets', args: {} }]);
    expect(snip).toMatch(/TODO.*facets/i);
    expect(snip).toContain('webread');
  });

  it('renders semantic_search_datasets as commented IDs', () => {
    const snip = gen([
      {
        toolName: 'semantic_search_datasets',
        args: { query: 'memory' },
        result: {
          results: [
            { id: 'DSA', name: 'Alpha' },
            { id: 'DSB', name: null }, // no name → ID only
          ],
        },
      },
    ]);
    expect(snip).toMatch(/not reproducible/i);
    expect(snip).toContain('%  - DSA — Alpha');
    expect(snip).toContain('%  - DSB');
  });

  it('renders query_documents via ndi.query + ndiqueryAll', () => {
    const snip = gen([
      {
        toolName: 'query_documents',
        args: { datasetId: 'DS1', className: 'subject', limit: 5 },
      },
    ]);
    expect(snip).toContain("ndi.query('', 'isa', 'subject'");
    expect(snip).toContain("ndi.cloud.api.documents.ndiqueryAll('DS1'");
    expect(snip).toContain("'pageSize', 5");
  });

  it('renders ndi_query by serializing searchstructure clauses as ndi.query calls', () => {
    const snip = gen([
      {
        toolName: 'ndi_query',
        args: {
          scope: 'public',
          searchstructure: [
            { operation: 'isa', param1: 'subject' },
            {
              operation: 'contains_string',
              field: 'subject.strain',
              param1: 'CRF',
            },
          ],
        },
      },
    ]);
    expect(snip).toContain("ndi.query('', 'isa', 'subject', '')");
    expect(snip).toContain(
      "ndi.query('subject.strain', 'contains_string', 'CRF', '')",
    );
    expect(snip).toContain('&'); // clauses combined
    expect(snip).toContain("ndi.cloud.api.documents.ndiquery('public'");
  });

  it('falls back to a match-all query when ndi_query searchstructure is empty', () => {
    const snip = gen([
      {
        toolName: 'ndi_query',
        args: { scope: 'public', searchstructure: [] },
      },
    ]);
    expect(snip).toContain('empty searchstructure');
  });

  it('renders aggregate_documents with a containers.Map reduce', () => {
    const snip = gen([
      {
        toolName: 'aggregate_documents',
        args: {
          scope: 'public',
          searchstructure: [{ operation: 'isa', param1: 'subject' }],
          valueField: 'data.subject.weight_grams',
          groupBy: 'data.subject.strain',
          maxDocs: 1000,
        },
      },
    ]);
    expect(snip).toContain("containers.Map('KeyType', 'char'");
    expect(snip).toContain("strsplit('data.subject.weight_grams'");
    expect(snip).toContain("strsplit('data.subject.strain'");
    expect(snip).toContain('docs(1:1000)');
  });

  it('uses "all" as the only group key when aggregate_documents has no groupBy', () => {
    const snip = gen([
      {
        toolName: 'aggregate_documents',
        args: {
          scope: 'public',
          searchstructure: [{ operation: 'isa', param1: 'subject' }],
          valueField: 'data.subject.weight_grams',
        },
      },
    ]);
    expect(snip).toContain("key = 'all'");
  });

  it('renders tabular_query with the ontologyTableRow query chain', () => {
    const snip = gen([
      {
        toolName: 'tabular_query',
        args: {
          datasetId: 'DSX',
          variableNameContains: 'ElevatedPlusMaze',
          groupBy: 'Treatment',
          title: 'EPM Open-arm Entries',
        },
      },
    ]);
    expect(snip).toContain("ndi.query('', 'isa', 'ontologyTableRow')");
    expect(snip).toContain(
      "ndi.query('ontologyTableRow.variableNames', 'contains_string', 'ElevatedPlusMaze')",
    );
    expect(snip).toContain('EPM Open-arm Entries'); // title in comment
  });

  it('renders fetch_signal with getDocument + a TODO for the binary decode path', () => {
    const snip = gen([
      {
        toolName: 'fetch_signal',
        args: {
          datasetId: 'DSY',
          docId: 'DOC1',
          downsample: 1500,
          t0: 0.5,
          t1: 12.5,
        },
      },
    ]);
    expect(snip).toContain(
      "ndi.cloud.api.documents.getDocument('DSY', 'DOC1')",
    );
    expect(snip).toContain('1500');
    expect(snip).toMatch(/TODO/);
  });

  // a834 P1 #C-1 (2026-05-14) — chart-tool snippet branches.
  it('renders fetch_image with getDocument + imshow', () => {
    const snip = gen([
      {
        toolName: 'fetch_image',
        args: {
          datasetId: 'DS1',
          docId: 'DOC1',
          frame: 0,
          title: 'Patch map',
        },
      },
    ]);
    expect(snip).toContain(
      "ndi.cloud.api.documents.getDocument('DS1', 'DOC1')",
    );
    expect(snip).toContain('imshow');
    expect(snip).toContain('openbinarydoc');
    expect(snip).toContain("title('Patch map')");
  });

  it('renders treatment_timeline with ndi.query treatment + patch', () => {
    const snip = gen([
      {
        toolName: 'treatment_timeline',
        args: { datasetId: 'DS1', title: 'CNO timeline' },
      },
    ]);
    expect(snip).toContain("ndi.query('', 'isa', 'treatment')");
    expect(snip).toContain('patch(');
    expect(snip).toContain('subjectDocumentIdentifier');
    expect(snip).toContain("title('CNO timeline')");
  });

  it('renders fetch_spike_summary raster via ndi.query vmspikesummary', () => {
    const snip = gen([
      {
        toolName: 'fetch_spike_summary',
        args: {
          datasetId: 'DS1',
          unitNameMatch: 'Saline',
          kind: 'raster',
          maxUnits: 5,
        },
      },
    ]);
    expect(snip).toContain("ndi.query('', 'isa', 'vmspikesummary')");
    expect(snip).toContain(
      "ndi.query('vmspikesummary.name', 'contains_string', 'Saline')",
    );
    expect(snip).toContain("'pageSize', 5");
    expect(snip).toContain("'|'"); // raster tick marker
  });

  it('renders fetch_spike_summary ISI histogram for kind=isi_histogram', () => {
    const snip = gen([
      {
        toolName: 'fetch_spike_summary',
        args: {
          datasetId: 'DS1',
          unitDocId: 'UNIT_X',
          kind: 'isi_histogram',
        },
      },
    ]);
    expect(snip).toContain(
      "ndi.cloud.api.documents.getDocument('DS1', 'UNIT_X')",
    );
    expect(snip).toContain('histogram(');
    expect(snip).toContain('logspace');
    expect(snip).toContain('ISI (ms)');
  });

  it('renders walk_provenance as a function definition + invocation', () => {
    const snip = gen([
      {
        toolName: 'walk_provenance',
        args: { datasetId: 'DS', docId: 'DC', maxDepth: 4 },
      },
    ]);
    expect(snip).toContain('function lineage = walkProvenance');
    expect(snip).toContain("walkProvenance('DS', 'DC', 4)");
  });

  it('renders lookup_ontology as a webread TODO comment', () => {
    const snip = gen([
      { toolName: 'lookup_ontology', args: { term: 'CL:0000540' } },
    ]);
    expect(snip).toMatch(/TODO/);
    expect(snip).toContain("'CL:0000540'");
  });

  it('emits a TODO for unknown tool names with args dumped', () => {
    const snip = gen([
      { toolName: 'mystery_tool', args: { weird: 42 } },
    ]);
    expect(snip).toMatch(/TODO.*mystery_tool/);
    expect(snip).toContain("struct('weird', 42)");
  });

  it('is deterministic for the same input', () => {
    const calls: RecordedToolCall[] = [
      { toolName: 'get_dataset', args: { id: 'X' } },
      { toolName: 'get_dataset_class_counts', args: { id: 'Y' } },
    ];
    expect(gen(calls)).toEqual(gen(calls));
  });
});

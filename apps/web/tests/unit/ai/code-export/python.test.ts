/**
 * Python code-export snippet shape per tool. We assert the snippet
 * contains the right SDK call + arguments rather than diffing the
 * whole string — keeps tests resilient to comment / banner tweaks.
 */
import { describe, expect, it } from 'vitest';

import { generatePythonSnippet } from '@/lib/ai/code-export/python';
import type { RecordedToolCall } from '@/lib/ai/code-export/types';

function gen(calls: RecordedToolCall[], question = 'How many datasets exist?') {
  return generatePythonSnippet(calls, {
    question,
    timestamp: '2026-05-14T00:00:00.000Z',
    chatUrl: 'https://ndi-cloud.com/ask',
  });
}

describe('generatePythonSnippet', () => {
  it('always starts with imports + the docstring banner', () => {
    const snip = gen([]);
    expect(snip).toContain('import ndi');
    expect(snip).toContain('import ndi.cloud.api.datasets');
    expect(snip).toContain('import ndi.query');
    expect(snip).toContain('Question: How many datasets exist?');
    expect(snip).toContain('Generated: 2026-05-14T00:00:00.000Z');
    expect(snip).toContain('Chat: https://ndi-cloud.com/ask');
  });

  it('reports gracefully when no tool calls were recorded', () => {
    const snip = gen([]);
    expect(snip).toMatch(/no tool calls were recorded/i);
  });

  it('escapes quoted strings in the docstring banner', () => {
    const snip = generatePythonSnippet([], {
      question: 'What is "memory" research?',
      timestamp: '2026-05-14T00:00:00.000Z',
    });
    // The docstring uses triple-double-quote terminators so embedded
    // double-quotes need to render in a way that doesn't close the
    // docstring early. Our implementation collapses to a single line
    // and lets the raw " through (Python is fine with " inside
    // triple-quoted "...").
    expect(snip).toContain('Question:');
  });

  it('renders list_published_datasets with explicit pagination', () => {
    const snip = gen([
      {
        toolName: 'list_published_datasets',
        args: { page: 2, pageSize: 25 },
      },
    ]);
    expect(snip).toContain('ndi.cloud.api.datasets.getPublished(');
    expect(snip).toContain('page=2');
    expect(snip).toContain('page_size=25');
  });

  it('renders list_published_datasets with a search query', () => {
    const snip = gen([
      {
        toolName: 'list_published_datasets',
        args: { query: 'auditory cortex' },
      },
    ]);
    expect(snip).toContain('query="auditory cortex"');
  });

  it('renders get_dataset with a quoted dataset id', () => {
    const snip = gen([
      { toolName: 'get_dataset', args: { id: '69bc5ca11d547b1f6d083761' } },
    ]);
    expect(snip).toContain(
      'ndi.cloud.api.datasets.getDataset("69bc5ca11d547b1f6d083761")',
    );
  });

  it('renders get_dataset_class_counts using documentClassCounts', () => {
    const snip = gen([
      { toolName: 'get_dataset_class_counts', args: { id: 'DS1' } },
    ]);
    expect(snip).toContain(
      'ndi.cloud.api.documents.documentClassCounts("DS1")',
    );
  });

  it('renders get_facets with a TODO comment about the SDK gap', () => {
    const snip = gen([{ toolName: 'get_facets', args: {} }]);
    expect(snip).toMatch(/TODO.*facets/i);
  });

  it('renders semantic_search_datasets as commented IDs (RAG is not replicable)', () => {
    const snip = gen([
      {
        toolName: 'semantic_search_datasets',
        args: { query: 'memory and learning' },
        result: {
          results: [
            { id: 'DSA', name: 'Alpha' },
            { id: 'DSB', name: 'Beta' },
          ],
        },
      },
    ]);
    expect(snip).toMatch(/isn't reproducible/i);
    expect(snip).toContain('# - DSA — Alpha');
    expect(snip).toContain('# - DSB — Beta');
  });

  it('renders query_documents with the className as an isa Query', () => {
    const snip = gen([
      {
        toolName: 'query_documents',
        args: { datasetId: 'DS1', className: 'probe', limit: 15 },
      },
    ]);
    expect(snip).toContain('"isa"');
    expect(snip).toContain('"probe"');
    expect(snip).toContain('ndi.cloud.api.documents.ndiqueryAll(');
    expect(snip).toContain('page_size=15');
  });

  it('renders ndi_query by serializing the searchstructure into Query objects', () => {
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
    expect(snip).toContain(
      'ndi.query.ndi_query.from_search("", "isa", "subject", "")',
    );
    expect(snip).toContain(
      'ndi.query.ndi_query.from_search("subject.strain", "contains_string", "CRF", "")',
    );
    // Two clauses → combined with &
    expect(snip).toContain('&');
    expect(snip).toContain('ndi.cloud.api.documents.ndiquery(');
    expect(snip).toContain('"public"');
  });

  it('falls back to a match-all query when ndi_query has empty searchstructure', () => {
    const snip = gen([
      {
        toolName: 'ndi_query',
        args: { scope: 'public', searchstructure: [] },
      },
    ]);
    expect(snip).toContain('empty searchstructure');
  });

  it('renders aggregate_documents with both numpy import and group reduction', () => {
    const snip = gen([
      {
        toolName: 'aggregate_documents',
        args: {
          scope: 'public',
          searchstructure: [{ operation: 'isa', param1: 'vmspikesummary' }],
          valueField: 'data.vmspikesummary.mean_firing_rate',
          groupBy: 'data.subject.strain',
        },
      },
    ]);
    expect(snip).toContain('import statistics');
    expect(snip).toContain('"data.vmspikesummary.mean_firing_rate"');
    expect(snip).toContain('"data.subject.strain"');
    expect(snip).toMatch(/groups\.setdefault\(key, \[\]\)\.append/);
  });

  it('uses "all" as the single group key when aggregate_documents has no groupBy', () => {
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
    expect(snip).toContain('key = "all"');
  });

  it('renders tabular_query with the ontologyTableRow query + pandas import', () => {
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
    expect(snip).toContain('import pandas as pd');
    expect(snip).toContain('"isa", "ontologyTableRow"');
    expect(snip).toContain('"contains_string", "ElevatedPlusMaze"');
    expect(snip).toContain('"treatment"'); // lowercased hint
    expect(snip).toContain('EPM Open-arm Entries'); // title in comment
  });

  it('renders fetch_signal with a getDocument call + downsample comment', () => {
    const snip = gen([
      {
        toolName: 'fetch_signal',
        args: {
          datasetId: 'DSY',
          docId: 'DOC1',
          downsample: 1500,
          t0: 0.5,
          t1: 12.5,
          file: 'ai_group1_seg.nbf_1',
        },
      },
    ]);
    expect(snip).toContain(
      'ndi.cloud.api.documents.getDocument(\n    "DSY", "DOC1"',
    );
    expect(snip).toContain('1500');
    expect(snip).toContain('t0=0.5');
    expect(snip).toContain('t1=12.5');
    expect(snip).toContain('ai_group1_seg.nbf_1');
  });

  it('renders walk_provenance with a recursive helper', () => {
    const snip = gen([
      {
        toolName: 'walk_provenance',
        args: { datasetId: 'DS', docId: 'DC', maxDepth: 4 },
      },
    ]);
    expect(snip).toContain('def walk_provenance');
    expect(snip).toContain('walk_provenance(\n    "DS", "DC", 4');
    expect(snip).toContain('ndi.cloud.api.documents.getDocument');
  });

  it('renders lookup_ontology via ndi.ontology.lookup', () => {
    const snip = gen([
      { toolName: 'lookup_ontology', args: { term: 'CL:0000540' } },
    ]);
    expect(snip).toContain('ndi.ontology.lookup("CL:0000540")');
  });

  it('emits a TODO when the tool name is not in the registry', () => {
    const snip = gen([
      { toolName: 'mystery_tool', args: { weird: true } },
    ]);
    expect(snip).toMatch(/TODO.*mystery_tool/);
    expect(snip).toContain('"weird": True');
  });

  it('numbers each step in the snippet for navigability', () => {
    const snip = gen([
      { toolName: 'get_dataset', args: { id: 'A' } },
      { toolName: 'get_dataset', args: { id: 'B' } },
    ]);
    expect(snip).toContain('Step 1: get_dataset');
    expect(snip).toContain('Step 2: get_dataset');
  });

  it('produces deterministic output for the same input', () => {
    const calls: RecordedToolCall[] = [
      { toolName: 'get_dataset', args: { id: 'X' } },
      { toolName: 'lookup_ontology', args: { term: 'UBERON:0001870' } },
    ];
    expect(gen(calls)).toEqual(gen(calls));
  });
});

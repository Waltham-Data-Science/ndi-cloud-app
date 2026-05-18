/**
 * ToolCallIndicator — verifies the two visual modes (in-flight vs
 * completed/restored) and the human-readable label mapping for every
 * registered tool. Plays a key role in fixing P0-C ("perpetual
 * spinner after refresh") by giving ChatThread a way to render
 * completed tool calls as static, subdued text.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ToolCallIndicator } from '@/components/ai/ToolCallIndicator';

describe('ToolCallIndicator', () => {
  describe('in-flight mode (default)', () => {
    it('renders pulse + italic when inProgress is true', () => {
      const { container } = render(
        <ToolCallIndicator toolName="fetch_signal" inProgress={true} />,
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).toContain('italic');
      expect(root.querySelector('.animate-pulse')).not.toBeNull();
      // Trailing ellipsis on the label to read as "working on it".
      expect(screen.getByText(/loading signal data…/)).toBeTruthy();
    });

    it('defaults to in-flight mode when inProgress is not specified', () => {
      const { container } = render(
        <ToolCallIndicator toolName="fetch_signal" />,
      );

      expect((container.firstChild as HTMLElement).className).toContain('italic');
    });
  });

  describe('completed/restored mode', () => {
    it('renders without pulse + italic when inProgress is false', () => {
      const { container } = render(
        <ToolCallIndicator toolName="fetch_signal" inProgress={false} />,
      );

      const root = container.firstChild as HTMLElement;
      expect(root.className).not.toContain('italic');
      expect(root.querySelector('.animate-pulse')).toBeNull();
      // No trailing ellipsis — past-tense reading.
      expect(screen.getByText('loading signal data')).toBeTruthy();
    });

    it('marks completed entries with aria-label so SR announces them as past actions', () => {
      const { container } = render(
        <ToolCallIndicator toolName="fetch_signal" inProgress={false} />,
      );

      const root = container.firstChild as HTMLElement;
      expect(root.getAttribute('aria-label')).toMatch(/Completed:/);
    });
  });

  describe('label mapping', () => {
    it.each([
      ['list_published_datasets', 'browsing the catalog'],
      ['get_dataset', 'looking up the dataset'],
      ['get_dataset_summary', 'reading the dataset summary'],
      ['semantic_search_datasets', 'searching for relevant datasets'],
      ['query_documents', 'querying documents in the dataset'],
      ['walk_provenance', 'walking the provenance graph'],
      ['tabular_query', 'aggregating values across documents'],
      ['ndi_query', 'running an NDI query'],
      ['aggregate_documents', 'computing aggregate statistics'],
      ['lookup_ontology', 'resolving an ontology term'],
      ['fetch_signal', 'loading signal data'],
      ['fetch_image', 'loading the image'],
      ['fetch_spike_summary', 'loading spike data'],
      ['treatment_timeline', 'assembling the treatment timeline'],
    ])('maps %s to "%s"', (toolName, expectedLabel) => {
      render(<ToolCallIndicator toolName={toolName} inProgress={false} />);
      expect(screen.getByText(expectedLabel)).toBeTruthy();
    });

    it('strips the dynamic-tool prefix the AI SDK adds for dynamicTools', () => {
      // The AI SDK can emit `dynamic-tool-<name>` when a tool is
      // registered via `dynamicTools` rather than the typed map. The
      // indicator should still produce a clean human label.
      render(
        <ToolCallIndicator toolName="dynamic-tool-fetch_signal" inProgress={false} />,
      );
      expect(screen.getByText('loading signal data')).toBeTruthy();
    });

    it('falls back to "using <name>" for an unknown tool name', () => {
      render(<ToolCallIndicator toolName="brand_new_tool" />);
      expect(screen.getByText(/using brand_new_tool…/)).toBeTruthy();
    });
  });
});

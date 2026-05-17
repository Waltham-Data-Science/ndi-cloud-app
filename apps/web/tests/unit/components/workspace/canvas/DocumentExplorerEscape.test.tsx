/**
 * DocumentExplorerEscape — the SINGLE outbound link from the
 * workspace canvas to the Document Explorer. Verifies:
 *
 *   - href is correctly composed from datasetId
 *   - target="_blank" + rel="noopener" so the workspace stays put
 *   - the link text reads "Browse all documents in Document Explorer"
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DocumentExplorerEscape } from '@/components/workspace/canvas/DocumentExplorerEscape';

describe('DocumentExplorerEscape', () => {
  it('renders a link with the correct href', () => {
    render(<DocumentExplorerEscape datasetId="abc123" />);
    const link = screen.getByRole('link', {
      name: /Browse all documents in Document Explorer/i,
    });
    expect(link).toHaveAttribute('href', '/datasets/abc123/documents');
  });

  it('opens in a new tab so the workspace stays put', () => {
    render(<DocumentExplorerEscape datasetId="abc123" />);
    const link = screen.getByRole('link', {
      name: /Browse all documents/i,
    });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders an ExternalLink icon for visual escape-hatch cue', () => {
    const { container } = render(<DocumentExplorerEscape datasetId="x" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

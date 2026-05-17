/**
 * UseThisDataModal — verifies the Python and MATLAB tabs show the
 * minimal-by-default snippet, the Advanced toggle swaps to the
 * re-runnable form, tab switching preserves the toggle state, and
 * <DATASET_ID> is substituted.
 *
 * 2026-05-17 — Steve flagged that the old default was too verbose
 * for "copy + paste into MATLAB" usage. The default is now the
 * one-line form; the verbose re-runnable form is opt-in via the
 * Advanced toggle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  UseThisDataModal,
  substituteDatasetId,
} from '@/components/datasets/UseThisDataModal';

describe('substituteDatasetId', () => {
  it('replaces every occurrence of <DATASET_ID>', () => {
    const t = '<DATASET_ID> and <DATASET_ID>';
    expect(substituteDatasetId(t, 'abc')).toBe('abc and abc');
  });
  it('is a no-op when the token is absent', () => {
    expect(substituteDatasetId('hello', 'abc')).toBe('hello');
  });
  it('safely handles ids that contain regex metacharacters', () => {
    expect(substituteDatasetId('<DATASET_ID>', '(a|b).*')).toBe('(a|b).*');
  });
});

describe('UseThisDataModal — minimal snippets (default)', () => {
  let writeText: ReturnType<typeof vi.fn>;
  const DATASET_ID = 'ds-1234-abcd';

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  it('renders the Python tab by default with the minimal snippet', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    const pre = screen.getByTestId('snippet-python-content');
    const text = pre.textContent ?? '';
    // Minimal form — one-line download + one helper example.
    expect(text).toContain('import ndi');
    expect(text).toContain(
      `dataset = ndi.cloud.downloadDataset("${DATASET_ID}")`,
    );
    expect(text).toContain('subject_df = ndi.fun.doc_table.subject(dataset)');
    // None of the verbose-form auth scaffolding is present.
    expect(text).not.toContain('from ndi.cloud.auth import login');
    expect(text).not.toContain('CloudClient(config)');
    expect(text).not.toContain('<DATASET_ID>');
  });

  it('renders the MATLAB tab with the minimal one-line form', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('tab-matlab'));
    const pre = screen.getByTestId('snippet-matlab-content');
    const text = pre.textContent ?? '';
    expect(text).toContain(
      `dataset = ndi.cloud.downloadDataset('${DATASET_ID}');`,
    );
    expect(text).toContain(
      'subjectSummary = ndi.fun.docTable.subject(dataset);',
    );
    // None of the verbose dataPath / isfolder dance in the default form.
    expect(text).not.toContain("dataPath = [userpath filesep 'Datasets'];");
    expect(text).not.toContain('if isfolder(datasetPath)');
    expect(text).not.toContain('<DATASET_ID>');
  });

  it('shows the dissonance note in both tabs', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    const note = screen.getByTestId('dissonance-note');
    expect(note.textContent).toMatch(
      /download.*local.*v2's browser.*without downloading/i,
    );
    fireEvent.click(screen.getByTestId('tab-matlab'));
    expect(screen.getByTestId('dissonance-note').textContent).toMatch(
      /without downloading/i,
    );
  });

  it('shows the Advanced toggle defaulting to OFF (minimal)', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    const toggle = screen.getByTestId('advanced-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toMatch(/Minimal/i);
  });

  it('copy button writes the minimal Python snippet to clipboard', async () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('snippet-python-copy'));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0]![0] as string;
    expect(arg).toContain(`ndi.cloud.downloadDataset("${DATASET_ID}")`);
    expect(arg).not.toContain('CloudClient');
  });

  it('copy button writes the minimal MATLAB snippet to clipboard', async () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('tab-matlab'));
    fireEvent.click(screen.getByTestId('snippet-matlab-copy'));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0]![0] as string;
    expect(arg).toContain(`ndi.cloud.downloadDataset('${DATASET_ID}');`);
    expect(arg).not.toContain('dataPath');
  });
});

describe('UseThisDataModal — Advanced toggle reveals re-runnable form', () => {
  const DATASET_ID = 'ds-1234-abcd';

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('toggling Advanced swaps the Python snippet to the verbose form', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    const pre = screen.getByTestId('snippet-python-content');
    const text = pre.textContent ?? '';
    expect(text).toContain('from ndi.cloud.auth import login');
    expect(text).toContain('CloudClient(config)');
    expect(text).toContain('"~/ndi-datasets"');
    expect(text).toContain(`downloadDataset(`);
    expect(text).toContain(`"${DATASET_ID}"`);
  });

  it('toggling Advanced swaps the MATLAB snippet to the re-runnable form', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('tab-matlab'));
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    const pre = screen.getByTestId('snippet-matlab-content');
    const text = pre.textContent ?? '';
    expect(text).toContain("dataPath = [userpath filesep 'Datasets'];");
    expect(text).toContain('if isfolder(datasetPath)');
    expect(text).toContain('dataset = ndi.dataset.dir(datasetPath);');
    expect(text).toContain(
      `dataset = ndi.cloud.downloadDataset('${DATASET_ID}', dataPath);`,
    );
  });

  it('toggle state persists when switching tabs', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    fireEvent.click(screen.getByTestId('tab-matlab'));
    const matlabAdvanced = screen.getByTestId('snippet-matlab-content').textContent ?? '';
    expect(matlabAdvanced).toContain('if isfolder(datasetPath)');
    fireEvent.click(screen.getByTestId('tab-python'));
    const pythonAdvanced = screen.getByTestId('snippet-python-content').textContent ?? '';
    expect(pythonAdvanced).toContain('CloudClient(config)');
  });

  it('toggle back to Minimal restores the simple snippet', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    expect(
      screen.getByTestId('advanced-toggle').getAttribute('aria-checked'),
    ).toBe('false');
    const text = screen.getByTestId('snippet-python-content').textContent ?? '';
    expect(text).not.toContain('CloudClient');
  });
});

describe('UseThisDataModal — tab a11y', () => {
  const DATASET_ID = 'ds-1234-abcd';

  it('the active tab is tracked via aria-selected', () => {
    render(
      <UseThisDataModal open onClose={() => {}} datasetId={DATASET_ID} />,
    );
    expect(screen.getByTestId('tab-python').getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.click(screen.getByTestId('tab-matlab'));
    expect(screen.getByTestId('tab-matlab').getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByTestId('tab-python').getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    render(
      <UseThisDataModal open onClose={onClose} datasetId={DATASET_ID} />,
    );
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

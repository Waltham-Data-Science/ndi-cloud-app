/**
 * CodeExportButton — exercises the click-to-open + tab switching +
 * clipboard copy + download paths. The actual snippet generation is
 * tested in lib/ai/code-export/*.test.ts; here we just verify the
 * UI wires them up.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CodeExportButton } from '@/components/ai/CodeExportButton';
import type { RecordedToolCall } from '@/lib/ndi/code-export/types';

const SAMPLE_CALLS: RecordedToolCall[] = [
  { toolName: 'get_dataset', args: { id: 'DS1' } },
  {
    toolName: 'ndi_query',
    args: {
      scope: 'public',
      searchstructure: [{ operation: 'isa', param1: 'subject' }],
    },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<CodeExportButton/>', () => {
  it('renders the pill button when there is at least one tool call', () => {
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    expect(
      screen.getByTestId('code-export-button'),
    ).toHaveTextContent(/show code/i);
  });

  it('renders nothing when toolCalls is empty', () => {
    const { container } = render(<CodeExportButton toolCalls={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the modal on click with both language tabs', async () => {
    const user = userEvent.setup();
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    expect(screen.getByTestId('code-export-modal')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Python' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'MATLAB' })).toBeInTheDocument();
  });

  it('shows the Python snippet by default', async () => {
    const user = userEvent.setup();
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    const snippet = screen.getByTestId('code-export-snippet');
    expect(snippet.textContent).toContain('import ndi');
    expect(snippet.textContent).toContain(
      'ndi.cloud.api.datasets.getDataset("DS1")',
    );
  });

  it('switches to the MATLAB snippet when the MATLAB tab is clicked', async () => {
    const user = userEvent.setup();
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    await user.click(screen.getByRole('tab', { name: 'MATLAB' }));
    const snippet = screen.getByTestId('code-export-snippet');
    expect(snippet.textContent).toContain(
      "ndi.cloud.api.datasets.getDataset('DS1')",
    );
    expect(snippet.textContent).toContain('%% Step');
  });

  it('passes question + chatUrl through to the snippet header', async () => {
    const user = userEvent.setup();
    render(
      <CodeExportButton
        toolCalls={SAMPLE_CALLS}
        question="How many datasets exist?"
        chatUrl="https://ndi-cloud.com/ask"
      />,
    );
    await user.click(screen.getByTestId('code-export-button'));
    const snippet = screen.getByTestId('code-export-snippet');
    expect(snippet.textContent).toContain('How many datasets exist?');
    expect(snippet.textContent).toContain('https://ndi-cloud.com/ask');
  });

  it('copies the snippet text via the Clipboard API and surfaces a status', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // userEvent.setup() ALSO installs a stub navigator.clipboard for
    // its own paste/copy hooks; we override after setup so our spy is
    // the one the component sees on click.
    const user = userEvent.setup();
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
      writeText,
    } as unknown as Clipboard);
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    await user.click(screen.getByTestId('code-export-copy'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain('import ndi');
    expect(
      screen.getByTestId('code-export-status').textContent,
    ).toMatch(/copied/i);
  });

  it('falls back to a status message when the Clipboard API is unavailable', async () => {
    const user = userEvent.setup();
    // After userEvent.setup() — override the clipboard getter to
    // return undefined so the component takes its no-clipboard branch.
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(
      undefined as unknown as Clipboard,
    );
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    await user.click(screen.getByTestId('code-export-copy'));
    expect(
      screen.getByTestId('code-export-status').textContent,
    ).toMatch(/clipboard unavailable/i);
  });

  it('downloads a .py file when the Download button is clicked in the Python tab', async () => {
    const createUrl = vi.fn().mockReturnValue('blob:fake');
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createUrl,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeUrl,
      configurable: true,
    });
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        const el = origCreate(tag);
        if (tag === 'a') {
          (el as HTMLAnchorElement).click = clickSpy;
        }
        return el;
      });

    const user = userEvent.setup();
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    await user.click(screen.getByTestId('code-export-download'));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    createSpy.mockRestore();
  });

  it('switches the Download label to .m when the MATLAB tab is active', async () => {
    const user = userEvent.setup();
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    await user.click(screen.getByRole('tab', { name: 'MATLAB' }));
    expect(
      screen.getByTestId('code-export-download').textContent,
    ).toMatch(/\.m/);
  });

  it('closes the modal when the close button is clicked', async () => {
    const user = userEvent.setup();
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    expect(screen.getByTestId('code-export-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('code-export-modal')).toBeNull();
  });

  it('closes the modal on Escape key', async () => {
    const user = userEvent.setup();
    render(<CodeExportButton toolCalls={SAMPLE_CALLS} />);
    await user.click(screen.getByTestId('code-export-button'));
    expect(screen.getByTestId('code-export-modal')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('code-export-modal')).toBeNull();
  });
});

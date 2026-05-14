/**
 * ShareConversationButton — verifies clipboard interaction,
 * disabled-state semantics, and the "Copied!" transient feedback.
 *
 * `navigator.clipboard` is not present in the jsdom environment by
 * default — we install a mock on `navigator` directly so the
 * production code path (the Clipboard API branch) is exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ShareConversationButton } from '@/components/ai/ShareConversationButton';

function installClipboardMock(writeText: (s: string) => Promise<void>) {
  // jsdom does not expose `navigator.clipboard`. Define a fresh
  // descriptor for the test, then restore in afterEach.
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

afterEach(() => {
  // Strip the mock so the next test starts clean.
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  } catch {
    // ignore
  }
});

describe('ShareConversationButton', () => {
  it('renders disabled with helpful copy when shareUrl is null', () => {
    render(<ShareConversationButton shareUrl={null} />);
    const btn = screen.getByRole('button', { name: /share unavailable/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringMatching(/send a message/i));
  });

  it('calls navigator.clipboard.writeText with the share URL on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboardMock(writeText);

    render(
      <ShareConversationButton shareUrl="https://ndi-cloud.com/ask#c=abc-123" />,
    );

    const btn = screen.getByRole('button', { name: /copy share link/i });
    fireEvent.click(btn);

    // writeText returns a promise — flush microtasks before the
    // setState in the .then() handler runs.
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('https://ndi-cloud.com/ask#c=abc-123');
  });

  it('shows the "Copied" affordance after a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboardMock(writeText);

    render(
      <ShareConversationButton shareUrl="https://ndi-cloud.com/ask#c=zzz" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy share link/i }));

    // findByText retries until the async setState in the click
    // handler flushes (post-await promise resolution).
    const copied = await screen.findByText(/copied/i);
    expect(copied).toBeInTheDocument();
  });

  it('falls back to execCommand("copy") when clipboard.writeText is unavailable', async () => {
    // Clipboard API absent.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });

    const execSpy = vi.fn(() => true);
    const origExec = document.execCommand;
    document.execCommand = execSpy as unknown as typeof document.execCommand;

    render(
      <ShareConversationButton shareUrl="https://ndi-cloud.com/ask#c=fallback" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /copy share link/i }));

    await Promise.resolve();
    await Promise.resolve();

    expect(execSpy).toHaveBeenCalledWith('copy');

    document.execCommand = origExec;
  });

  it('does not call clipboard when the button is disabled', () => {
    const writeText = vi.fn();
    installClipboardMock(writeText);

    render(<ShareConversationButton shareUrl={null} />);
    fireEvent.click(screen.getByRole('button'));

    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('ShareConversationButton — copied flash timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the "Copied" state after the flash window elapses', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboardMock(writeText);

    render(
      <ShareConversationButton shareUrl="https://ndi-cloud.com/ask#c=flash" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /copy share link/i }));

    // Flush the awaited writeText.
    await vi.runOnlyPendingTimersAsync();

    expect(screen.getByText(/copied/i)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);

    expect(screen.queryByText(/^copied$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/share/i)).toBeInTheDocument();
  });
});

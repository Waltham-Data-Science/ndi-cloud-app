/**
 * ChatThread — verifies the inProgress wiring it threads through to
 * ToolCallIndicator entries. This is the wiring that closes P0-C:
 * pulse + italic should only render for the trailing tool-call entry
 * during an active stream. Everything else renders static.
 *
 * We mock ChatMessage so this test focuses on the entry-routing
 * logic and the inProgress prop computation; ChatMessage's own
 * rendering is covered elsewhere.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/ai/ChatMessage', () => ({
  ChatMessage: ({ role, content }: { role: string; content: string }) => (
    <div data-testid={`chat-msg-${role}`}>{content}</div>
  ),
}));

import { ChatThread, type ThreadEntry } from '@/components/ai/ChatThread';

describe('ChatThread', () => {
  it('marks only the trailing tool-call entry as in-flight while streaming', () => {
    const entries: ThreadEntry[] = [
      { kind: 'message', role: 'user', content: 'show me a trace' },
      { kind: 'tool-call', toolName: 'semantic_search_datasets' },
      { kind: 'tool-call', toolName: 'fetch_signal' }, // trailing — in-flight
    ];

    const { container } = render(
      <ChatThread entries={entries} isStreaming={true} />,
    );

    // Two ToolCallIndicator divs rendered. Find them by their label
    // text — the in-flight one ends with "…", the completed one
    // doesn't.
    const inFlight = container.querySelectorAll('.italic');
    const completed = container.querySelectorAll('[aria-label^="Completed:"]');

    // Trailing entry: in-flight (italic + pulse).
    expect(inFlight.length).toBe(1);
    // Earlier tool-call entry: completed (static, aria-label includes "Completed:").
    expect(completed.length).toBe(1);
  });

  it('renders every tool-call entry as static when not streaming', () => {
    const entries: ThreadEntry[] = [
      { kind: 'message', role: 'user', content: 'q' },
      { kind: 'tool-call', toolName: 'semantic_search_datasets' },
      { kind: 'tool-call', toolName: 'fetch_signal' },
      { kind: 'message', role: 'assistant', content: 'here you go' },
    ];

    const { container } = render(
      <ChatThread entries={entries} isStreaming={false} />,
    );

    const inFlight = container.querySelectorAll('.italic');
    const completed = container.querySelectorAll('[aria-label^="Completed:"]');

    // Streaming is over (or this is a hydrated thread): no entries
    // should pulse. This is what kills the "perpetual spinner after
    // refresh" symptom in P0-C.
    expect(inFlight.length).toBe(0);
    expect(completed.length).toBe(2);
  });

  it('does not mark a trailing message entry as a tool-call', () => {
    // If the trailing entry is a regular message (not a tool-call),
    // no ToolCallIndicator should pulse. Sanity check that the
    // "trailing entry" gating is kind-aware.
    const entries: ThreadEntry[] = [
      { kind: 'message', role: 'user', content: 'q' },
      { kind: 'tool-call', toolName: 'fetch_signal' },
      { kind: 'message', role: 'assistant', content: 'answer' },
    ];

    const { container } = render(
      <ChatThread entries={entries} isStreaming={true} />,
    );

    // Only one tool entry total, and it's NOT the trailing entry —
    // so it should render static even though we're "streaming"
    // (the streaming is producing assistant text right now).
    const inFlight = container.querySelectorAll('.italic');
    expect(inFlight.length).toBe(0);
  });
});

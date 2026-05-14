/**
 * useConversation — verifies the URL-hash <-> localStorage wiring.
 *
 * Strategy: render the hook with `renderHook` from
 * @testing-library/react, drive `window.location.hash` directly, and
 * check that the returned shape matches expectations after the mount
 * effect runs.
 *
 * We use real timers EXCEPT for the persist-debounce sequence
 * (which needs fake timers to advance past the 300ms debounce window
 * deterministically).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { UIMessage } from 'ai';

import { useConversation } from '@/lib/ai/use-conversation';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY_PREFIX,
  saveConversation,
  loadConversation,
} from '@/lib/ai/conversation-store';

function userMsg(text: string, id = `u-${text.slice(0, 6)}`): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function setHash(hash: string) {
  // jsdom allows direct hash mutation. Wrap in act so the React tree
  // gets a chance to settle, even though we don't currently listen
  // for hashchange events.
  window.location.hash = hash;
}

beforeEach(() => {
  window.localStorage.clear();
  // Reset the URL hash so tests are independent.
  setHash('');
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  setHash('');
});

describe('useConversation', () => {
  describe('fresh visit (no hash)', () => {
    it('mints a new UUID without writing it to the URL', () => {
      const { result } = renderHook(() => useConversation());

      expect(result.current.conversationId).toMatch(/^[0-9a-fA-F-]{8,}$/);
      expect(result.current.initialMessages).toEqual([]);
      expect(result.current.isNew).toBe(true);
      expect(result.current.shareUrl).toBeNull();
      // URL hash untouched — we don't pollute /ask with a hash until
      // the user actually sends a message.
      expect(window.location.hash).toBe('');
    });
  });

  describe('hash → restore', () => {
    it('restores messages from localStorage when the hash points to a stored conversation', () => {
      const id = '11111111-2222-4333-8444-555555555555';
      const messages = [userMsg('hello'), userMsg('again')];
      const now = Date.now();
      saveConversation(id, {
        createdAt: now - 1000,
        lastMessageAt: now - 500,
        title: 'hello',
        messages,
      });
      setHash(`#c=${id}`);

      const { result } = renderHook(() => useConversation());

      expect(result.current.conversationId).toBe(id);
      expect(result.current.initialMessages).toHaveLength(2);
      expect(result.current.isNew).toBe(false);
      expect(result.current.shareUrl).not.toBeNull();
      expect(result.current.shareUrl).toContain(`c=${id}`);
    });

    it('treats a hash pointing to a missing conversation as new but keeps the id', () => {
      const id = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
      setHash(`#c=${id}`);

      const { result } = renderHook(() => useConversation());

      expect(result.current.conversationId).toBe(id);
      expect(result.current.initialMessages).toEqual([]);
      expect(result.current.isNew).toBe(true);
      // shareUrl is non-null because the hash was already present —
      // the link is shareable even though there's nothing to restore.
      expect(result.current.shareUrl).toContain(`c=${id}`);
    });

    it('ignores an unrecognized hash format', () => {
      setHash('#random=foo');

      const { result } = renderHook(() => useConversation());

      expect(result.current.conversationId).toMatch(/^[0-9a-fA-F-]{8,}$/);
      expect(result.current.isNew).toBe(true);
      expect(result.current.shareUrl).toBeNull();
    });
  });

  describe('persist + URL hash on first message', () => {
    it('writes the URL hash on the first non-empty persist call', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useConversation());

      const id = result.current.conversationId;
      expect(window.location.hash).toBe('');

      act(() => {
        result.current.persist([userMsg('first message')]);
      });

      // The hash should be set synchronously inside persist (before
      // the debounce fires).
      expect(window.location.hash).toBe(`#c=${id}`);
      expect(result.current.shareUrl).toContain(`c=${id}`);
      expect(result.current.isNew).toBe(false);

      // Advance past the 300ms debounce — the localStorage write
      // should have fired.
      act(() => {
        vi.advanceTimersByTime(400);
      });

      const stored = loadConversation(id);
      expect(stored).not.toBeNull();
      expect(stored!.messages).toHaveLength(1);
      expect(stored!._v).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('does not write the hash when persist is called with no messages', () => {
      const { result } = renderHook(() => useConversation());

      act(() => {
        result.current.persist([]);
      });

      expect(window.location.hash).toBe('');
      expect(result.current.shareUrl).toBeNull();
    });

    it('debounces consecutive persist calls into a single write', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useConversation());
      const id = result.current.conversationId;

      act(() => {
        result.current.persist([userMsg('a')]);
        result.current.persist([userMsg('a'), userMsg('b')]);
        result.current.persist([userMsg('a'), userMsg('b'), userMsg('c')]);
      });

      // Before the debounce fires, nothing is in localStorage.
      expect(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`)).toBeNull();

      act(() => {
        vi.advanceTimersByTime(400);
      });

      const stored = loadConversation(id);
      expect(stored).not.toBeNull();
      // Only the latest call's messages should be persisted.
      expect(stored!.messages).toHaveLength(3);
    });
  });

  describe('startNewConversation', () => {
    it('clears the URL hash and mints a fresh id', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useConversation());
      const firstId = result.current.conversationId;

      act(() => {
        result.current.persist([userMsg('first')]);
        vi.advanceTimersByTime(400);
      });

      expect(window.location.hash).toBe(`#c=${firstId}`);

      act(() => {
        result.current.startNewConversation();
      });

      const secondId = result.current.conversationId;
      expect(secondId).not.toBe(firstId);
      expect(secondId).toMatch(/^[0-9a-fA-F-]{8,}$/);
      expect(window.location.hash).toBe('');
      expect(result.current.initialMessages).toEqual([]);
      expect(result.current.isNew).toBe(true);
      expect(result.current.shareUrl).toBeNull();
    });
  });

  describe('initialMessages stability', () => {
    it('returns the restored messages exactly once on mount', () => {
      const id = '77777777-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      const now = Date.now();
      saveConversation(id, {
        createdAt: now - 1000,
        lastMessageAt: now - 500,
        title: 't',
        messages: [userMsg('x')],
      });
      setHash(`#c=${id}`);

      const { result, rerender } = renderHook(() => useConversation());
      const initial = result.current.initialMessages;

      // Rerender without any state change.
      rerender();

      expect(result.current.initialMessages).toBe(initial);
    });
  });
});

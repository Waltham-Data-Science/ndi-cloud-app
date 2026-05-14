/**
 * conversation-store — unit tests for the localStorage-backed
 * /ask persistence layer.
 *
 * jsdom ships a localStorage but it's a real implementation, so we
 * just use it directly and clear it between tests. For the
 * quota-exceeded path we stub `setItem` to throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

import {
  CURRENT_SCHEMA_VERSION,
  MAX_CONVERSATIONS,
  STORAGE_KEY_PREFIX,
  TTL_MS,
  deleteConversation,
  deriveTitle,
  evictLruIfNeeded,
  listConversations,
  loadConversation,
  pruneOldConversations,
  saveConversation,
} from '@/lib/ai/conversation-store';

function makeUserMessage(text: string, id = `m-${text.slice(0, 8)}`): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function makeAssistantMessage(text: string, id = `a-${text.slice(0, 8)}`): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('conversation-store', () => {
  describe('save / load roundtrip', () => {
    it('round-trips a single conversation', () => {
      const id = 'abc-123';
      const messages: UIMessage[] = [
        makeUserMessage('hello world'),
        makeAssistantMessage('hi there'),
      ];
      const now = Date.now();
      saveConversation(id, {
        createdAt: now,
        lastMessageAt: now,
        title: 'hello world',
        messages,
      });

      const loaded = loadConversation(id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(id);
      expect(loaded!._v).toBe(CURRENT_SCHEMA_VERSION);
      expect(loaded!.title).toBe('hello world');
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[0]!.role).toBe('user');
      expect(loaded!.messages[1]!.role).toBe('assistant');
    });

    it('returns null when the key is absent', () => {
      expect(loadConversation('does-not-exist')).toBeNull();
    });

    it('returns null when the stored JSON is invalid', () => {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}corrupt`, 'not-json{{');
      expect(loadConversation('corrupt')).toBeNull();
    });

    it('returns null when the schema version is wrong', () => {
      window.localStorage.setItem(
        `${STORAGE_KEY_PREFIX}wrong-v`,
        JSON.stringify({
          _v: 999,
          id: 'wrong-v',
          createdAt: 1,
          lastMessageAt: 1,
          title: '',
          messages: [],
        }),
      );
      expect(loadConversation('wrong-v')).toBeNull();
    });

    it('returns null when required fields are missing', () => {
      window.localStorage.setItem(
        `${STORAGE_KEY_PREFIX}missing`,
        JSON.stringify({ _v: CURRENT_SCHEMA_VERSION, id: 'missing' }),
      );
      expect(loadConversation('missing')).toBeNull();
    });

    it('returns null when messages contain invalid entries', () => {
      window.localStorage.setItem(
        `${STORAGE_KEY_PREFIX}bad-msgs`,
        JSON.stringify({
          _v: CURRENT_SCHEMA_VERSION,
          id: 'bad-msgs',
          createdAt: 1,
          lastMessageAt: 1,
          title: '',
          messages: [{ role: 'user' /* missing parts */ }],
        }),
      );
      expect(loadConversation('bad-msgs')).toBeNull();
    });

    it('returns null when the stored id does not match the lookup id', () => {
      // Tamper-resistance: someone moved the entry into the wrong slot.
      window.localStorage.setItem(
        `${STORAGE_KEY_PREFIX}slot-a`,
        JSON.stringify({
          _v: CURRENT_SCHEMA_VERSION,
          id: 'slot-b',
          createdAt: 1,
          lastMessageAt: 1,
          title: '',
          messages: [],
        }),
      );
      expect(loadConversation('slot-a')).toBeNull();
    });
  });

  describe('listConversations', () => {
    it('returns an empty array when none exist', () => {
      expect(listConversations()).toEqual([]);
    });

    it('lists all valid conversations with metadata', () => {
      saveConversation('a', {
        createdAt: 1000,
        lastMessageAt: 2000,
        title: 'one',
        messages: [makeUserMessage('one'), makeAssistantMessage('1')],
      });
      saveConversation('b', {
        createdAt: 3000,
        lastMessageAt: 4000,
        title: 'two',
        messages: [makeUserMessage('two')],
      });

      const list = listConversations();
      expect(list).toHaveLength(2);
      const a = list.find((e) => e.id === 'a')!;
      const b = list.find((e) => e.id === 'b')!;
      expect(a.title).toBe('one');
      expect(a.messageCount).toBe(2);
      expect(a.lastMessageAt).toBe(2000);
      expect(b.title).toBe('two');
      expect(b.messageCount).toBe(1);
    });

    it('skips corrupted entries silently', () => {
      saveConversation('good', {
        createdAt: 1,
        lastMessageAt: 1,
        title: 'good',
        messages: [makeUserMessage('good')],
      });
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}bad`, 'definitely not json');

      const list = listConversations();
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe('good');
    });

    it('ignores unrelated localStorage keys', () => {
      window.localStorage.setItem('unrelated', 'whatever');
      window.localStorage.setItem('ndi-other-feature-x', 'whatever');
      saveConversation('a', {
        createdAt: 1,
        lastMessageAt: 1,
        title: 'a',
        messages: [makeUserMessage('a')],
      });

      const list = listConversations();
      expect(list).toHaveLength(1);
      expect(list[0]!.id).toBe('a');
    });
  });

  describe('deleteConversation', () => {
    it('removes a single conversation', () => {
      saveConversation('a', {
        createdAt: 1,
        lastMessageAt: 1,
        title: 'a',
        messages: [makeUserMessage('a')],
      });
      expect(loadConversation('a')).not.toBeNull();
      deleteConversation('a');
      expect(loadConversation('a')).toBeNull();
    });

    it('is a no-op when the key is missing', () => {
      expect(() => deleteConversation('does-not-exist')).not.toThrow();
    });
  });

  describe('pruneOldConversations (TTL)', () => {
    it('removes entries older than 30 days', () => {
      const now = 10_000_000_000;
      saveConversation('old', {
        createdAt: now - TTL_MS - 1000,
        lastMessageAt: now - TTL_MS - 1000,
        title: 'old',
        messages: [makeUserMessage('old')],
      });
      saveConversation('fresh', {
        createdAt: now - 1000,
        lastMessageAt: now - 1000,
        title: 'fresh',
        messages: [makeUserMessage('fresh')],
      });

      const removed = pruneOldConversations(now);
      expect(removed).toBe(1);
      expect(loadConversation('old')).toBeNull();
      expect(loadConversation('fresh')).not.toBeNull();
    });

    it('returns 0 when nothing is stale', () => {
      const now = 10_000_000_000;
      saveConversation('fresh', {
        createdAt: now - 1000,
        lastMessageAt: now - 1000,
        title: 'fresh',
        messages: [makeUserMessage('fresh')],
      });
      expect(pruneOldConversations(now)).toBe(0);
      expect(loadConversation('fresh')).not.toBeNull();
    });

    it('keeps entries exactly at the boundary', () => {
      const now = 10_000_000_000;
      // lastMessageAt === now - TTL_MS means cutoff === lastMessageAt
      // so the entry is NOT older than cutoff.
      saveConversation('edge', {
        createdAt: 1,
        lastMessageAt: now - TTL_MS,
        title: 'edge',
        messages: [makeUserMessage('edge')],
      });
      expect(pruneOldConversations(now)).toBe(0);
      expect(loadConversation('edge')).not.toBeNull();
    });
  });

  describe('evictLruIfNeeded', () => {
    it('does nothing when below the cap', () => {
      for (let i = 0; i < 5; i++) {
        saveConversation(`id-${i}`, {
          createdAt: i,
          lastMessageAt: i,
          title: `t-${i}`,
          messages: [makeUserMessage(`m-${i}`)],
        });
      }
      const removed = evictLruIfNeeded();
      expect(removed).toBe(0);
      expect(listConversations()).toHaveLength(5);
    });

    it('drops the oldest entries when over the cap', () => {
      // Save MAX_CONVERSATIONS + 3 entries, each with a distinct
      // lastMessageAt so LRU ordering is deterministic.
      for (let i = 0; i < MAX_CONVERSATIONS + 3; i++) {
        saveConversation(`id-${i}`, {
          createdAt: i,
          lastMessageAt: i,
          title: `t-${i}`,
          messages: [makeUserMessage(`m-${i}`)],
        });
      }
      const removed = evictLruIfNeeded();
      // We expect to be left at MAX-1 entries (cap - 1).
      expect(listConversations()).toHaveLength(MAX_CONVERSATIONS - 1);
      // Removed count is total - target = (MAX+3) - (MAX-1) = 4.
      expect(removed).toBe(4);
      // The oldest entries are the first ones; they should be gone.
      expect(loadConversation('id-0')).toBeNull();
      expect(loadConversation('id-3')).toBeNull();
      // The newest survives.
      expect(loadConversation(`id-${MAX_CONVERSATIONS + 2}`)).not.toBeNull();
    });
  });

  describe('quota-exceeded handling', () => {
    it('evicts the oldest entry and retries when setItem throws QuotaExceededError', () => {
      // Seed two conversations: an old one (to be evicted) and the
      // one we're about to attempt to save.
      saveConversation('victim', {
        createdAt: 100,
        lastMessageAt: 100,
        title: 'victim',
        messages: [makeUserMessage('victim')],
      });
      saveConversation('survivor', {
        createdAt: 200,
        lastMessageAt: 200,
        title: 'survivor',
        messages: [makeUserMessage('survivor')],
      });

      // Stub setItem on the localStorage instance directly. The
      // jsdom polyfill installed in setup.ts uses a plain object,
      // not Storage.prototype, so we patch the instance method.
      const realSetItem = window.localStorage.setItem.bind(
        window.localStorage,
      );
      let throws = 1;
      const setItemSpy = vi
        .spyOn(window.localStorage, 'setItem')
        .mockImplementation((k: string, v: string) => {
          if (throws > 0) {
            throws--;
            const err = new Error('quota') as Error & { name: string };
            err.name = 'QuotaExceededError';
            throw err;
          }
          realSetItem(k, v);
        });

      saveConversation('newcomer', {
        createdAt: 300,
        lastMessageAt: 300,
        title: 'newcomer',
        messages: [makeUserMessage('newcomer')],
      });

      setItemSpy.mockRestore();
      // The retry path must have evicted the oldest (victim) and
      // succeeded on the second setItem.
      expect(loadConversation('victim')).toBeNull();
      expect(loadConversation('survivor')).not.toBeNull();
      expect(loadConversation('newcomer')).not.toBeNull();
    });

    it('swallows the error if the retry also fails', () => {
      saveConversation('victim', {
        createdAt: 100,
        lastMessageAt: 100,
        title: 'victim',
        messages: [makeUserMessage('victim')],
      });

      const setItemSpy = vi
        .spyOn(window.localStorage, 'setItem')
        .mockImplementation(() => {
          const err = new Error('quota') as Error & { name: string };
          err.name = 'QuotaExceededError';
          throw err;
        });

      // Should not throw.
      expect(() =>
        saveConversation('newcomer', {
          createdAt: 300,
          lastMessageAt: 300,
          title: 'newcomer',
          messages: [makeUserMessage('newcomer')],
        }),
      ).not.toThrow();

      setItemSpy.mockRestore();
    });
  });

  describe('deriveTitle', () => {
    it('uses the first user message text trimmed', () => {
      const messages = [
        makeUserMessage('  How many datasets are in the Commons?  '),
        makeAssistantMessage('There are 12.'),
      ];
      expect(deriveTitle(messages)).toBe('How many datasets are in the Commons?');
    });

    it('truncates to ~80 chars with an ellipsis', () => {
      const long = 'a'.repeat(120);
      const messages = [makeUserMessage(long)];
      const title = deriveTitle(messages);
      expect(title.length).toBeLessThanOrEqual(80);
      expect(title.endsWith('…')).toBe(true);
    });

    it('collapses whitespace runs into single spaces', () => {
      const messages = [makeUserMessage('hello    world\n\nfoo')];
      expect(deriveTitle(messages)).toBe('hello world foo');
    });

    it('falls back to "New conversation" when there are no user messages', () => {
      expect(deriveTitle([])).toBe('New conversation');
      expect(deriveTitle([makeAssistantMessage('only assistant')])).toBe('New conversation');
    });

    it('skips messages with no text parts', () => {
      const odd: UIMessage = {
        id: 'odd',
        role: 'user',
        parts: [{ type: 'tool-foo' } as unknown as UIMessage['parts'][number]],
      } as UIMessage;
      const messages = [odd, makeUserMessage('real text')];
      expect(deriveTitle(messages)).toBe('real text');
    });
  });

  describe('schema version', () => {
    it('writes the current schema version on save', () => {
      saveConversation('versioned', {
        createdAt: 1,
        lastMessageAt: 1,
        title: 't',
        messages: [makeUserMessage('hi')],
      });
      const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}versioned`)!;
      const parsed = JSON.parse(raw);
      expect(parsed._v).toBe(CURRENT_SCHEMA_VERSION);
    });
  });
});

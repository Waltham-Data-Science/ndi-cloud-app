/**
 * conversation-store — localStorage-backed persistence for the
 * experimental /ask chat.
 *
 * Each conversation is keyed by a UUIDv4 (`crypto.randomUUID()`) and
 * stored under `ndi-ask-conversation-<uuid>`. The value is a JSON
 * blob with the AI SDK `UIMessage[]` snapshot plus metadata
 * (title, timestamps, schema version).
 *
 * Why localStorage and not IndexedDB: chat threads are small (tens of
 * KB even for long conversations), and we want synchronous reads on
 * the very first paint so the user doesn't see a flash-of-empty-thread
 * after a refresh. IndexedDB's async API would force a Suspense
 * boundary or a loading spinner.
 *
 * # Schema versioning
 *
 * Stored payloads carry `_v: 1`. Future migrations can branch on
 * `_v` at load time and rewrite the payload in place. If the load
 * sees an unrecognized version it returns `null` (treated as "no
 * stored conversation") rather than throwing — better to start fresh
 * than crash the page.
 *
 * # TTL + LRU eviction
 *
 * `pruneOldConversations()` removes entries older than 30 days. The
 * 30-day window matches typical demo-share expectations — recipients
 * who follow a link within a month see the original thread; later
 * visitors get a fresh chat.
 *
 * `evictLruIfNeeded()` caps total stored conversations at 50. When
 * over cap, it sorts by `lastMessageAt` ascending and drops the
 * oldest until under cap. Cap is a soft ceiling on localStorage usage
 * (50 conversations * ~50KB each ≈ 2.5MB ceiling, well under the
 * 5-10MB localStorage budget browsers grant).
 *
 * # Error handling
 *
 * Every entry point catches synchronously and degrades to a no-op or
 * `null` return so a corrupted localStorage entry can never throw
 * into render. The two failure modes we care about:
 *
 *   - `QuotaExceededError` on `setItem` — we evict the oldest entry
 *     and retry once. If still failing, swallow (the user keeps
 *     chatting; persistence is best-effort).
 *   - SSR (`typeof window === 'undefined'`) — every function early-
 *     returns the empty/null variant. The hook layer only reads
 *     localStorage in `useEffect`, so this is defense-in-depth.
 */

import type { UIMessage } from 'ai';

/** Storage key prefix. Bump this with a migration if the layout ever changes. */
export const STORAGE_KEY_PREFIX = 'ndi-ask-conversation-';

/** Schema version. Bump when the payload shape changes. */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/** Conversations older than this are pruned at next mount. */
export const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Max conversations stored locally. LRU evict beyond this. */
export const MAX_CONVERSATIONS = 50;

/**
 * Wire shape stored in localStorage. Keep this minimal — anything we
 * don't put into the wire shape can't be restored.
 */
export type StoredConversation = {
  _v: typeof CURRENT_SCHEMA_VERSION;
  id: string;
  createdAt: number;
  lastMessageAt: number;
  title: string;
  messages: UIMessage[];
};

/** Listing entry returned by `listConversations()`. */
export type ConversationListEntry = {
  id: string;
  title: string;
  lastMessageAt: number;
  messageCount: number;
};

function storageKey(id: string): string {
  return `${STORAGE_KEY_PREFIX}${id}`;
}

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    // Some privacy-mode browsers throw on `window.localStorage` access.
    return false;
  }
}

/**
 * Derive a short, human-readable title from the first user message.
 * Falls back to "New conversation" when there are no user messages
 * yet (e.g. a thread that contains only a suggested-prompt assistant
 * stub, which shouldn't normally happen).
 */
export function deriveTitle(messages: UIMessage[]): string {
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const parts = m.parts as Array<{ type: string; text?: string }> | undefined;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      if (p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0) {
        const trimmed = p.text.trim().replace(/\s+/g, ' ');
        return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
      }
    }
  }
  return 'New conversation';
}

/**
 * Best-effort load. Returns null if:
 *   - localStorage is unavailable (SSR, privacy mode)
 *   - the key doesn't exist
 *   - the payload is not JSON
 *   - the schema version is unrecognized
 *   - any field is missing or the wrong type
 */
export function loadConversation(id: string): StoredConversation | null {
  if (!hasStorage()) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey(id));
  } catch {
    return null;
  }
  if (raw === null) return null;
  return parseStored(raw, id);
}

function parseStored(raw: string, expectedId: string): StoredConversation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj._v !== CURRENT_SCHEMA_VERSION) return null;
  if (typeof obj.id !== 'string' || obj.id !== expectedId) return null;
  if (typeof obj.createdAt !== 'number' || typeof obj.lastMessageAt !== 'number') return null;
  if (typeof obj.title !== 'string') return null;
  if (!Array.isArray(obj.messages)) return null;
  // Soft-validate message shape: each must be an object with a `role` string
  // and a `parts` array. We don't deep-validate each part — the AI SDK
  // is forgiving on render, and our flattener in ask-shell drops
  // unknown part types silently.
  for (const m of obj.messages as unknown[]) {
    if (typeof m !== 'object' || m === null) return null;
    const mm = m as Record<string, unknown>;
    if (typeof mm.role !== 'string') return null;
    if (!Array.isArray(mm.parts)) return null;
  }
  return obj as unknown as StoredConversation;
}

/**
 * Save a conversation. Handles QuotaExceededError by evicting the
 * oldest entry and retrying once; if that still fails we swallow
 * (best-effort).
 *
 * Caller is responsible for the `id`/`createdAt` invariants — we
 * just persist whatever was passed.
 */
export function saveConversation(id: string, payload: Omit<StoredConversation, '_v' | 'id'>): void {
  if (!hasStorage()) return;
  const stored: StoredConversation = {
    _v: CURRENT_SCHEMA_VERSION,
    id,
    ...payload,
  };
  const serialized = JSON.stringify(stored);
  try {
    window.localStorage.setItem(storageKey(id), serialized);
    return;
  } catch (err) {
    // QuotaExceededError or similar — try to make room.
    if (!isQuotaError(err)) return;
  }

  // Retry path: evict the single oldest entry that isn't this one,
  // then try again. We don't loop — if we still fail, give up.
  const entries = listConversations().filter((e) => e.id !== id);
  if (entries.length === 0) return;
  entries.sort((a, b) => a.lastMessageAt - b.lastMessageAt);
  const oldest = entries[0]!;
  try {
    window.localStorage.removeItem(storageKey(oldest.id));
  } catch {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(id), serialized);
  } catch {
    // Give up. The user can still chat; we just can't persist.
  }
}

function isQuotaError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

/**
 * Walk every `ndi-ask-conversation-*` key and return a lightweight
 * listing. Skips corrupted entries silently. Useful for "New chat"
 * pickers, LRU eviction, and the prune sweep.
 */
export function listConversations(): ConversationListEntry[] {
  if (!hasStorage()) return [];
  const out: ConversationListEntry[] = [];
  let length: number;
  try {
    length = window.localStorage.length;
  } catch {
    return [];
  }
  for (let i = 0; i < length; i++) {
    let key: string | null;
    try {
      key = window.localStorage.key(i);
    } catch {
      continue;
    }
    if (!key || !key.startsWith(STORAGE_KEY_PREFIX)) continue;
    const id = key.slice(STORAGE_KEY_PREFIX.length);
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      continue;
    }
    if (raw === null) continue;
    const parsed = parseStored(raw, id);
    if (!parsed) continue;
    out.push({
      id: parsed.id,
      title: parsed.title,
      lastMessageAt: parsed.lastMessageAt,
      messageCount: parsed.messages.length,
    });
  }
  return out;
}

/** Delete a single conversation. No-op if missing. */
export function deleteConversation(id: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}

/**
 * Remove any conversation whose `lastMessageAt` is older than the
 * TTL. Cheap to run at every mount.
 */
export function pruneOldConversations(now: number = Date.now()): number {
  if (!hasStorage()) return 0;
  const cutoff = now - TTL_MS;
  let removed = 0;
  for (const entry of listConversations()) {
    if (entry.lastMessageAt < cutoff) {
      deleteConversation(entry.id);
      removed++;
    }
  }
  return removed;
}

/**
 * If we're at or above the cap, drop the oldest entries until we're
 * one slot under it. Run after a save so the next save has headroom.
 */
export function evictLruIfNeeded(): number {
  if (!hasStorage()) return 0;
  const entries = listConversations();
  if (entries.length < MAX_CONVERSATIONS) return 0;
  entries.sort((a, b) => a.lastMessageAt - b.lastMessageAt);
  const target = MAX_CONVERSATIONS - 1;
  let removed = 0;
  while (entries.length > target) {
    const victim = entries.shift();
    if (!victim) break;
    deleteConversation(victim.id);
    removed++;
  }
  return removed;
}

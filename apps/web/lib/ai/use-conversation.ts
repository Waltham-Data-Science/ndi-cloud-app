'use client';

/**
 * useConversation — wires URL-hash conversation IDs to the
 * localStorage-backed `conversation-store`.
 *
 * Contract:
 *   - Reads `window.location.hash` on mount (in an effect — SSR-safe).
 *     Looks for `#c=<uuid>` and, if present, attempts to load the
 *     stored thread.
 *   - If there's no hash OR the stored thread is missing/corrupt,
 *     generates a fresh UUID via `crypto.randomUUID()`. The URL is
 *     NOT updated yet — we only write the hash once the user actually
 *     sends a message, so a no-op visit to `/ask` doesn't pollute
 *     the URL.
 *   - Exposes `setMessages` which the caller invokes whenever the
 *     thread state changes (typically from the AI SDK's `useChat`
 *     hook). We debounce the persist write 300ms to coalesce the
 *     stream-of-tokens that arrives during a streaming response.
 *   - On the first non-empty `setMessages` call, the URL hash is
 *     rewritten via `history.replaceState` so a refresh restores
 *     this conversation. We use `replaceState` (not `pushState`) so
 *     the browser back button isn't spammed.
 *
 * `startNewConversation()` clears the URL hash and resets the local
 * state to a new UUID. The caller is responsible for clearing the AI
 * SDK's `messages` (typically via its `setMessages([])`).
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { UIMessage } from 'ai';

import {
  deriveTitle,
  evictLruIfNeeded,
  loadConversation,
  pruneOldConversations,
  saveConversation,
} from './conversation-store';

/** localStorage debounce window during streaming. */
const PERSIST_DEBOUNCE_MS = 300;

/**
 * Returned shape:
 *   - `conversationId`: stable identifier for the current chat
 *   - `initialMessages`: messages restored from localStorage on mount,
 *     or `[]` if there's no stored thread. Pass this to `useChat({
 *     messages })`. Stable across renders — only changes on
 *     `startNewConversation()`.
 *   - `isNew`: true until the user has sent at least one message in
 *     this session. Useful for "do you want to start over?" prompts.
 *   - `persist(messages)`: caller invokes whenever the AI SDK's
 *     `messages` array changes. We debounce + write to localStorage.
 *   - `startNewConversation()`: mints a fresh UUID, clears the URL
 *     hash, resets `isNew` to true. Caller is responsible for
 *     clearing their thread state.
 *   - `shareUrl`: a fully-qualified URL with the current conversation
 *     in the hash (e.g. `https://ndi-cloud.com/ask#c=abc-...`). Null
 *     before the first message is sent (no point sharing an empty
 *     thread).
 */
export type UseConversationResult = {
  conversationId: string;
  initialMessages: UIMessage[];
  isNew: boolean;
  persist: (messages: UIMessage[]) => void;
  startNewConversation: () => void;
  shareUrl: string | null;
};

function parseConversationIdFromHash(hash: string): string | null {
  if (!hash) return null;
  // Hash always begins with '#'. Look for `c=` either at the front or
  // after a leading `&` (we don't currently use other params, but be
  // defensive).
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = cleaned.split('&');
  for (const p of params) {
    const [k, v] = p.split('=');
    if (k === 'c' && v && /^[0-9a-fA-F-]{8,}$/.test(v)) {
      return v;
    }
  }
  return null;
}

function generateUuid(): string {
  // crypto.randomUUID is available in modern browsers and Node 19+.
  // The jsdom test environment exposes it via `window.crypto`.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: extremely unlikely path. RFC 4122 v4 from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function writeHash(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.hash = `c=${id}`;
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // ignore — history.replaceState should never throw in practice
  }
}

function clearHash(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // ignore
  }
}

function buildShareUrl(id: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    url.hash = `c=${id}`;
    return url.toString();
  } catch {
    return null;
  }
}

type ReducerState = {
  id: string;
  initialMessages: UIMessage[];
  isNew: boolean;
  shareUrl: string | null;
  mounted: boolean;
};

type Action =
  | {
      type: 'hydrate';
      id: string;
      initialMessages: UIMessage[];
      isNew: boolean;
      shareUrl: string | null;
    }
  | { type: 'mark-shared'; shareUrl: string | null }
  | {
      type: 'reset';
      id: string;
    };

const initialReducerState: ReducerState = {
  id: '',
  initialMessages: [],
  isNew: true,
  shareUrl: null,
  mounted: false,
};

function reducer(state: ReducerState, action: Action): ReducerState {
  switch (action.type) {
    case 'hydrate':
      return {
        id: action.id,
        initialMessages: action.initialMessages,
        isNew: action.isNew,
        shareUrl: action.shareUrl,
        mounted: true,
      };
    case 'mark-shared':
      return { ...state, shareUrl: action.shareUrl, isNew: false };
    case 'reset':
      return {
        id: action.id,
        initialMessages: [],
        isNew: true,
        shareUrl: null,
        mounted: true,
      };
    default:
      return state;
  }
}

export function useConversation(): UseConversationResult {
  // useReducer keeps the dispatch-in-effect pattern lint-clean while
  // letting us defer all `window.*` reads to the mount effect (SSR-
  // safe). The initial render returns the placeholder state with
  // `id: ''` — consumers gate on `conversationId` truthiness.
  const [state, dispatch] = useReducer(reducer, initialReducerState);

  // Track whether we've written the URL hash for this conversation
  // yet. We only write it on the first non-empty persist.
  const hashWrittenRef = useRef(false);

  // Debounce timer for persist writes.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The latest messages snapshot the caller asked us to persist. We
  // re-read this inside the debounced flush so coalesced writes pick
  // up the freshest state.
  const pendingMessagesRef = useRef<UIMessage[] | null>(null);

  // Latest id, exposed via a ref so the unmount-flush cleanup
  // doesn't need to take a dep on `state.id`. The ref is synced
  // in an effect (refs cannot be written during render).
  const idRef = useRef('');
  useEffect(() => {
    idRef.current = state.id;
  }, [state.id]);

  // Capture state.id in scope for `persist` so the persist callback
  // sees the current id at call time even before the idRef sync
  // effect has run. We accept that `persist`'s identity changes when
  // `state.id` changes — the parent's `useEffect` listening to
  // `persist` will fire once on id changeover, which is correct.

  // Mount effect: read URL hash, restore from localStorage or mint
  // a fresh id, and prune+evict TTL/LRU entries.
  useEffect(() => {
    pruneOldConversations();
    evictLruIfNeeded();

    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const fromHash = parseConversationIdFromHash(hash);

    if (fromHash) {
      const stored = loadConversation(fromHash);
      if (stored) {
        hashWrittenRef.current = true;
        dispatch({
          type: 'hydrate',
          id: fromHash,
          initialMessages: stored.messages,
          isNew: false,
          shareUrl: buildShareUrl(fromHash),
        });
        return;
      }
      // Hash referenced a missing/corrupt conversation. Keep the id
      // in the URL so a "share link" that arrives before the linked
      // session is created still resolves — but treat it as new.
      hashWrittenRef.current = true;
      dispatch({
        type: 'hydrate',
        id: fromHash,
        initialMessages: [],
        isNew: true,
        shareUrl: buildShareUrl(fromHash),
      });
      return;
    }

    // Fresh visit: mint a new id but don't write the hash yet. The
    // hash gets written on the first persist with a non-empty
    // messages array.
    dispatch({
      type: 'hydrate',
      id: generateUuid(),
      initialMessages: [],
      isNew: true,
      shareUrl: null,
    });
  }, []);

  // Flush pending writes on unmount so a quick page-close after a
  // message doesn't lose the conversation.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const pending = pendingMessagesRef.current;
      const id = idRef.current;
      if (pending && pending.length > 0 && id) {
        flushPersist(id, pending);
      }
    };
  }, []);

  const currentId = state.id;
  const persist = useCallback(
    (messages: UIMessage[]) => {
      pendingMessagesRef.current = messages;
      // First non-empty persist also seeds the URL hash so a refresh
      // restores this conversation.
      if (!hashWrittenRef.current && messages.length > 0 && currentId) {
        writeHash(currentId);
        hashWrittenRef.current = true;
        dispatch({ type: 'mark-shared', shareUrl: buildShareUrl(currentId) });
      }
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        const latest = pendingMessagesRef.current;
        if (!latest || !currentId) return;
        flushPersist(currentId, latest);
      }, PERSIST_DEBOUNCE_MS);
    },
    [currentId],
  );

  const startNewConversation = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingMessagesRef.current = null;
    hashWrittenRef.current = false;
    clearHash();
    dispatch({ type: 'reset', id: generateUuid() });
  }, []);

  return {
    conversationId: state.id,
    initialMessages: state.initialMessages,
    isNew: state.isNew,
    persist,
    startNewConversation,
    shareUrl: state.shareUrl,
  };
}

function flushPersist(id: string, messages: UIMessage[]): void {
  // Strip trailing in-flight state before serializing. Without this,
  // a refresh during streaming restores a half-message containing
  // tool parts whose `state !== 'output-available'`. The UI flattener
  // then surfaces them as "using <tool>…" indicators that never
  // resolve (P0-C, 2026-05-14). Normalizing to a terminal state means
  // a refreshed page either shows a CLEAN stopping point or the
  // last fully-completed assistant turn.
  const normalized = normalizeForPersist(messages);
  if (normalized.length === 0) {
    // Don't persist empty threads — they create stale "New conversation"
    // entries that take up an LRU slot.
    return;
  }
  const now = Date.now();
  // Fetch existing `createdAt` so we don't reset it on each save.
  const existing = loadConversation(id);
  saveConversation(id, {
    createdAt: existing?.createdAt ?? now,
    lastMessageAt: now,
    title: deriveTitle(normalized),
    messages: normalized,
  });
  evictLruIfNeeded();
}

/**
 * Drop the trailing assistant message if any of its tool parts are
 * still in a pre-terminal state (`input-streaming`, `input-available`,
 * or anything that's not `output-available` / `output-error`). The
 * AI SDK marks completed tool calls with `state: 'output-available'`
 * (and failed ones with `'output-error'`); anything else means the
 * stream got cut off — typically a page refresh, tab close, Vercel
 * `maxDuration` cutoff, or the user hitting "Stop." Saving such a
 * message would resurrect it on next load as a perpetual fake
 * "spinner."
 *
 * Behaviour:
 *   - Trailing message is user-role → keep everything (we still want
 *     to remember what the user asked).
 *   - Trailing message is assistant-role with at least one tool part
 *     in pre-terminal state → drop just that assistant message; the
 *     rest of the thread (and the user's question) is intact.
 *   - Trailing message has no tool parts or all terminal → keep.
 *
 * Why drop the WHOLE message rather than just the in-flight parts:
 * the model's text often arrives interleaved with tool parts, and
 * partial text from a cut-off turn is rarely useful. The cleanest UX
 * is "the assistant didn't get to answer — re-ask if you still
 * need it." The user's message survives, so the question is still
 * visible.
 */
function normalizeForPersist(messages: UIMessage[]): UIMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return messages;
  const parts = (last.parts ?? []) as Array<{ type: string; state?: string }>;
  const hasInFlightTool = parts.some(
    (p) =>
      typeof p.type === 'string' &&
      p.type.startsWith('tool-') &&
      p.state !== 'output-available' &&
      p.state !== 'output-error',
  );
  if (hasInFlightTool) {
    return messages.slice(0, -1);
  }
  return messages;
}

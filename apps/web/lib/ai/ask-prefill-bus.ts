'use client';

/**
 * ask-prefill-bus — tiny pubsub channel for "send this question to
 * the AskPanel" gestures from elsewhere in the workspace.
 *
 * Phase G use-case: the `WorkspaceDataGrid` bulk-actions bar offers
 * an "Ask Claude about these 3 subjects" button. Clicking it needs
 * to (a) open AskPanel if it's closed, (b) pre-fill the chat input
 * with a question that already includes the selected ids, and (c)
 * send the message immediately.
 *
 * The chain crosses three components that don't have direct refs to
 * each other (the bulk-actions button is inside a deeply-nested
 * picker; AskPanel is in the workspace layout; AskShell is inside
 * AskPanel). Rather than threading props or context through every
 * layer, this module exposes a small singleton pubsub:
 *
 *   - `emitAskPrefill({ text, autoSend })` — anyone calls
 *   - `subscribeToAskPrefill(handler)` — AskPanel listens
 *
 * Events are NOT buffered. If no listener is attached at emit time
 * (e.g. user hits the bulk action outside a workspace), the event
 * is silently dropped. Phase F mounts AskPanel only inside
 * `/my/workspace/[id]`, so this matches the only contexts where the
 * bus is exercised.
 *
 * Why not a `window` CustomEvent — works too, but module-level
 * subscribers play nicer with React 19's strict-mode double-mount
 * (the subscribe in the effect's setup + cleanup pair stays scoped
 * to the live mount) and tests don't need to attach to `window`.
 */

export interface AskPrefillPayload {
  /** The text to drop into the chat input. */
  text: string;
  /**
   * If true, the message is sent immediately on receipt. If false,
   * the panel opens and the text is staged in the input for the
   * user to review + send themselves.
   */
  autoSend?: boolean;
}

type Listener = (payload: AskPrefillPayload) => void;

const listeners = new Set<Listener>();

/**
 * Subscribe to prefill events. Returns an unsubscribe function for
 * use as a useEffect cleanup. Multiple subscribers are supported
 * (each receives every event), but in practice only AskPanel
 * subscribes.
 */
export function subscribeToAskPrefill(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Emit a prefill request. Synchronously fans out to all current
 * subscribers. If nobody is listening, the call is a no-op.
 */
export function emitAskPrefill(payload: AskPrefillPayload): void {
  // Snapshot the listener set so a handler that subscribes/unsubscribes
  // mid-fan-out doesn't mutate iteration.
  const snapshot = Array.from(listeners);
  for (const listener of snapshot) {
    try {
      listener(payload);
    } catch {
      // A misbehaving listener shouldn't prevent the rest from firing.
      // No-op on individual handler errors.
    }
  }
}

/**
 * Test helper — clears all subscribers. Useful between tests so a
 * stale handler from a previous test doesn't fire on a fresh emit.
 */
export function __resetAskPrefillBusForTests(): void {
  listeners.clear();
}

/**
 * Build a default prefill prompt for the workspace data-grid's
 * bulk "Ask Claude about these N {noun}s" action. Consumed by
 * every picker.
 *
 * The prompt is intentionally generic — it surfaces the ids and
 * the noun so the model can dispatch to whichever tools are
 * relevant ("here are 5 subject ids — what do they have in
 * common?" / "here are 3 session ids — fetch their signal traces").
 *
 * Truncates at MAX_IDS_INLINE to keep the prompt short on big
 * selections; over the limit, the prompt mentions the total count
 * and lists the first N. The user can always edit the prompt
 * before sending (autoSend should be false at the call site).
 */
const MAX_IDS_INLINE = 20;

export function buildPrefillPrompt(noun: string, ids: ReadonlyArray<string>): string {
  const total = ids.length;
  const head = ids.slice(0, MAX_IDS_INLINE);
  const truncated = total > MAX_IDS_INLINE;
  const list = head.map((id) => `  - ${id}`).join('\n');
  const trailer = truncated
    ? `\n  (… and ${total - MAX_IDS_INLINE} more)`
    : '';
  const pluralized = total === 1 ? noun : `${noun}s`;
  return [
    `Tell me about these ${total} ${pluralized} in this dataset:`,
    '',
    list + trailer,
    '',
    // Tool hints use REAL NDI SDK function names parallel to the
    // chat's tool nicknames — so a user who picks the prompt up in a
    // CLI session sees the same vocabulary. Earlier carryability fix
    // (2026-05-17 review §B3) emitted invented names — `ndi.query.find`,
    // `ndi.query.dependencies`, `ndi.cloud.api.files.read_signal` — none
    // of which exist in NDI-python or NDI-matlab. Audit 2026-05-18
    // finding A9 caught that and replaced them with names that DO
    // exist in both SDKs.
    'Use ndi.cloud.api.documents.ndiquery / ndi.cloud.api.documents.bulkFetch / ndi.cloud.api.files.getFile as appropriate. Walk depends_on chains manually by following each doc.depends_on entry.',
  ].join('\n');
}

/**
 * ask-prefill-bus — module-level pubsub for "send this question to
 * AskPanel" gestures.
 *
 * Phase G tests:
 *   - subscribe + emit + unsubscribe lifecycle
 *   - multiple subscribers each receive every emit
 *   - emitting with no subscribers is a no-op (silent drop)
 *   - a misbehaving subscriber doesn't break the fan-out to others
 *   - __resetAskPrefillBusForTests clears subscribers
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetAskPrefillBusForTests,
  emitAskPrefill,
  subscribeToAskPrefill,
} from '@/lib/ai/ask-prefill-bus';

afterEach(() => {
  __resetAskPrefillBusForTests();
});

describe('ask-prefill-bus — basic pubsub', () => {
  it('subscriber receives an emitted payload', () => {
    const listener = vi.fn();
    subscribeToAskPrefill(listener);
    emitAskPrefill({ text: 'hi', autoSend: true });
    expect(listener).toHaveBeenCalledWith({ text: 'hi', autoSend: true });
  });

  it('returns an unsubscribe function that prevents future events', () => {
    const listener = vi.fn();
    const unsub = subscribeToAskPrefill(listener);
    unsub();
    emitAskPrefill({ text: 'gone' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ask-prefill-bus — fan-out', () => {
  it('every subscriber receives every emit', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    subscribeToAskPrefill(a);
    subscribeToAskPrefill(b);
    subscribeToAskPrefill(c);
    emitAskPrefill({ text: 'fan-out' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('a throwing subscriber does NOT prevent siblings from firing', () => {
    const a = vi.fn(() => {
      throw new Error('rogue listener');
    });
    const b = vi.fn();
    subscribeToAskPrefill(a);
    subscribeToAskPrefill(b);
    expect(() => emitAskPrefill({ text: 'still works' })).not.toThrow();
    expect(b).toHaveBeenCalled();
  });
});

describe('ask-prefill-bus — empty subscribers', () => {
  it('emit with no subscribers is a no-op (does not throw)', () => {
    expect(() => emitAskPrefill({ text: 'nobody home' })).not.toThrow();
  });
});

describe('ask-prefill-bus — concurrent subscribe during fan-out', () => {
  it('subscribing during emit does NOT receive the in-flight payload', () => {
    const late = vi.fn();
    const early = vi.fn(() => {
      // Subscribe a new listener mid-fan-out.
      subscribeToAskPrefill(late);
    });
    subscribeToAskPrefill(early);
    emitAskPrefill({ text: 'first' });
    expect(early).toHaveBeenCalledTimes(1);
    // `late` subscribed AFTER the snapshot was taken — should NOT
    // have fired for this emit.
    expect(late).not.toHaveBeenCalled();

    // But the next emit reaches both.
    emitAskPrefill({ text: 'second' });
    expect(late).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(2);
  });
});

describe('ask-prefill-bus — reset helper', () => {
  it('__resetAskPrefillBusForTests clears all subscribers', () => {
    const a = vi.fn();
    subscribeToAskPrefill(a);
    __resetAskPrefillBusForTests();
    emitAskPrefill({ text: 'noop' });
    expect(a).not.toHaveBeenCalled();
  });
});

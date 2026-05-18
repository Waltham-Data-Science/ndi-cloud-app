/**
 * feature-flag.ts — gates the experimental /ask chat behind two
 * independent env signals so the demo can be deployed without
 * surfacing it in nav (or vice versa).
 */
import { describe, expect, it } from 'vitest';
import { askEnabled, askNavVisible } from '@/lib/ai/feature-flag';

describe('lib/ai/feature-flag', () => {
  describe('askEnabled', () => {
    it('returns false when ANTHROPIC_API_KEY is undefined', () => {
      expect(askEnabled({})).toBe(false);
    });

    it('returns false when ANTHROPIC_API_KEY is empty string', () => {
      expect(askEnabled({ ANTHROPIC_API_KEY: '' })).toBe(false);
    });

    it('returns true when ANTHROPIC_API_KEY is set', () => {
      expect(askEnabled({ ANTHROPIC_API_KEY: 'sk-ant-fake-key-1234567890' })).toBe(true);
    });
  });

  describe('askNavVisible', () => {
    it('returns false when NEXT_PUBLIC_ASK_ENABLED is undefined', () => {
      expect(askNavVisible({})).toBe(false);
    });

    it('returns false when NEXT_PUBLIC_ASK_ENABLED is "0"', () => {
      expect(askNavVisible({ NEXT_PUBLIC_ASK_ENABLED: '0' })).toBe(false);
    });

    it('returns true when NEXT_PUBLIC_ASK_ENABLED is "1"', () => {
      expect(askNavVisible({ NEXT_PUBLIC_ASK_ENABLED: '1' })).toBe(true);
    });
  });
});

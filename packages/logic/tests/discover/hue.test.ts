import { describe, expect, it } from 'vitest';
import { hueFromSeed } from '../../src/discover/hue';

describe('hueFromSeed()', () => {
  it('returns a number in [0, 359]', () => {
    for (const seed of ['manga', 'light_novel', 'abc', '9781974725038', '']) {
      const hue = hueFromSeed(seed);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
    }
  });

  it('is deterministic — same seed gives same hue', () => {
    expect(hueFromSeed('Chainsaw Man')).toBe(hueFromSeed('Chainsaw Man'));
    expect(hueFromSeed('9781974725038')).toBe(hueFromSeed('9781974725038'));
  });

  it('different seeds produce different hues (collision is possible but unlikely for common inputs)', () => {
    const seeds = ['manga', 'comic', 'ebook', 'audiobook', 'light_novel'];
    const hues = seeds.map(hueFromSeed);
    const unique = new Set(hues);
    // All 5 should be distinct
    expect(unique.size).toBe(5);
  });

  it('handles empty string without throwing', () => {
    expect(() => hueFromSeed('')).not.toThrow();
    expect(hueFromSeed('')).toBe(0);
  });
});

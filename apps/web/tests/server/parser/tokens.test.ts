import { describe, expect, it } from 'vitest';
import {
  normalize,
  tokenize,
  tokenSet,
  hasAllTokens,
  KNOWN_QUALIFIERS,
  tokensExcludingQualifiers,
} from '@/server/parser/tokens';

describe('parser/tokens', () => {
  describe('normalize', () => {
    it('lowercases and strips diacritics', () => {
      expect(normalize('Bokurano: Ours')).toBe('bokurano: ours');
      expect(normalize('Berseрk')).toMatch(/^bers/); // cyrillic 'р' lowercased
      expect(normalize('Café')).toBe('cafe');
      expect(normalize('Naïve')).toBe('naive');
    });
  });

  describe('tokenize', () => {
    it('splits on whitespace and strips punctuation', () => {
      expect(tokenize('Chainsaw Man: Vol. 1')).toEqual(['chainsaw', 'man', 'vol', '1']);
    });
    it('drops stop-words', () => {
      expect(tokenize('Tower of God')).toEqual(['tower', 'god']);
      expect(tokenize('The Promised Neverland')).toEqual(['promised', 'neverland']);
      expect(tokenize('Berserk of Gluttony')).toEqual(['berserk', 'gluttony']);
    });
    it('keeps digit tokens', () => {
      expect(tokenize('20th Century Boys')).toEqual(['20th', 'century', 'boys']);
    });
    it('handles empty input', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
    });
  });

  describe('tokenSet', () => {
    it('dedupes', () => {
      const s = tokenSet('one one two three three three');
      expect(s).toEqual(new Set(['one', 'two', 'three']));
    });
  });

  describe('hasAllTokens', () => {
    it('returns true when every needle token is in the haystack set', () => {
      const haystack = tokenSet('Berserk of Gluttony Volume 1');
      expect(hasAllTokens(['berserk'], haystack)).toBe(true);
      expect(hasAllTokens(['berserk', 'gluttony'], haystack)).toBe(true);
    });
    it('returns false when any needle token is missing', () => {
      const haystack = tokenSet('Berserk Volume 1');
      expect(hasAllTokens(['berserk', 'gluttony'], haystack)).toBe(false);
    });
    it('empty needles returns false (do not match every series for everything)', () => {
      expect(hasAllTokens([], tokenSet('anything'))).toBe(false);
    });
  });
});

describe('KNOWN_QUALIFIERS', () => {
  it('contains expected manga/comic qualifiers', () => {
    for (const q of ['deluxe', 'edition', 'omnibus', 'kanzenban', 'complete', 'hardcover']) {
      expect(KNOWN_QUALIFIERS.has(q)).toBe(true);
    }
  });
});

describe('tokensExcludingQualifiers', () => {
  it('returns tokens unchanged when none are qualifiers', () => {
    expect(tokensExcludingQualifiers(['berserk'])).toEqual(['berserk']);
    expect(tokensExcludingQualifiers(['chainsaw', 'man'])).toEqual(['chainsaw', 'man']);
  });

  it('strips a single qualifier', () => {
    expect(tokensExcludingQualifiers(['berserk', 'deluxe'])).toEqual(['berserk']);
  });

  it('strips multiple qualifiers', () => {
    expect(tokensExcludingQualifiers(['berserk', 'deluxe', 'edition'])).toEqual(['berserk']);
  });

  it('handles empty input', () => {
    expect(tokensExcludingQualifiers([])).toEqual([]);
  });

  it('returns empty when input is all qualifiers', () => {
    expect(tokensExcludingQualifiers(['deluxe', 'edition'])).toEqual([]);
  });

  it('preserves order of non-qualifier tokens', () => {
    expect(tokensExcludingQualifiers(['the', 'berserk', 'deluxe', 'one'])).toEqual([
      'the',
      'berserk',
      'one',
    ]);
  });
});

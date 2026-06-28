import { describe, expect, it } from 'vitest';
import { applyFormatter, isKnownToken } from '@/server/naming/tokens';

describe('applyFormatter', () => {
  it(':00 zero-pads numbers', () => {
    expect(applyFormatter('5', '00')).toBe('05');
    expect(applyFormatter('14', '00')).toBe('14');
    expect(applyFormatter('114', '00')).toBe('114');
  });
  it(':000 zero-pads to 3', () => {
    expect(applyFormatter('5', '000')).toBe('005');
    expect(applyFormatter('42', '000')).toBe('042');
  });
  it(':lower / :upper', () => {
    expect(applyFormatter('ABC', 'lower')).toBe('abc');
    expect(applyFormatter('abc', 'upper')).toBe('ABC');
  });
  it(':dotted replaces spaces with dots', () => {
    expect(applyFormatter('Chainsaw Man', 'dotted')).toBe('Chainsaw.Man');
  });
  it(':sane strips path-illegal characters', () => {
    expect(applyFormatter('Foo<bar>:baz/qux|quux?yo*', 'sane')).toBe('Foo bar baz qux quux yo');
    expect(applyFormatter('weird ctrl', 'sane')).toBe('weird ctrl');
    expect(applyFormatter('trailing.dot.', 'sane')).toBe('trailing.dot');
    expect(applyFormatter('trailing space ', 'sane')).toBe('trailing space');
  });
  it('unknown formatter returns identity', () => {
    expect(applyFormatter('whatever', 'hex')).toBe('whatever');
  });
  it(':00 on non-numeric returns identity', () => {
    expect(applyFormatter('not-a-num', '00')).toBe('not-a-num');
  });
});

describe('KNOWN_TOKENS', () => {
  it('contains the full Phase 1 vocabulary', () => {
    const expected = [
      'series_title',
      'series_title_english',
      'series_title_romaji',
      'series_title_native',
      'series_year',
      'anilist_id',
      'volume',
      'chapter',
      'chapter_range',
      'group',
      'language',
      'ext',
    ];
    for (const t of expected) expect(isKnownToken(t)).toBe(true);
    expect(isKnownToken('not_a_token')).toBe(false);
  });

  it('contains publisher (M10)', () => {
    expect(isKnownToken('publisher')).toBe(true);
  });

  it('contains author (M11)', () => {
    expect(isKnownToken('author')).toBe(true);
  });
});

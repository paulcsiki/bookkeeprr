import { describe, expect, it } from 'vitest';
import { CONTENT_TYPES, isContentType, assertContentType } from '@/server/content-type';

describe('CONTENT_TYPES', () => {
  it('contains all 5 Phase 2 types', () => {
    expect(CONTENT_TYPES).toEqual(['manga', 'comic', 'light_novel', 'ebook', 'audiobook']);
  });
});

describe('isContentType', () => {
  it('accepts valid types', () => {
    expect(isContentType('manga')).toBe(true);
    expect(isContentType('ebook')).toBe(true);
    expect(isContentType('audiobook')).toBe(true);
  });
  it('rejects invalid', () => {
    expect(isContentType('Manga')).toBe(false);
    expect(isContentType('novel')).toBe(false);
    expect(isContentType('')).toBe(false);
    expect(isContentType(42)).toBe(false);
    expect(isContentType(null)).toBe(false);
    expect(isContentType(undefined)).toBe(false);
  });
});

describe('assertContentType', () => {
  it('passes for valid', () => {
    expect(() => assertContentType('comic')).not.toThrow();
  });
  it('throws for invalid', () => {
    expect(() => assertContentType('bogus')).toThrow(/invalid content type/);
  });
});

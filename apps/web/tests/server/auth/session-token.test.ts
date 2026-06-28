import { describe, expect, it } from 'vitest';
import { generateSessionToken, compareTokens } from '@/server/auth/session-token';

describe('generateSessionToken', () => {
  it('returns a 43-character base64url string', () => {
    const t = generateSessionToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBe(43);
  });

  it('returns distinct values across calls', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe('compareTokens', () => {
  it('returns true for equal strings', () => {
    expect(compareTokens('abc123', 'abc123')).toBe(true);
  });

  it('returns false for unequal strings of same length', () => {
    expect(compareTokens('abc123', 'xyz789')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(compareTokens('abc', 'abcd')).toBe(false);
  });
});

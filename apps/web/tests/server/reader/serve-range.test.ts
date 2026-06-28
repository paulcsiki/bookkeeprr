import { describe, it, expect } from 'vitest';
import { parseRange } from '@/server/reader/serve-range';

describe('parseRange', () => {
  it('parses bytes=0-9', () => expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 }));
  it('parses open-ended bytes=50-', () =>
    expect(parseRange('bytes=50-', 100)).toEqual({ start: 50, end: 99 }));
  it('parses suffix bytes=-10', () =>
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 }));
  it('returns null for no header', () => expect(parseRange(null, 100)).toBeNull());
  it('flags unsatisfiable', () => expect(parseRange('bytes=200-300', 100)).toBe('unsatisfiable'));
});

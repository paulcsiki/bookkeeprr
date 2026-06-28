import { describe, it, expect } from 'vitest';
import { shallowDiff } from '@/server/audit/diff';

describe('shallowDiff', () => {
  it('returns [] for identical objects', () => {
    expect(shallowDiff({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([]);
  });

  it('returns [key] for a scalar change', () => {
    expect(shallowDiff({ a: 1, b: 'x' }, { a: 2, b: 'x' })).toEqual(['a']);
  });

  it('returns [newKey] for an added key', () => {
    expect(shallowDiff({ a: 1 }, { a: 1, newKey: 'val' })).toEqual(['newKey']);
  });

  it('returns [removedKey] for a removed key', () => {
    expect(shallowDiff({ a: 1, removedKey: 'val' }, { a: 1 })).toEqual(['removedKey']);
  });

  it('returns multiple changes as a sorted array', () => {
    expect(shallowDiff({ z: 1, a: 1, m: 1, b: 1 }, { z: 2, a: 1, m: 9, b: 'new' })).toEqual([
      'b',
      'm',
      'z',
    ]);
  });

  it('treats arrays with the same values as equal', () => {
    expect(shallowDiff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual([]);
  });

  it('treats arrays with different values as changed', () => {
    expect(shallowDiff({ tags: ['a', 'b'] }, { tags: ['a', 'c'] })).toEqual(['tags']);
  });

  it('compares nested objects by deep equality', () => {
    expect(
      shallowDiff({ nested: { x: 1, y: [1, 2, 3] } }, { nested: { x: 1, y: [1, 2, 3] } }),
    ).toEqual([]);
    expect(
      shallowDiff({ nested: { x: 1, y: [1, 2, 3] } }, { nested: { x: 1, y: [1, 2, 4] } }),
    ).toEqual(['nested']);
  });
});

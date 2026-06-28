import { describe, it, expect } from 'vitest';
import { tapAction, nextIndex, prevIndex, pagePair } from '@/components/reader/lib/comics-nav';

describe('comics-nav', () => {
  it('tap zones respect direction', () => {
    // rel = x fraction across width. middle = toggle chrome.
    expect(tapAction(0.5, true)).toBe('toggle');
    // LTR: right edge = forward, left edge = back
    expect(tapAction(0.9, false)).toBe('forward'); // ltr right -> forward
    expect(tapAction(0.1, false)).toBe('back'); // ltr left -> back
    // RTL: right edge = back, left edge = forward
    expect(tapAction(0.9, true)).toBe('back');
    expect(tapAction(0.1, true)).toBe('forward');
  });

  it('center dead-zone toggles regardless of direction', () => {
    expect(tapAction(0.33, false)).toBe('toggle');
    expect(tapAction(0.67, false)).toBe('toggle');
    expect(tapAction(0.5, false)).toBe('toggle');
    expect(tapAction(0.4, true)).toBe('toggle');
  });

  it('paging steps by 1 (single) and 2 (spread), clamped', () => {
    expect(nextIndex(0, 14, 1)).toBe(1);
    expect(nextIndex(13, 14, 1)).toBe(13);
    expect(nextIndex(0, 14, 2)).toBe(2);
    expect(nextIndex(13, 14, 2)).toBe(13);
    expect(prevIndex(0, 14, 1)).toBe(0);
    expect(prevIndex(5, 14, 2)).toBe(3);
    expect(prevIndex(1, 14, 2)).toBe(0);
  });

  it('pagePair orders by direction', () => {
    expect(pagePair(2, true)).toEqual([3, 2]); // rtl: right page first
    expect(pagePair(2, false)).toEqual([2, 3]); // ltr
  });
});

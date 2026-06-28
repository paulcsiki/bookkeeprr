import { describe, it, expect } from 'vitest';
import {
  pageToPosition,
  positionToPage,
  audioPosition,
  audioSec,
  spineToPosition,
  epubColumnPageCount,
} from '@/components/reader/lib/position';

describe('position mapping', () => {
  it('comics/pdf page<->position round-trips', () => {
    expect(positionToPage(pageToPosition(5, 14), 14)).toBe(5);
    expect(pageToPosition(0, 1)).toBe(0);
    expect(positionToPage(1, 10)).toBe(9);
  });

  it('audio sec<->position', () => {
    expect(audioPosition(60, 600)).toBeCloseTo(0.1);
    expect(audioSec(0.1, 600)).toBeCloseTo(60);
    expect(audioPosition(10, 0)).toBe(0); // guard divide-by-zero
  });

  it('epub spine position is monotonic across items', () => {
    const a = spineToPosition(0, 1, 4, 3); // item 0, page 1 of 4, 3 spine items
    const b = spineToPosition(1, 0, 4, 3);
    expect(b).toBeGreaterThan(a);
    expect(spineToPosition(0, 0, 4, 3)).toBe(0);
  });

  it('clamps to [0,1] and valid ranges', () => {
    expect(pageToPosition(-5, 10)).toBe(0);
    expect(pageToPosition(100, 10)).toBeLessThanOrEqual(1);
    expect(positionToPage(-1, 10)).toBe(0);
    expect(positionToPage(5, 10)).toBe(9);
    expect(audioPosition(1000, 600)).toBe(1);
    expect(audioPosition(-10, 600)).toBe(0);
    expect(spineToPosition(0, 0, 4, 0)).toBe(0);
  });
});

describe('epubColumnPageCount', () => {
  const COL = 800;
  const GAP = 56;
  const PAD = 48; // body padding: 0 24px → 48 total

  // scrollWidth the browser reports for `cols` columns inside the padded box.
  const sw = (cols: number) => cols * COL + (cols - 1) * GAP + PAD;

  it('counts exactly one column-page per real column (no phantom trailing page)', () => {
    // This is the regression: the old ceil((scrollWidth + GAP)/step) formula
    // over-counted every item by one, so the keyboard could step onto a blank
    // trailing column that the slider (always page 0 of an item) never hit.
    for (const cols of [1, 2, 3, 4, 5, 10, 23]) {
      expect(epubColumnPageCount(sw(cols), COL, GAP, PAD)).toBe(cols);
    }
  });

  it('keyboard cannot advance past the last real page', () => {
    // With N real pages the last valid index is N-1 (goNext clamps to count-1).
    const cols = 7;
    const count = epubColumnPageCount(sw(cols), COL, GAP, PAD);
    expect(count - 1).toBe(cols - 1); // last reachable page is real
  });

  it('tolerates sub-pixel scrollWidth and guards bad geometry', () => {
    expect(epubColumnPageCount(sw(3) + 0.4, COL, GAP, PAD)).toBe(3);
    expect(epubColumnPageCount(sw(3) - 0.4, COL, GAP, PAD)).toBe(3);
    expect(epubColumnPageCount(0, COL, GAP, PAD)).toBe(1);
    expect(epubColumnPageCount(sw(3), 0, GAP, PAD)).toBe(1); // colWidth 0 guard
  });
});

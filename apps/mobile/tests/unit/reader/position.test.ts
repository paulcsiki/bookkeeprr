import {
  pageToPosition,
  positionToPage,
  audioPosition,
  audioSec,
  spineToPosition,
} from '@/features/reader/lib/position';

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

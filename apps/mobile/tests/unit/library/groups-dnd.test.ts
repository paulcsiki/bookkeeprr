import {
  registerFrame,
  hitTest,
  hitTestList,
  decodeDropTarget,
  shouldMove,
  type DropFrame,
} from '@/features/library/groups/dnd';

const frame = (id: string, x: number, y: number, w = 100, h = 150): DropFrame => ({
  id,
  x,
  y,
  w,
  h,
});

describe('registerFrame', () => {
  it('adds a frame keyed by id', () => {
    const frames = new Map<string, DropFrame>();
    registerFrame(frames, frame('group-1', 0, 0));
    expect(frames.get('group-1')).toEqual(frame('group-1', 0, 0));
  });

  it('replaces an existing frame with the same id', () => {
    const frames = new Map<string, DropFrame>();
    registerFrame(frames, frame('group-1', 0, 0));
    registerFrame(frames, frame('group-1', 500, 500));
    expect(frames.size).toBe(1);
    // The old geometry no longer hits; the new one does.
    expect(hitTest(frames, 10, 10)).toBeNull();
    expect(hitTest(frames, 510, 520)).toBe('group-1');
  });
});

describe('hitTest', () => {
  it('returns null on a miss (and for an empty map)', () => {
    const frames = new Map<string, DropFrame>();
    expect(hitTest(frames, 50, 50)).toBeNull();
    registerFrame(frames, frame('group-1', 100, 100));
    expect(hitTest(frames, 50, 50)).toBeNull();
    expect(hitTest(frames, 250, 120)).toBeNull(); // right of the frame
  });

  it('returns the frame id when the point is inside', () => {
    const frames = new Map<string, DropFrame>();
    registerFrame(frames, frame('group-1', 100, 100));
    registerFrame(frames, frame('crumb-root', 300, 10, 80, 30));
    expect(hitTest(frames, 150, 200)).toBe('group-1');
    expect(hitTest(frames, 310, 20)).toBe('crumb-root');
  });

  it('includes the frame edges', () => {
    const frames = new Map<string, DropFrame>();
    registerFrame(frames, frame('group-1', 100, 100, 100, 150));
    expect(hitTest(frames, 100, 100)).toBe('group-1');
    expect(hitTest(frames, 200, 250)).toBe('group-1');
  });

  it('last-registered frame wins on overlap', () => {
    const frames = new Map<string, DropFrame>();
    registerFrame(frames, frame('group-1', 0, 0, 200, 200));
    registerFrame(frames, frame('group-2', 50, 50, 200, 200));
    // Point inside both → the later registration.
    expect(hitTest(frames, 100, 100)).toBe('group-2');
    // Point only inside the first.
    expect(hitTest(frames, 10, 10)).toBe('group-1');
  });
});

describe('hitTestList', () => {
  it('mirrors hitTest over a plain array (worklet-side shape)', () => {
    const list = [frame('group-1', 0, 0, 200, 200), frame('group-2', 50, 50, 200, 200)];
    expect(hitTestList(list, 100, 100)).toBe('group-2');
    expect(hitTestList(list, 10, 10)).toBe('group-1');
    expect(hitTestList(list, 900, 900)).toBeNull();
    expect(hitTestList([], 0, 0)).toBeNull();
  });
});

describe('decodeDropTarget', () => {
  it('decodes a folder card target to its group id', () => {
    expect(decodeDropTarget('group-12')).toEqual({ groupId: 12 });
  });

  it('decodes a crumb target to its group id', () => {
    expect(decodeDropTarget('crumb-7')).toEqual({ groupId: 7 });
  });

  it('decodes the root crumb to a null group (move to library root)', () => {
    expect(decodeDropTarget('crumb-root')).toEqual({ groupId: null });
  });

  it('returns null for unknown ids', () => {
    expect(decodeDropTarget('bogus')).toBeNull();
    expect(decodeDropTarget('group-')).toBeNull();
    expect(decodeDropTarget('')).toBeNull();
  });
});

describe('shouldMove', () => {
  it('returns false when there is no target (spring-back / miss)', () => {
    expect(shouldMove(1, null)).toBe(false);
    expect(shouldMove(null, null)).toBe(false);
  });

  it('returns false when the target id is unrecognised (bad decode)', () => {
    expect(shouldMove(1, 'bogus')).toBe(false);
    expect(shouldMove(null, 'group-')).toBe(false);
  });

  it('returns false when the decoded groupId matches the series groupId (same-group no-op)', () => {
    // Numeric group — dropping onto the same folder card.
    expect(shouldMove(5, 'group-5')).toBe(false);
    // Numeric group — dropping onto the same ancestor crumb.
    expect(shouldMove(7, 'crumb-7')).toBe(false);
    // Ungrouped series dropped onto the root crumb.
    expect(shouldMove(null, 'crumb-root')).toBe(false);
  });

  it('returns true when dropping into a different numeric group', () => {
    expect(shouldMove(1, 'group-2')).toBe(true);
    expect(shouldMove(null, 'group-3')).toBe(true);
  });

  it('returns true when dropping onto the root crumb from a group', () => {
    expect(shouldMove(4, 'crumb-root')).toBe(true);
  });

  it('returns true when dropping onto a crumb with a different group id', () => {
    expect(shouldMove(3, 'crumb-9')).toBe(true);
  });
});

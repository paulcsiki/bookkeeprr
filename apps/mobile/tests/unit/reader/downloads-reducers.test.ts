import { reducePause, reduceEnqueue } from '@/state/readerDownloadsStore';

describe('reducePause', () => {
  it('marks an entry paused, preserving pct/bytes', () => {
    let m = reduceEnqueue({}, 'k', { title: 'X' });
    m = { ...m, k: { ...m.k!, state: 'downloading', pct: 62, bytes: 1234 } };
    const out = reducePause(m, 'k');
    expect(out.k!.state).toBe('paused');
    expect(out.k!.pct).toBe(62);
    expect(out.k!.bytes).toBe(1234);
  });
  it('is a no-op for an unknown key', () => {
    expect(reducePause({}, 'nope')).toEqual({});
  });
});

import {
  trackBoundaries,
  globalToTrack,
  trackToGlobal,
  totalDuration,
} from '@/features/reader/lib/audio-timeline';

const tracks = [{ durationSec: 100 }, { durationSec: 200 }, { durationSec: 300 }]; // total 600

describe('audio-timeline', () => {
  it('totalDuration sums tracks', () => expect(totalDuration(tracks)).toBe(600));

  it('trackBoundaries gives cumulative start secs', () => {
    expect(trackBoundaries(tracks)).toEqual([0, 100, 300]);
  });

  it('globalToTrack maps a global second to {trackIdx, offsetSec}', () => {
    expect(globalToTrack(tracks, 50)).toEqual({ trackIdx: 0, offsetSec: 50 });
    expect(globalToTrack(tracks, 150)).toEqual({ trackIdx: 1, offsetSec: 50 });
    expect(globalToTrack(tracks, 350)).toEqual({ trackIdx: 2, offsetSec: 50 });
    expect(globalToTrack(tracks, 9999).trackIdx).toBe(2); // clamp to last
  });

  it('trackToGlobal is the inverse', () => {
    expect(trackToGlobal(tracks, 1, 50)).toBe(150);
  });

  it('handles null durations gracefully (treats as 0)', () => {
    expect(totalDuration([{ durationSec: null }, { durationSec: 100 }])).toBe(100);
  });
});

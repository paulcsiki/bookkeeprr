import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { describeAudio } from '@/server/reader/formats/audio';

const MP3 = resolve(__dirname, '../../fixtures/reader/sample.mp3');

describe('describeAudio', () => {
  it('returns a duration (null or positive) without throwing', async () => {
    const d = await describeAudio(MP3);
    expect(d.durationSec === null || d.durationSec > 0).toBe(true);
  });

  it('reads the correct bitrate for a Layer III MP3 (128 kbps, not 288)', async () => {
    // sample.mp3 is MPEG-1 Layer III @ 128 kbps, 3336 bytes, no ID3.
    // CBR estimate: 3336 * 8 / 128000 = 0.2085s. The old inverted bitrate table
    // read it as 288 kbps -> ~0.0927s, ~2.25x too short.
    const d = await describeAudio(MP3);
    expect(d.durationSec).not.toBeNull();
    expect(d.durationSec!).toBeCloseTo((3336 * 8) / 128000, 3);
  });
});

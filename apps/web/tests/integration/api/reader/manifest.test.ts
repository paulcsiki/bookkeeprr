import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { upsertProgress } from '@/server/db/reading-progress';
import { buildReadableKey } from '@bookkeeprr/types';
import { buildManifest } from '@/server/reader/manifest';
import { seedReaderFixtures, type ReaderFixtures } from './fixtures-helper';

let h: SeedHandle;
let fx: ReaderFixtures;
let userId: number;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  fx = await seedReaderFixtures(h);
  const user = await insertUser({
    username: 'reader',
    passwordHash: 'x',
    role: 'admin',
    mustChangePassword: false,
  });
  userId = user.id;
});

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

describe('buildManifest', () => {
  it('builds a comics manifest from a cbz file', async () => {
    const m = await buildManifest({ fileId: fx.cbzFileId }, userId);
    if ('error' in m) throw new Error('unexpected error: ' + m.error);
    expect(m.reader).toBe('comics');
    expect(m.format).toBe('cbz');
    expect(m.pageCount).toBe(3);
    expect(m.progress.position).toBe(0);
    expect(m.progress.finished).toBe(false);
    expect(m.readableKey).toBe(buildReadableKey({ kind: 'page', fileId: fx.cbzFileId }));
  });

  it('builds a text manifest from an epub file', async () => {
    const m = await buildManifest({ fileId: fx.epubFileId }, userId);
    if ('error' in m) throw new Error('unexpected error: ' + m.error);
    expect(m.reader).toBe('text');
    expect(m.format).toBe('epub');
    expect(m.spine?.length).toBe(2);
    expect(m.toc?.length).toBe(2);
    expect(m.opfDir).toBe('OEBPS');
  });

  it('builds a text manifest from a pdf-as-ebook file', async () => {
    const m = await buildManifest({ fileId: fx.pdfEbookFileId }, userId);
    if ('error' in m) throw new Error('unexpected error: ' + m.error);
    expect(m.reader).toBe('text');
    expect(m.format).toBe('pdf');
    expect(m.pageCount).toBe(2);
  });

  it('builds an audio manifest from an audiobook volume', async () => {
    const m = await buildManifest({ volumeId: fx.audioVolumeId }, userId);
    if ('error' in m) throw new Error('unexpected error: ' + m.error);
    expect(m.reader).toBe('audio');
    expect(m.format).toBe('audio');
    expect(m.tracks?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(m.readableKey).toBe(buildReadableKey({ kind: 'audio', volumeId: fx.audioVolumeId }));
  });

  it('audio: track-derived chapters carry per-track startSec and totalSec sums the tracks', async () => {
    const m = await buildManifest({ volumeId: fx.audioVolumeId }, userId);
    if ('error' in m) throw new Error('unexpected error: ' + m.error);
    const tracks = m.tracks ?? [];
    const chapters = m.chapters ?? [];
    expect(tracks.length).toBe(2);
    // One chapter per track, each stamped with the running start time.
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.startSec).toBe(0);
    const t0 = tracks[0]!.durationSec ?? 0;
    expect(t0).toBeGreaterThan(0); // sample.mp3 probes to a real duration
    // Second chapter starts exactly where the first track ends — NOT an even
    // totalSec/2 split. This is what makes each row show its real length.
    expect(chapters[1]!.startSec).toBeCloseTo(t0, 3);
    // totalSec is the sum of the two identical sample tracks.
    expect(m.totalSec).toBeCloseTo(t0 * 2, 3);
  });

  it('returns position 0 + restartedFromFinish when prior progress is finished', async () => {
    const readableKey = buildReadableKey({ kind: 'page', fileId: fx.cbzFileId });
    await upsertProgress({
      userId,
      readableKey,
      seriesId: fx.comicsSeriesId,
      volumeId: null,
      libraryFileId: fx.cbzFileId,
      contentType: 'manga',
      position: 1,
    });
    const m = await buildManifest({ fileId: fx.cbzFileId }, userId);
    if ('error' in m) throw new Error('unexpected error: ' + m.error);
    expect(m.progress.position).toBe(0);
    expect(m.progress.restartedFromFinish).toBe(true);
    expect(m.progress.locator).toBeNull();
  });

  it('returns not_found for an unknown file id', async () => {
    const m = await buildManifest({ fileId: 999999 }, userId);
    expect(m).toEqual({ error: 'not_found' });
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertLibraryFile } from '@/server/db/library-files';
import { resolveReadable } from '@/server/reader/readable';
import type { ContentType } from '@/server/content-type';

let h: SeedHandle;
let mediaRoot: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  mediaRoot = join(h.tmpDir, 'media');
  mkdirSync(mediaRoot, { recursive: true });
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaRoot;
});

afterEach(() => {
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

/**
 * Seed one series + one volume + N library files that exist on disk under the
 * media root, then return the volumeId for resolving. Each `names` entry is a
 * bare filename written into a per-series dir.
 */
async function seedVolume(contentType: ContentType, names: string[]): Promise<number> {
  const dir = join(mediaRoot, contentType, `series-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const seriesId = await insertSeries({
    contentType,
    status: 'finished',
    rootPath: dir,
    qualityProfileId: h.qpId,
    titleEnglish: 'Test Series',
  });
  const volumeId = await insertVolume({ seriesId, number: 1 });
  for (const name of names) {
    const p = join(dir, name);
    writeFileSync(p, 'x');
    await insertLibraryFile({ seriesId, volumeId, path: p, sizeBytes: 1 });
  }
  return volumeId;
}

describe('resolveReadable — player routed by file format', () => {
  it('light_novel delivered as .cbz opens in the comics reader (regression)', async () => {
    const volumeId = await seedVolume('light_novel', ['Vol 01.cbz']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('comics');
    expect(res.format).toBe('cbz');
  });

  it('ebook volume with both .azw3 and .epub prefers the richer .epub', async () => {
    // Both are now readable, but EPUB renders via the native server-assisted
    // pipeline and outranks the client-only foliate path, so the resolver must
    // pick the .epub even though .azw3 sorts first by path.
    const volumeId = await seedVolume('ebook', ['Book.azw3', 'Book.epub']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('text');
    expect(res.format).toBe('epub');
    expect(res.file?.path.endsWith('Book.epub')).toBe(true);
  });

  it('ebook volume with only .mobi opens in the text reader as format mobi', async () => {
    const volumeId = await seedVolume('ebook', ['Sabriel.mobi']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('text');
    expect(res.format).toBe('mobi');
    expect(res.file?.path.endsWith('Sabriel.mobi')).toBe(true);
  });

  it('ebook volume with only .azw3 opens in the text reader as format azw3', async () => {
    const volumeId = await seedVolume('ebook', ['Sabriel.azw3']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('text');
    expect(res.format).toBe('azw3');
  });

  it('.azw (older Kindle container) resolves to the mobi format', async () => {
    const volumeId = await seedVolume('ebook', ['Sabriel.azw']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.format).toBe('mobi');
  });

  it('ebook volume with .epub opens in the text reader', async () => {
    const volumeId = await seedVolume('ebook', ['Book.epub']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('text');
    expect(res.format).toBe('epub');
  });

  it('light_novel volume with .epub opens in the text reader', async () => {
    const volumeId = await seedVolume('light_novel', ['Book.epub']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('text');
    expect(res.format).toBe('epub');
  });

  it('manga volume with .cbz opens in the comics reader (unchanged)', async () => {
    const volumeId = await seedVolume('manga', ['Vol 01.cbz']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('comics');
    expect(res.format).toBe('cbz');
  });

  it('comic volume with .cbz opens in the comics reader (unchanged)', async () => {
    const volumeId = await seedVolume('comic', ['Vol 01.cbz']);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('comics');
    expect(res.format).toBe('cbz');
  });

  it('audiobook volume with audio files resolves to the audio reader (unchanged)', async () => {
    const volumeId = await seedVolume('audiobook', [
      'Track 01.mp3',
      'Track 02.mp3',
    ]);
    const res = await resolveReadable({ volumeId });
    expect('error' in res).toBe(false);
    if ('error' in res) return;
    expect(res.reader).toBe('audio');
    expect(res.format).toBe('audio');
    expect(res.audioFiles?.length).toBe(2);
  });
});

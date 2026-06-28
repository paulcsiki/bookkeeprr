import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertLibraryFile } from '@/server/db/library-files';
import type { SeedHandle } from '../../helpers/seed';

/**
 * Source fixtures committed under apps/web/tests/fixtures/reader. Resolved
 * relative to this file so it works regardless of cwd.
 */
const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'fixtures', 'reader');

export type ReaderFixtures = {
  mediaRoot: string;
  comicsSeriesId: number;
  ebookSeriesId: number;
  audioSeriesId: number;
  cbzFileId: number;
  epubFileId: number;
  pdfEbookFileId: number;
  mobiFileId: number;
  audioVolumeId: number;
  audioFileId: number;
};

/**
 * Lay out the committed reader fixtures inside a fresh media root and register
 * matching series / volumes / library-files in the DB. Sets
 * BOOKKEEPRR_MEDIA_ROOT to the media root (the directory that CONTAINS the
 * files) so `resolveLibraryFilePath` accepts the absolute paths we insert.
 *
 * The caller owns `process.env.BOOKKEEPRR_MEDIA_ROOT` restoration; we just set
 * it. `h.tmpDir` is reused as the base, so `h.cleanup()` removes everything.
 */
export async function seedReaderFixtures(h: SeedHandle): Promise<ReaderFixtures> {
  const mediaRoot = join(h.tmpDir, 'media');
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaRoot;

  const comicsDir = join(mediaRoot, 'comics', 'Test Comic');
  const booksDir = join(mediaRoot, 'books', 'Test Book');
  const audioDir = join(mediaRoot, 'audiobooks', 'Test Audiobook');
  mkdirSync(comicsDir, { recursive: true });
  mkdirSync(booksDir, { recursive: true });
  mkdirSync(audioDir, { recursive: true });

  const cbzPath = join(comicsDir, 'Test Comic - v01.cbz');
  const epubPath = join(booksDir, 'Test Book.epub');
  const pdfPath = join(booksDir, 'Test Book.pdf');
  const audioPath = join(audioDir, 'Test Audiobook - 01.mp3');
  const audioPath2 = join(audioDir, 'Test Audiobook - 02.mp3');
  copyFileSync(join(FIXTURE_DIR, 'sample.cbz'), cbzPath);
  copyFileSync(join(FIXTURE_DIR, 'sample.epub'), epubPath);
  copyFileSync(join(FIXTURE_DIR, 'sample.pdf'), pdfPath);
  copyFileSync(join(FIXTURE_DIR, 'sample.mp3'), audioPath);
  copyFileSync(join(FIXTURE_DIR, 'sample.mp3'), audioPath2);

  // --- comics series (cbz) ---
  const comicsSeriesId = await insertSeries({
    contentType: 'manga',
    status: 'releasing',
    rootPath: comicsDir,
    qualityProfileId: h.qpId,
    titleEnglish: 'Test Comic',
    author: 'Comic Author',
    coverUrl: 'https://example.com/comic.jpg',
  });
  const comicsVolId = await insertVolume({ seriesId: comicsSeriesId, number: 1, title: 'Volume One' });
  const cbzFileId = await insertLibraryFile({
    seriesId: comicsSeriesId,
    volumeId: comicsVolId,
    path: cbzPath,
    sizeBytes: 600,
  });

  // --- ebook series (epub + pdf) ---
  const ebookSeriesId = await insertSeries({
    contentType: 'ebook',
    status: 'finished',
    rootPath: booksDir,
    qualityProfileId: h.qpId,
    titleEnglish: 'Test Book',
    author: 'Book Author',
  });
  const epubVolId = await insertVolume({ seriesId: ebookSeriesId, number: 1 });
  const epubFileId = await insertLibraryFile({
    seriesId: ebookSeriesId,
    volumeId: epubVolId,
    path: epubPath,
    sizeBytes: 2300,
  });
  const pdfVolId = await insertVolume({ seriesId: ebookSeriesId, number: 2 });
  const pdfEbookFileId = await insertLibraryFile({
    seriesId: ebookSeriesId,
    volumeId: pdfVolId,
    path: pdfPath,
    sizeBytes: 460,
  });
  // MOBI: a stub file (foliate-js parses on the client, so the server only ever
  // streams the bytes — a real MOBI is unnecessary for route/manifest tests).
  const mobiPath = join(booksDir, 'Test Book.mobi');
  writeFileSync(mobiPath, Buffer.from('BOOKMOBI stub contents for range serving'));
  const mobiVolId = await insertVolume({ seriesId: ebookSeriesId, number: 3 });
  const mobiFileId = await insertLibraryFile({
    seriesId: ebookSeriesId,
    volumeId: mobiVolId,
    path: mobiPath,
    sizeBytes: 40,
  });

  // --- audiobook series (mp3) ---
  const audioSeriesId = await insertSeries({
    contentType: 'audiobook',
    status: 'finished',
    rootPath: audioDir,
    qualityProfileId: h.qpId,
    titleEnglish: 'Test Audiobook',
    author: 'Audio Author',
    narrator: 'A Narrator',
  });
  const audioVolumeId = await insertVolume({ seriesId: audioSeriesId, number: 1, title: 'Audio Vol' });
  const audioFileId = await insertLibraryFile({
    seriesId: audioSeriesId,
    volumeId: audioVolumeId,
    path: audioPath,
    sizeBytes: 3336,
  });
  // A second track on the same volume, so the manifest builds a multi-track
  // timeline (exercises per-track chapter startSec).
  await insertLibraryFile({
    seriesId: audioSeriesId,
    volumeId: audioVolumeId,
    path: audioPath2,
    sizeBytes: 3336,
  });

  return {
    mediaRoot,
    comicsSeriesId,
    ebookSeriesId,
    audioSeriesId,
    cbzFileId,
    epubFileId,
    pdfEbookFileId,
    mobiFileId,
    audioVolumeId,
    audioFileId,
  };
}

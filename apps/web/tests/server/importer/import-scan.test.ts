import { afterEach, beforeEach, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { contentTypePathsSetting } from '@/server/db/settings/library';
import { insertLibraryFile } from '@/server/db/library-files';
import { scanLibraryRootsForImport } from '@/server/importer/import-scan';
import type { ContentType } from '@/server/content-type';

let h: SeedHandle;
let bookDir: string;

const ALL_CONTENT_TYPES: ContentType[] = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'];

function emptyPaths(): Record<ContentType, { libraryRoot: string; qbtCategory: string }> {
  return Object.fromEntries(
    ALL_CONTENT_TYPES.map((t) => [t, { libraryRoot: '', qbtCategory: '' }]),
  ) as Record<ContentType, { libraryRoot: string; qbtCategory: string }>;
}

beforeEach(async () => {
  h = await seedDb();
  bookDir = mkdtempSync(join(tmpdir(), 'bk-scan-'));
});

afterEach(() => {
  rmSync(bookDir, { recursive: true, force: true });
  h.cleanup();
});

it('finds an untracked ebook file as a ScanItem and skips tracked ones', async () => {
  // arrange: two .epub files in the temp dir
  const sabrielPath = join(bookDir, 'Sabriel.epub');
  const goldenhandPath = join(bookDir, 'Goldenhand.epub');
  writeFileSync(sabrielPath, 'epub-content-sabriel');
  writeFileSync(goldenhandPath, 'epub-content-goldenhand');

  // mark Goldenhand as already tracked
  await insertLibraryFile({
    seriesId: h.seriesId,
    path: goldenhandPath,
    sizeBytes: 20,
  });

  // point ebook libraryRoot at our temp dir; leave others empty (will be skipped)
  const paths = emptyPaths();
  paths.ebook = { libraryRoot: bookDir, qbtCategory: '' };
  await contentTypePathsSetting.set(paths);

  // act
  const items = await scanLibraryRootsForImport();
  const ebooks = items.filter((i) => i.contentType === 'ebook');

  // assert
  expect(ebooks.map((i) => i.detectedTitle)).toContain('Sabriel');
  expect(ebooks.map((i) => i.detectedTitle)).not.toContain('Goldenhand');
});

it('returns one ScanItem per subfolder for manga', async () => {
  // arrange: a manga root with two series folders, each containing one .cbz
  mkdirSync(join(bookDir, 'Berserk'));
  mkdirSync(join(bookDir, 'Vinland Saga'));
  writeFileSync(join(bookDir, 'Berserk', 'Berserk - v01.cbz'), 'zip');
  writeFileSync(join(bookDir, 'Vinland Saga', 'Vinland Saga - v01.cbz'), 'zip');

  const paths = emptyPaths();
  paths.manga = { libraryRoot: bookDir, qbtCategory: '' };
  await contentTypePathsSetting.set(paths);

  const items = await scanLibraryRootsForImport();
  const manga = items.filter((i) => i.contentType === 'manga');

  expect(manga.map((i) => i.detectedTitle)).toContain('Berserk');
  expect(manga.map((i) => i.detectedTitle)).toContain('Vinland Saga');
  // files list includes the cbz
  const berserk = manga.find((i) => i.detectedTitle === 'Berserk')!;
  expect(berserk.files).toHaveLength(1);
  expect(berserk.files[0]).toContain('Berserk - v01.cbz');
});

it('sums sizeBytes correctly for a multi-file audiobook folder', async () => {
  const abDir = join(bookDir, 'Dune');
  mkdirSync(abDir);
  writeFileSync(join(abDir, 'part1.mp3'), 'a'.repeat(100));
  writeFileSync(join(abDir, 'part2.mp3'), 'b'.repeat(200));

  const paths = emptyPaths();
  paths.audiobook = { libraryRoot: bookDir, qbtCategory: '' };
  await contentTypePathsSetting.set(paths);

  const items = await scanLibraryRootsForImport();
  const ab = items.find((i) => i.contentType === 'audiobook' && i.detectedTitle === 'Dune');
  expect(ab).toBeDefined();
  expect(ab!.sizeBytes).toBe(300);
  expect(ab!.files).toHaveLength(2);
});

it('gracefully skips a libraryRoot that does not exist', async () => {
  const paths = emptyPaths();
  paths.ebook = { libraryRoot: '/nonexistent/path/xyz', qbtCategory: '' };
  await contentTypePathsSetting.set(paths);

  // should not throw
  const items = await scanLibraryRootsForImport();
  expect(items.filter((i) => i.contentType === 'ebook')).toHaveLength(0);
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload, getDownload } from '@/server/db/downloads';
import { insertSeries } from '@/server/db/series';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { importDescriptor } from '@/server/jobs/kinds/import';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { listLibraryFilesBySeries } from '@/server/db/library-files';
import { contentTypeSubdir } from '@/server/content-type/paths';
import { contentTypePathsSetting, torrentCleanupSetting } from '@/server/db/settings/library';
import { deflateRawSync } from 'node:zlib';

// --- minimal zip writer so source files survive the content health-check gate
// (the importer opens each routed file with the real reader probers before
// importing; dummy "fake-content" bytes would be flagged as corrupt). ---
function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function makeZip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const comp = deflateRawSync(e.data);
    const crc = crc32(e.data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    const localRecord = Buffer.concat([lh, nameBuf, comp]);
    locals.push(localRecord);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, nameBuf]));

    offset += localRecord.length;
  }
  const localBlock = Buffer.concat(locals);
  const centralBlock = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBlock.length, 12);
  eocd.writeUInt32LE(localBlock.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBlock, centralBlock, eocd]);
}

function validCbz(): Buffer {
  return makeZip([{ name: '001.png', data: Buffer.from('img') }]);
}

function validEpub(): Buffer {
  const container =
    '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
    '<rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
  const opf =
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf">' +
    '<manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>' +
    '<spine><itemref idref="c1"/></spine></package>';
  return makeZip([
    { name: 'META-INF/container.xml', data: Buffer.from(container) },
    { name: 'content.opf', data: Buffer.from(opf) },
    { name: 'c1.xhtml', data: Buffer.from('<html><body>ch1</body></html>') },
  ]);
}

/** Valid archive bytes by extension; defaults to a cbz. */
function validArchiveFor(name: string): Buffer {
  return name.toLowerCase().endsWith('.epub') ? validEpub() : validCbz();
}

let h: SeedHandle;
let releaseId: number;
let downloadId: number;
let savePath: string;
let mediaPath: string;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  savePath = mkdtempSync(join(tmpdir(), 'bk-import-'));
  mediaPath = mkdtempSync(join(tmpdir(), 'bk-media-'));
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaPath;
  releaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'g1',
    seriesId: h.seriesId,
    title: 't',
    link: 'magnet:?xt=urn:btih:abc',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 0,
    publishedAt: new Date(),
    groupName: 'Group',
  });
  downloadId = await insertDownload({ releaseId, qbtHash: 'abc123', status: 'completed' });
  await qbtConnectionSetting.set({
    host: 'x',
    port: 1,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  __resetQbtForTests();
});

afterEach(() => {
  rmSync(savePath, { recursive: true, force: true });
  rmSync(mediaPath, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  h.cleanup();
});

// Records the `category` the importer asked qBit's /torrents/info for, so tests
// can assert it lists by the series' resolved category (not a hardcoded one).
let lastInfoCategory: string | null = null;

function mockQbt(opts: {
  savePath: string;
  files: { name: string; size: number }[];
  hash?: string;
}): void {
  const hash = opts.hash ?? 'abc123';
  lastInfoCategory = null;
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    if (url.includes('/torrents/info')) {
      lastInfoCategory = new URL(url).searchParams.get('category');
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          JSON.stringify([
            {
              hash,
              name: 'x',
              state: 'stalledUP',
              progress: 1,
              category: 'bookkeeprr-manga',
              tags: '',
              save_path: opts.savePath,
              size: 100,
              completed: 100,
            },
          ]),
      };
    }
    if (url.includes('/torrents/files')) {
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          JSON.stringify(opts.files.map((f) => ({ name: f.name, size: f.size, progress: 1 }))),
      };
    }
    throw new Error(`unexpected ${url}`);
  });
}

describe('import job', () => {
  it('imports a single-volume release', async () => {
    // Place a fake source file in the qBT save path
    const srcName = 'Test Series - v01 [Group].cbz';
    writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
    mockQbt({ savePath, files: [{ name: srcName, size: 12 }] });

    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);

    const dl = await getDownload(downloadId);
    expect(dl?.status).toBe('imported');
    const files = await listLibraryFilesBySeries(h.seriesId);
    expect(files.length).toBeGreaterThan(0);
  });

  it('no-ops when download already imported', async () => {
    const { updateDownload } = await import('@/server/db/downloads');
    await updateDownload(downloadId, { status: 'imported', importedAt: new Date() });
    mockQbt({ savePath, files: [] });
    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);
    const files = await listLibraryFilesBySeries(h.seriesId);
    // No new library files should appear
    expect(files.length).toBe(0);
  });

  it('marks failed when qbt reports no files', async () => {
    mockQbt({ savePath, files: [] });
    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);
    const dl = await getDownload(downloadId);
    expect(dl?.status).toBe('failed');
    expect(dl?.error).toMatch(/no files/);
  });

  it('open batch of volumes names files with the volume template (not chapter-batch)', async () => {
    // A "(Complete)" pack: batch release, null range, files named per volume.
    // Each must use the volume template (v01/v02), not the chapter-batch
    // template (which would name every file "- c [..]" → dedup collisions).
    const { insertVolume } = await import('@/server/db/volumes');
    await insertVolume({ seriesId: h.seriesId, number: 2, title: 'v2' });
    const relId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'batch-g1',
      seriesId: h.seriesId,
      title: 'Test Series (Complete)',
      link: 'magnet:?xt=urn:btih:' + 'c'.padEnd(40, 'c'),
      targetKind: 'batch',
      targetLow: null,
      targetHigh: null,
      sizeBytes: 0,
      publishedAt: new Date(),
      groupName: 'G',
    });
    const dlId = await insertDownload({ releaseId: relId, qbtHash: 'batchhash', status: 'completed' });
    writeFileSync(join(savePath, 'Test Series - Volume 01.cbz'), validCbz());
    writeFileSync(join(savePath, 'Test Series - Volume 02.cbz'), validCbz());
    mockQbt({
      savePath,
      files: [
        { name: 'Test Series - Volume 01.cbz', size: 1 },
        { name: 'Test Series - Volume 02.cbz', size: 1 },
      ],
      hash: 'batchhash',
    });

    await enqueueJob('import', { downloadId: dlId });
    await runOnce(importDescriptor);

    const paths = (await listLibraryFilesBySeries(h.seriesId)).map((f) => f.path);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => /v0?1\b/i.test(p))).toBe(true);
    expect(paths.some((p) => /v0?2\b/i.test(p))).toBe(true);
    expect(paths.every((p) => !/ - c /.test(p))).toBe(true);
  });
});

describe('import job — per-content-type subdir routing', () => {
  it('manga series lands at /media/comics/...', async () => {
    // Place a fake source file
    const srcName = 'Test Series - v01 [Group].cbz';
    writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
    mockQbt({ savePath, files: [{ name: srcName, size: 12 }] });

    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);

    const files = await listLibraryFilesBySeries(h.seriesId);
    expect(files.length).toBeGreaterThan(0);
    // The library_files path should start with $MEDIA_ROOT/comics
    expect(files[0]?.path).toContain(`/${contentTypeSubdir('manga')}/`);
  });

  it('synthetic ebook series lands at /media/books/...', async () => {
    // Create an ebook series directly
    const ebookSeriesId = await insertSeries({
      contentType: 'ebook',
      anilistId: null,
      status: 'finished',
      rootPath: '/media/books/Ebook Test',
      qualityProfileId: h.qpId,
      titleEnglish: 'Ebook Test',
    });
    // Need a volume row for the importer to find a target
    const { insertVolume } = await import('@/server/db/volumes');
    const ebookVolId = await insertVolume({ seriesId: ebookSeriesId, number: 1, title: 'v1' });

    // Create a release + download for this ebook series
    const { upsertReleaseByGuid: upsertEbookRelease } = await import('@/server/db/releases');
    const ebookReleaseId = await upsertEbookRelease({
      indexerId: 1,
      indexerGuid: 'ebook-g1',
      seriesId: ebookSeriesId,
      title: 'Ebook Test - v01 [Pub].epub',
      link: 'magnet:?xt=urn:btih:b'.padEnd(53, 'b'),
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 100,
      publishedAt: new Date(),
      groupName: 'Pub',
    });
    const { insertDownload: insertDl } = await import('@/server/db/downloads');
    const ebookDownloadId = await insertDl({
      releaseId: ebookReleaseId,
      qbtHash: 'ebookhash',
      status: 'completed',
    });

    // Ebook source file — the ebook router routes by ebook extension (epub/pdf/…).
    const ebookSrc = 'Ebook Test - v01 [Pub].epub';
    writeFileSync(join(savePath, ebookSrc), validArchiveFor(ebookSrc));
    mockQbt({ savePath, files: [{ name: ebookSrc, size: 13 }], hash: 'ebookhash' });

    await enqueueJob('import', { downloadId: ebookDownloadId });
    await runOnce(importDescriptor);

    const files = await listLibraryFilesBySeries(ebookSeriesId);
    expect(files.length).toBe(1);
    // The path must contain /books/ (the ebook subdir), NOT /comics/
    expect(files[0]?.path).toContain(`/${contentTypeSubdir('ebook')}/`);
    expect(files[0]?.path).not.toContain('/comics/');
    // Regression: the importer must list by the series' category, not a
    // hardcoded 'bookkeeprr-manga' (which would never find a non-manga torrent).
    expect(lastInfoCategory).toBe('bookkeeprr-ebook');

    void ebookVolId; // suppress unused variable warning
  });
});

describe('import job — per-content-type library root override', () => {
  it('honors a configured per-type libraryRoot', async () => {
    const customRoot = mkdtempSync(join(tmpdir(), 'bk-libroot-'));
    try {
      await contentTypePathsSetting.set({
        manga: { libraryRoot: customRoot, qbtCategory: '' },
        comic: { libraryRoot: '', qbtCategory: '' },
        light_novel: { libraryRoot: '', qbtCategory: '' },
        ebook: { libraryRoot: '', qbtCategory: '' },
        audiobook: { libraryRoot: '', qbtCategory: '' },
      });
      const srcName = 'Test Series - v01 [Group].cbz';
      writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
      mockQbt({ savePath, files: [{ name: srcName, size: 12 }] });

      await enqueueJob('import', { downloadId });
      await runOnce(importDescriptor);

      const files = await listLibraryFilesBySeries(h.seriesId);
      expect(files.length).toBeGreaterThan(0);
      // Lands under the override root, not under mediaRoot/comics
      expect(files[0]?.path.startsWith(customRoot)).toBe(true);
      expect(files[0]?.path).not.toContain(`/${contentTypeSubdir('manga')}/`);
    } finally {
      rmSync(customRoot, { recursive: true, force: true });
    }
  });

  it('falls back to mediaRoot/<subdir> when libraryRoot is blank', async () => {
    // No contentTypePaths set → default blank → mediaRoot/comics
    const srcName = 'Test Series - v01 [Group].cbz';
    writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
    mockQbt({ savePath, files: [{ name: srcName, size: 12 }] });

    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);

    const files = await listLibraryFilesBySeries(h.seriesId);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]?.path.startsWith(join(mediaPath, contentTypeSubdir('manga')))).toBe(true);
  });
});

describe('import job — after_import torrent cleanup', () => {
  // Like mockQbt but also handles /torrents/delete, recording the requests so
  // tests can assert the hash + deleteFiles flag the importer sent.
  type DeleteCall = { hashes: string | null; deleteFiles: string | null };
  function mockQbtWithDelete(opts: {
    savePath: string;
    files: { name: string; size: number }[];
    deleteCalls: DeleteCall[];
    failDelete?: boolean;
  }): void {
    __setQbtFetcherForTests(async (url, init) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      if (url.includes('/torrents/info')) {
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify([
              {
                hash: 'abc123',
                name: 'x',
                state: 'stalledUP',
                progress: 1,
                category: 'bookkeeprr-manga',
                tags: '',
                save_path: opts.savePath,
                size: 100,
                completed: 100,
              },
            ]),
        };
      }
      if (url.includes('/torrents/files')) {
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () =>
            JSON.stringify(opts.files.map((f) => ({ name: f.name, size: f.size, progress: 1 }))),
        };
      }
      if (url.includes('/torrents/delete')) {
        const body = new URLSearchParams(String(init?.body ?? ''));
        opts.deleteCalls.push({
          hashes: body.get('hashes'),
          deleteFiles: body.get('deleteFiles'),
        });
        if (opts.failDelete) return { ok: false, status: 500, headers: {}, text: async () => '' };
        return { ok: true, status: 200, headers: {}, text: async () => '' };
      }
      throw new Error(`unexpected ${url}`);
    });
  }

  it('after_import deletes the torrent with the configured deleteFiles flag', async () => {
    await torrentCleanupSetting.set({ mode: 'after_import', deleteFiles: true });
    const srcName = 'Test Series - v01 [Group].cbz';
    writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
    const deleteCalls: DeleteCall[] = [];
    mockQbtWithDelete({ savePath, files: [{ name: srcName, size: 12 }], deleteCalls });

    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);

    const dl = await getDownload(downloadId);
    expect(dl?.status).toBe('imported');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.hashes).toBe('abc123');
    expect(deleteCalls[0]?.deleteFiles).toBe('true');
  });

  it('mode never does not delete the torrent', async () => {
    await torrentCleanupSetting.set({ mode: 'never', deleteFiles: false });
    const srcName = 'Test Series - v01 [Group].cbz';
    writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
    const deleteCalls: DeleteCall[] = [];
    mockQbtWithDelete({ savePath, files: [{ name: srcName, size: 12 }], deleteCalls });

    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);

    const dl = await getDownload(downloadId);
    expect(dl?.status).toBe('imported');
    expect(deleteCalls).toHaveLength(0);
  });

  it('does NOT delete the torrent when zero files were imported (routing skips)', async () => {
    // after_import + deleteFiles, but the only file is unmatched junk (no
    // volume/chapter token, non-archive) → import "succeeds" with zero imported
    // files. Deleting the torrent here would be data loss with nothing to show.
    await torrentCleanupSetting.set({ mode: 'after_import', deleteFiles: true });
    const srcName = 'readme.txt';
    writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
    const deleteCalls: DeleteCall[] = [];
    mockQbtWithDelete({ savePath, files: [{ name: srcName, size: 12 }], deleteCalls });

    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);

    const files = await listLibraryFilesBySeries(h.seriesId);
    expect(files.length).toBe(0);
    expect(deleteCalls).toHaveLength(0);
  });

  it('a delete failure does not fail or revert the import', async () => {
    await torrentCleanupSetting.set({ mode: 'after_import', deleteFiles: false });
    const srcName = 'Test Series - v01 [Group].cbz';
    writeFileSync(join(savePath, srcName), validArchiveFor(srcName));
    const deleteCalls: DeleteCall[] = [];
    mockQbtWithDelete({
      savePath,
      files: [{ name: srcName, size: 12 }],
      deleteCalls,
      failDelete: true,
    });

    await enqueueJob('import', { downloadId });
    await runOnce(importDescriptor);

    // Import still succeeds despite the delete error
    const dl = await getDownload(downloadId);
    expect(dl?.status).toBe('imported');
    const files = await listLibraryFilesBySeries(h.seriesId);
    expect(files.length).toBeGreaterThan(0);
    expect(deleteCalls).toHaveLength(1);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid, getRelease } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { importDownload } from '@/server/importer';
import { HealthCheckError } from '@/server/importer/errors';
import { countLibraryFilesByReleaseId } from '@/server/db/library-files';
import {
  __setSevenZipProbeForTest,
  __resetSevenZipProbeForTest,
} from '@/server/importer/health-check';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';

const FIXTURES = resolve(__dirname, '../../fixtures/reader');
const SAMPLE_CBZ = join(FIXTURES, 'sample.cbz'); // valid: 3 png + 1 txt

// --- minimal zip writer (mirrors health-check.test.ts / make-fixtures.mjs) ---
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

let h: SeedHandle;
let mediaPath: string;
let savePath: string;

/**
 * A qBit where exactly one torrent (matching `hash`) is present in the manga
 * category, with a single file `fileName`. The file is expected to live at
 * `savePath/fileName` on disk (the importer hardlinks from there).
 */
function mockQbtPresent(hash: string, fileName: string, size: number): void {
  const torrent = {
    hash,
    name: fileName,
    state: 'uploading',
    progress: 1,
    category: 'bookkeeprr-manga',
    tags: '',
    save_path: savePath,
    size,
    completed: size,
    ratio: 0,
    seeding_time: 0,
  };
  const file = { name: fileName, size, progress: 1 };
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
      return { ok: true, status: 200, headers: {}, text: async () => JSON.stringify([torrent]) };
    }
    if (url.includes('/torrents/files')) {
      return { ok: true, status: 200, headers: {}, text: async () => JSON.stringify([file]) };
    }
    throw new Error(`unexpected ${url}`);
  });
}

async function seedDownload(guid: string, qbtHash: string): Promise<{ releaseId: number; downloadId: number }> {
  const releaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: guid,
    seriesId: h.seriesId,
    title: 't',
    link: `magnet:?xt=urn:btih:${guid}`,
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 0,
    publishedAt: new Date(),
    groupName: 'Group',
  });
  const downloadId = await insertDownload({ releaseId, qbtHash, status: 'importing' });
  return { releaseId, downloadId };
}

beforeEach(async () => {
  h = await seedDb(); // default series is manga, volume 1 seeded
  await seedDefaultIndexer();
  mediaPath = mkdtempSync(join(tmpdir(), 'bk-media-'));
  savePath = mkdtempSync(join(tmpdir(), 'bk-save-'));
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaPath;
  await qbtConnectionSetting.set({
    host: 'x',
    port: 1,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  __resetQbtForTests();
  __resetSevenZipProbeForTest();
});

afterEach(() => {
  rmSync(mediaPath, { recursive: true, force: true });
  rmSync(savePath, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  __resetQbtForTests();
  __resetSevenZipProbeForTest();
  h.cleanup();
});

describe('importDownload — health-check rejection', () => {
  it('rejects a bad release (0-image cbz): nothing imported, release blacklisted', async () => {
    // A real zip with no images → checkFile → bad/no-images.
    const fileName = 'Test Series v01.cbz';
    const bad = makeZip([{ name: 'readme.txt', data: Buffer.from('no images here') }]);
    writeFileSync(join(savePath, fileName), bad);
    const { releaseId, downloadId } = await seedDownload('g-bad', 'badhash');
    mockQbtPresent('badhash', fileName, bad.length);

    // (b) HealthCheckError thrown with the health reason as its message.
    await expect(importDownload(downloadId)).rejects.toBeInstanceOf(HealthCheckError);

    // (a) zero library_files rows for this release.
    expect(await countLibraryFilesByReleaseId(releaseId)).toBe(0);

    // (c) the release is now blacklisted.
    const rel = await getRelease(releaseId);
    expect(rel?.rejectedAt).not.toBeNull();
    expect(rel?.rejectionReason).toBe('no-images');
  });

  it('carries the health reason in the error message (for download.error + notification)', async () => {
    const fileName = 'Test Series v01.cbz';
    const bad = makeZip([{ name: 'readme.txt', data: Buffer.from('nope') }]);
    writeFileSync(join(savePath, fileName), bad);
    const { downloadId } = await seedDownload('g-bad2', 'badhash2');
    mockQbtPresent('badhash2', fileName, bad.length);

    await expect(importDownload(downloadId)).rejects.toThrow(/no-images/);
  });

  it('imports a healthy file normally (no false-reject)', async () => {
    const fileName = 'Test Series v01.cbz';
    copyFileSync(SAMPLE_CBZ, join(savePath, fileName));
    const { releaseId, downloadId } = await seedDownload('g-ok', 'okhash');
    const { statSync } = await import('node:fs');
    mockQbtPresent('okhash', fileName, statSync(join(savePath, fileName)).size);

    const result = await importDownload(downloadId);

    expect(result.imported).toHaveLength(1);
    expect(await countLibraryFilesByReleaseId(releaseId)).toBe(1);
    const rel = await getRelease(releaseId);
    expect(rel?.rejectedAt).toBeNull();
  });

  it('zero-routed torrent (routing miss): does NOT throw HealthCheckError, inserts no library_files, release not blacklisted', async () => {
    // A torrent whose only file has an unrecognised extension (.txt/.nfo) that
    // the router will skip entirely — routing.routed is empty. This is a routing
    // miss, not corrupt content. The import should fail SOFT (retriable via
    // updateDownload failed) and must NEVER blacklist the release.
    const fileName = 'Test Series v01.nfo';
    const data = Buffer.from('NFO file — not a manga file');
    writeFileSync(join(savePath, fileName), data);
    const { releaseId, downloadId } = await seedDownload('g-zero-routed', 'zerohash');
    mockQbtPresent('zerohash', fileName, data.length);

    // Must NOT throw HealthCheckError (and must not throw at all).
    const result = await importDownload(downloadId);

    // Zero files imported.
    expect(result.imported).toHaveLength(0);
    expect(await countLibraryFilesByReleaseId(releaseId)).toBe(0);

    // The release must NOT be blacklisted — rejectedAt stays null.
    const rel = await getRelease(releaseId);
    expect(rel?.rejectedAt).toBeNull();
  });

  it('imports an inconclusive file (fail-open): a .cbr with 7z unavailable still imports', async () => {
    // A non-zip archive whose checker shells to 7z. With 7z unavailable the
    // health-check returns `inconclusive`, which must NOT block the import.
    __setSevenZipProbeForTest(async () => false);
    const fileName = 'Test Series v01.cbr';
    const data = Buffer.from('Rar!\x1a\x07\x00 not a real rar but routable');
    writeFileSync(join(savePath, fileName), data);
    const { releaseId, downloadId } = await seedDownload('g-incon', 'inconhash');
    mockQbtPresent('inconhash', fileName, data.length);

    const result = await importDownload(downloadId);

    expect(result.imported).toHaveLength(1);
    expect(await countLibraryFilesByReleaseId(releaseId)).toBe(1);
    const rel = await getRelease(releaseId);
    expect(rel?.rejectedAt).toBeNull();
  });
});

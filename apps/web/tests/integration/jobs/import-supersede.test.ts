import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload, getDownload } from '@/server/db/downloads';
import { insertVolume } from '@/server/db/volumes';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { importDescriptor } from '@/server/jobs/kinds/import';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { deflateRawSync } from 'node:zlib';

// --- minimal zip writer (mirrors jobs/import.test.ts) so the source file
// survives the importer's real content health-check gate. ---
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

let h: SeedHandle;
let savePath: string;
let mediaPath: string;

const IMPORTED_HASH = 'abc123';
const REDUNDANT_HASH = 'redundanthash';
const BATCH_HASH = 'batchhash';

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  savePath = mkdtempSync(join(tmpdir(), 'bk-supersede-'));
  mediaPath = mkdtempSync(join(tmpdir(), 'bk-supersede-media-'));
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaPath;
  __resetQbtForTests();
});

afterEach(() => {
  rmSync(savePath, { recursive: true, force: true });
  rmSync(mediaPath, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  h.cleanup();
});

type DeleteCall = { hashes: string | null; deleteFiles: string | null };

// qBit mock: imports `IMPORTED_HASH`'s lone v01 file; records /torrents/delete.
function mockQbt(opts: { savePath: string; deleteCalls: DeleteCall[] }): void {
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
              hash: IMPORTED_HASH,
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
          JSON.stringify([{ name: 'Test Series - v01 [Group].cbz', size: 12, progress: 1 }]),
      };
    }
    if (url.includes('/torrents/delete')) {
      const body = new URLSearchParams(String(init?.body ?? ''));
      opts.deleteCalls.push({
        hashes: body.get('hashes'),
        deleteFiles: body.get('deleteFiles'),
      });
      return { ok: true, status: 200, headers: {}, text: async () => '' };
    }
    throw new Error(`unexpected ${url}`);
  });
}

// Build the import scenario: a v01 single being imported, a redundant single
// covering v01, and a batch covering v01+v02 (v02 unowned). Volume 2 exists in
// the series so the batch has a real unowned target to protect it.
async function seedScenario(): Promise<{
  importedDownloadId: number;
  redundantDownloadId: number;
  batchDownloadId: number;
}> {
  await insertVolume({ seriesId: h.seriesId, number: 2, title: 'v2' });

  const importedReleaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'imported-g',
    seriesId: h.seriesId,
    title: 'Test Series - v01 [Group]',
    link: 'magnet:?xt=urn:btih:' + 'a'.padEnd(40, 'a'),
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 0,
    publishedAt: new Date(),
    groupName: 'Group',
  });
  const importedDownloadId = await insertDownload({
    releaseId: importedReleaseId,
    qbtHash: IMPORTED_HASH,
    status: 'completed',
  });

  const redundantReleaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'redundant-g',
    seriesId: h.seriesId,
    title: 'Test Series - v01 [Other]',
    link: 'magnet:?xt=urn:btih:' + 'b'.padEnd(40, 'b'),
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 0,
    publishedAt: new Date(),
    groupName: 'Other',
  });
  const redundantDownloadId = await insertDownload({
    releaseId: redundantReleaseId,
    qbtHash: REDUNDANT_HASH,
    status: 'downloading',
  });

  const batchReleaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'batch-g',
    seriesId: h.seriesId,
    title: 'Test Series - v01-v02 [Group]',
    link: 'magnet:?xt=urn:btih:' + 'c'.padEnd(40, 'c'),
    targetKind: 'batch',
    targetLow: 1,
    targetHigh: 2,
    sizeBytes: 0,
    publishedAt: new Date(),
    groupName: 'Group',
  });
  const batchDownloadId = await insertDownload({
    releaseId: batchReleaseId,
    qbtHash: BATCH_HASH,
    status: 'downloading',
  });

  return { importedDownloadId, redundantDownloadId, batchDownloadId };
}

describe('import job — supersede redundant siblings', () => {
  it('supersedes the redundant single, spares the batch, deletes the torrent', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    const { importedDownloadId, redundantDownloadId, batchDownloadId } = await seedScenario();
    writeFileSync(join(savePath, 'Test Series - v01 [Group].cbz'), validCbz());
    const deleteCalls: DeleteCall[] = [];
    mockQbt({ savePath, deleteCalls });

    await enqueueJob('import', { downloadId: importedDownloadId });
    await runOnce(importDescriptor);

    // Imported download untouched.
    expect((await getDownload(importedDownloadId))?.status).toBe('imported');
    // Redundant single superseded.
    expect((await getDownload(redundantDownloadId))?.status).toBe('superseded');
    // Batch still active (covers unowned v02).
    expect((await getDownload(batchDownloadId))?.status).toBe('downloading');

    // The redundant torrent was deleted with deleteFiles:true.
    const redundantDelete = deleteCalls.find((c) => c.hashes === REDUNDANT_HASH);
    expect(redundantDelete).toBeDefined();
    expect(redundantDelete?.deleteFiles).toBe('true');
    // The batch torrent was NOT deleted.
    expect(deleteCalls.some((c) => c.hashes === BATCH_HASH)).toBe(false);
  });

  it('supersedes without throwing when qBit is unconfigured', async () => {
    // The full import path requires qBit; the sweep itself must tolerate an
    // unconfigured qBit (no torrent to delete, but still mark superseded). So we
    // exercise the sweep directly without any qbtConnectionSetting.set.
    const { cancelRedundantSiblingDownloads } = await import(
      '@/server/importer/cancel-redundant'
    );
    const { insertLibraryFile } = await import('@/server/db/library-files');
    const { importedDownloadId, redundantDownloadId, batchDownloadId } = await seedScenario();

    // Pretend the imported download already landed v01 in the library.
    const imported = await getDownload(importedDownloadId);
    await insertLibraryFile({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      chapterId: null,
      sourceReleaseId: imported!.releaseId,
      path: join(mediaPath, 'Test Series - v01.cbz'),
      sizeBytes: 12,
    });

    await expect(
      cancelRedundantSiblingDownloads(importedDownloadId, h.seriesId),
    ).resolves.toEqual({ superseded: 1 });

    expect((await getDownload(redundantDownloadId))?.status).toBe('superseded');
    expect((await getDownload(batchDownloadId))?.status).toBe('downloading');
  });
});

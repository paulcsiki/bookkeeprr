import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload } from '@/server/db/downloads';
import { insertLibraryFile } from '@/server/db/library-files';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { importDownload } from '@/server/importer';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';

let h: SeedHandle;
let releaseId: number;
let downloadId: number;
let mediaPath: string;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
  mediaPath = mkdtempSync(join(tmpdir(), 'bk-media-'));
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaPath;
  releaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'g-gone',
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
  // status 'importing' (not 'imported') so the idempotency early-return does NOT
  // fire — this reproduces the duplicate-job path where import.ts already
  // clobbered the status to 'importing' before importDownload ran.
  downloadId = await insertDownload({ releaseId, qbtHash: 'gonehash', status: 'importing' });
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
  rmSync(mediaPath, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  __resetQbtForTests();
  h.cleanup();
});

/**
 * qBit where the torrent is gone: /torrents/info returns an empty list AND
 * /torrents/files 404s — exactly what a duplicate import job sees after the
 * first run already imported the files and the after_import policy deleted the
 * torrent.
 */
function mockQbtTorrentGone(): void {
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
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    }
    if (url.includes('/torrents/files')) {
      return { ok: false, status: 404, headers: {}, text: async () => 'Not Found' };
    }
    throw new Error(`unexpected ${url}`);
  });
}

describe('importDownload — torrent already gone', () => {
  it('returns an empty no-op result when the torrent is gone but the release was already imported', async () => {
    // Simulate the first job having already landed a file from this release.
    await insertLibraryFile({
      seriesId: h.seriesId,
      volumeId: h.volumeId,
      path: join(mediaPath, 'already-imported-v01.cbz'),
      sizeBytes: 123,
      sourceReleaseId: releaseId,
    });
    mockQbtTorrentGone();

    const result = await importDownload(downloadId);

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('throws when the torrent is gone and nothing was ever imported', async () => {
    mockQbtTorrentGone();
    await expect(importDownload(downloadId)).rejects.toThrow(/not found in qbt/);
  });
});

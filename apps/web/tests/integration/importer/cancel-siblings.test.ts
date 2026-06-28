/**
 * TDD tests for cancel-siblings-on-finish behavior.
 *
 * Scenario: two active downloads for the same single-volume series. One finishes
 * and imports. The other should be superseded and its torrent deleted.
 *
 * This tests cancelRedundantSiblingDownloads() specifically for the two-releases
 * same-single-target case, which is the exact scenario caused by multi-grab spam.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, updateSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertRelease } from '@/server/db/releases';
import { insertDownload, getDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import type * as QbtModuleType from '@/server/integrations/qbittorrent';

// Spy on deleteTorrent.
const { deleteTorrentMock } = vi.hoisted(() => ({ deleteTorrentMock: vi.fn(async () => {}) }));
vi.mock('@/server/integrations/qbittorrent', async () => {
  const actual = await vi.importActual<typeof QbtModuleType>('@/server/integrations/qbittorrent');
  return { ...actual, deleteTorrent: deleteTorrentMock };
});

import { cancelRedundantSiblingDownloads } from '@/server/importer/cancel-redundant';

const QBT_CFG = {
  host: 'qbt.local',
  port: 8080,
  username: 'u',
  password: 'p',
  useHttps: false as const,
};

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  deleteTorrentMock.mockClear();
});
afterEach(() => h.cleanup());

async function makeSeriesWithOwnedVolume(vol: number): Promise<number> {
  const seriesId = await insertSeries({
    anilistId: Math.floor(Math.random() * 1_000_000) + 2000,
    status: 'finished',
    rootPath: `/media/manga/Siblings-${Math.random()}`,
    qualityProfileId: h.qpId,
    titleEnglish: 'Siblings Series',
  });
  await updateSeries(seriesId, { granularity: 'volume', totalVolumes: 1 });
  const volumeId = await insertVolume({ seriesId, number: vol });
  await getDb()
    .insert(libraryFiles)
    .values({
      seriesId,
      volumeId,
      chapterId: null,
      path: `/media/manga/${seriesId}/v${vol}.cbz`,
      sizeBytes: 100,
      hashSha1: null,
      sourceReleaseId: null,
    });
  return seriesId;
}

async function makeDownloadForVolume(
  seriesId: number,
  vol: number,
  status: 'queued' | 'downloading' | 'completed' | 'importing' | 'imported',
  hash: string,
): Promise<number> {
  const guid = `sib-${Math.random().toString(36).slice(2)}`;
  const releaseId = await insertRelease({
    seriesId,
    indexerId: h.indexerId,
    indexerGuid: guid,
    title: `Vol ${vol} Release`,
    link: `magnet:?xt=urn:btih:${guid}`,
    targetKind: 'volume',
    targetLow: vol,
    targetHigh: vol,
    sizeBytes: 100_000_000,
    seeders: 5,
    publishedAt: new Date(),
  });
  return insertDownload({ releaseId, qbtHash: hash, status });
}

describe('cancel-siblings: two grabs for same single-target series, one finishes', () => {
  it('supersedes the sibling queued download and deletes its torrent when one finishes', async () => {
    await qbtConnectionSetting.set(QBT_CFG);
    // Both grabs for vol 1; the import just landed.
    const seriesId = await makeSeriesWithOwnedVolume(1);

    const importedDownloadId = await makeDownloadForVolume(
      seriesId,
      1,
      'imported',
      'finished-hash',
    );
    const siblingId = await makeDownloadForVolume(seriesId, 1, 'queued', 'sibling-hash');

    const res = await cancelRedundantSiblingDownloads(importedDownloadId, seriesId);

    expect(res).toEqual({ superseded: 1 });
    expect((await getDownload(siblingId))?.status).toBe('superseded');
    expect(deleteTorrentMock).toHaveBeenCalledOnce();
    expect(deleteTorrentMock).toHaveBeenCalledWith(expect.anything(), 'sibling-hash', {
      deleteFiles: true,
    });
    expect((await getDownload(importedDownloadId))?.status).toBe('imported');
  });

  it('supersedes a downloading sibling when one finishes', async () => {
    await qbtConnectionSetting.set(QBT_CFG);
    const seriesId = await makeSeriesWithOwnedVolume(1);

    const importedDownloadId = await makeDownloadForVolume(
      seriesId,
      1,
      'imported',
      'finished-hash-2',
    );
    const siblingId = await makeDownloadForVolume(seriesId, 1, 'downloading', 'sibling-hash-2');

    const res = await cancelRedundantSiblingDownloads(importedDownloadId, seriesId);

    expect(res).toEqual({ superseded: 1 });
    expect((await getDownload(siblingId))?.status).toBe('superseded');
    expect(deleteTorrentMock).toHaveBeenCalledOnce();
  });

  it('supersedes a completed-but-not-imported sibling when one finishes', async () => {
    await qbtConnectionSetting.set(QBT_CFG);
    const seriesId = await makeSeriesWithOwnedVolume(1);

    const importedDownloadId = await makeDownloadForVolume(
      seriesId,
      1,
      'imported',
      'finished-hash-3',
    );
    const siblingId = await makeDownloadForVolume(seriesId, 1, 'completed', 'sibling-hash-3');

    const res = await cancelRedundantSiblingDownloads(importedDownloadId, seriesId);

    expect(res).toEqual({ superseded: 1 });
    expect((await getDownload(siblingId))?.status).toBe('superseded');
  });

  it('supersedes multiple siblings (e.g. 3 grabs happened — 2 are now redundant)', async () => {
    await qbtConnectionSetting.set(QBT_CFG);
    const seriesId = await makeSeriesWithOwnedVolume(1);

    const importedId = await makeDownloadForVolume(seriesId, 1, 'imported', 'finished-hash-4');
    const sib1 = await makeDownloadForVolume(seriesId, 1, 'queued', 'sibling-hash-4a');
    const sib2 = await makeDownloadForVolume(seriesId, 1, 'downloading', 'sibling-hash-4b');

    const res = await cancelRedundantSiblingDownloads(importedId, seriesId);

    expect(res).toEqual({ superseded: 2 });
    expect((await getDownload(sib1))?.status).toBe('superseded');
    expect((await getDownload(sib2))?.status).toBe('superseded');
    expect(deleteTorrentMock).toHaveBeenCalledTimes(2);
  });

  it('does not supersede a sibling that covers an unowned volume (different from imported)', async () => {
    await qbtConnectionSetting.set(QBT_CFG);
    // 2-volume series: only vol 1 is owned.
    const seriesId = await insertSeries({
      anilistId: Math.floor(Math.random() * 1_000_000) + 3000,
      status: 'releasing',
      rootPath: `/media/manga/SibPart-${Math.random()}`,
      qualityProfileId: h.qpId,
      titleEnglish: 'SibPart Series',
    });
    await updateSeries(seriesId, { granularity: 'volume', totalVolumes: 2 });
    // Own vol 1 only.
    const volumeId = await insertVolume({ seriesId, number: 1 });
    await getDb().insert(libraryFiles).values({
      seriesId,
      volumeId,
      chapterId: null,
      path: `/media/manga/${seriesId}/v1.cbz`,
      sizeBytes: 100,
      hashSha1: null,
      sourceReleaseId: null,
    });

    const importedId = await makeDownloadForVolume(seriesId, 1, 'imported', 'fin-hash-5');
    // A batch download covering v1-v2: still covers unowned v2 → must NOT be superseded.
    const batchGuid = `sib-batch-${Math.random().toString(36).slice(2)}`;
    const batchReleaseId = await insertRelease({
      seriesId,
      indexerId: h.indexerId,
      indexerGuid: batchGuid,
      title: 'Vol 1-2 Batch',
      link: `magnet:?xt=urn:btih:${batchGuid}`,
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 2,
      sizeBytes: 200_000_000,
      seeders: 5,
      publishedAt: new Date(),
    });
    const batchId = await insertDownload({
      releaseId: batchReleaseId,
      qbtHash: 'batch-hash-5',
      status: 'downloading',
    });

    const res = await cancelRedundantSiblingDownloads(importedId, seriesId);

    expect(res).toEqual({ superseded: 0 });
    expect((await getDownload(batchId))?.status).toBe('downloading');
    expect(deleteTorrentMock).not.toHaveBeenCalled();
  });
});

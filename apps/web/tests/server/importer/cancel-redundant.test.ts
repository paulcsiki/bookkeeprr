import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import { insertSeries, updateSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertChapter } from '@/server/db/chapters';
import { insertRelease } from '@/server/db/releases';
import { insertDownload, getDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import type * as QbtModuleType from '@/server/integrations/qbittorrent';

// Spy on deleteTorrent so the redundancy sweep never touches a real qbt.
const { deleteTorrentMock } = vi.hoisted(() => ({ deleteTorrentMock: vi.fn(async () => {}) }));
vi.mock('@/server/integrations/qbittorrent', async () => {
  const actual = await vi.importActual<typeof QbtModuleType>('@/server/integrations/qbittorrent');
  return { ...actual, deleteTorrent: deleteTorrentMock };
});

import { cancelRedundantSiblingDownloads } from '@/server/importer/cancel-redundant';

let h: SeedHandle;

const QBT_CFG = {
  host: 'qbt.local',
  port: 8080,
  username: 'u',
  password: 'p',
  useHttps: false,
};

async function configureQbt(): Promise<void> {
  await qbtConnectionSetting.set(QBT_CFG);
}

async function makeSeries(opts: {
  granularity?: 'volume' | 'chapter';
  totalVolumes?: number | null;
}): Promise<number> {
  const seriesId = await insertSeries({
    anilistId: Math.floor(Math.random() * 1_000_000) + 1000,
    status: 'releasing',
    rootPath: `/media/comics/Redundant-${Math.random()}`,
    qualityProfileId: h.qpId,
    titleEnglish: 'Redundant Series',
  });
  await updateSeries(seriesId, {
    granularity: opts.granularity ?? 'volume',
    totalVolumes: opts.totalVolumes ?? null,
  });
  return seriesId;
}

async function ownVolume(seriesId: number, number: number): Promise<void> {
  const volumeId = await insertVolume({ seriesId, number });
  await getDb()
    .insert(libraryFiles)
    .values({
      seriesId,
      volumeId,
      chapterId: null,
      path: `/media/comics/${seriesId}/v${number}.cbz`,
      sizeBytes: 100,
      hashSha1: null,
      sourceReleaseId: null,
    });
}

async function ownChapter(seriesId: number, numberSort: number): Promise<void> {
  const chapterId = await insertChapter({
    seriesId,
    numberText: String(numberSort),
    numberSort,
    title: `Chapter ${numberSort}`,
  });
  await getDb()
    .insert(libraryFiles)
    .values({
      seriesId,
      volumeId: null,
      chapterId,
      path: `/media/comics/${seriesId}/c${numberSort}.cbz`,
      sizeBytes: 100,
      hashSha1: null,
      sourceReleaseId: null,
    });
}

async function makeDownload(opts: {
  seriesId: number;
  targetKind: 'volume' | 'chapter' | 'batch';
  targetLow: number | null;
  targetHigh: number | null;
  status?: 'queued' | 'downloading' | 'completed' | 'importing' | 'imported';
  hash?: string;
}): Promise<number> {
  const guid = `rdt-${Math.random().toString(36).slice(2)}`;
  const releaseId = await insertRelease({
    seriesId: opts.seriesId,
    indexerId: h.indexerId,
    indexerGuid: guid,
    title: 'Redundant Release [Grp]',
    link: `magnet:?xt=urn:btih:${guid}`,
    targetKind: opts.targetKind,
    targetLow: opts.targetLow,
    targetHigh: opts.targetHigh,
    sizeBytes: 100_000_000,
    seeders: 5,
    publishedAt: new Date(),
  });
  return insertDownload({
    releaseId,
    qbtHash: opts.hash ?? `hash-${Math.random().toString(36).slice(2)}`,
    status: opts.status ?? 'queued',
  });
}

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  deleteTorrentMock.mockClear();
});
afterEach(() => h.cleanup());

describe('cancelRedundantSiblingDownloads', () => {
  it('supersedes a single-volume sibling whose volume is now owned + deletes its torrent', async () => {
    await configureQbt();
    const seriesId = await makeSeries({ totalVolumes: 5 });
    await ownVolume(seriesId, 1); // imported just landed v1

    const importedId = await makeDownload({
      seriesId,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      status: 'imported',
      hash: 'imported-hash',
    });
    const siblingId = await makeDownload({
      seriesId,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      status: 'queued',
      hash: 'sibling-hash',
    });

    const res = await cancelRedundantSiblingDownloads(importedId, seriesId);

    expect(res).toEqual({ superseded: 1 });
    expect((await getDownload(siblingId))?.status).toBe('superseded');
    expect(deleteTorrentMock).toHaveBeenCalledTimes(1);
    expect(deleteTorrentMock).toHaveBeenCalledWith(
      expect.anything(),
      'sibling-hash',
      { deleteFiles: true },
    );
    // imported download untouched
    expect((await getDownload(importedId))?.status).toBe('imported');
  });

  it('spares a batch still covering an unowned volume', async () => {
    await configureQbt();
    const seriesId = await makeSeries({ totalVolumes: 3 });
    await ownVolume(seriesId, 1);

    const importedId = await makeDownload({
      seriesId,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      status: 'imported',
    });
    // batch v1-3: covers owned v1 but also unowned v2,v3 → spare
    const batchId = await makeDownload({
      seriesId,
      targetKind: 'batch',
      targetLow: 1,
      targetHigh: 3,
      status: 'downloading',
      hash: 'batch-hash',
    });

    const res = await cancelRedundantSiblingDownloads(importedId, seriesId);

    expect(res).toEqual({ superseded: 0 });
    expect((await getDownload(batchId))?.status).toBe('downloading');
    expect(deleteTorrentMock).not.toHaveBeenCalled();
  });

  it('never selects an importing sibling or the imported download itself', async () => {
    await configureQbt();
    const seriesId = await makeSeries({ totalVolumes: 2 });
    await ownVolume(seriesId, 1);

    const importedId = await makeDownload({
      seriesId,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      status: 'imported',
    });
    // an importing sibling for the same (owned) volume — must not be touched
    const importingId = await makeDownload({
      seriesId,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      status: 'importing',
    });

    const res = await cancelRedundantSiblingDownloads(importedId, seriesId);

    expect(res).toEqual({ superseded: 0 });
    expect((await getDownload(importingId))?.status).toBe('importing');
    expect((await getDownload(importedId))?.status).toBe('imported');
    expect(deleteTorrentMock).not.toHaveBeenCalled();
  });

  it('supersedes a redundant chapter-granularity sibling', async () => {
    await configureQbt();
    const seriesId = await makeSeries({ granularity: 'chapter' });
    await ownChapter(seriesId, 10); // chapter 10 now owned

    const importedId = await makeDownload({
      seriesId,
      targetKind: 'chapter',
      targetLow: 10,
      targetHigh: 10,
      status: 'imported',
    });
    const siblingId = await makeDownload({
      seriesId,
      targetKind: 'chapter',
      targetLow: 10,
      targetHigh: 10,
      status: 'completed',
      hash: 'chap-hash',
    });

    const res = await cancelRedundantSiblingDownloads(importedId, seriesId);

    expect(res).toEqual({ superseded: 1 });
    expect((await getDownload(siblingId))?.status).toBe('superseded');
    expect(deleteTorrentMock).toHaveBeenCalledWith(
      expect.anything(),
      'chap-hash',
      { deleteFiles: true },
    );
  });

  it('marks superseded without deleting when qBt is unconfigured (no throw)', async () => {
    // qbt NOT configured
    const seriesId = await makeSeries({ totalVolumes: 1 });
    await ownVolume(seriesId, 1);

    const importedId = await makeDownload({
      seriesId,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      status: 'imported',
    });
    const siblingId = await makeDownload({
      seriesId,
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      status: 'queued',
    });

    const res = await cancelRedundantSiblingDownloads(importedId, seriesId);

    expect(res).toEqual({ superseded: 1 });
    expect((await getDownload(siblingId))?.status).toBe('superseded');
    expect(deleteTorrentMock).not.toHaveBeenCalled();
  });

  it('returns {superseded:0} for an unknown series', async () => {
    const res = await cancelRedundantSiblingDownloads(1, 999999);
    expect(res).toEqual({ superseded: 0 });
  });
});

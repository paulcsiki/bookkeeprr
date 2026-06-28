/**
 * TDD tests for stall-detection in qbt-watch.
 *
 * Stall rule: a download is `downloading`, dlspeed=0, completed bytes unchanged
 * vs stored bytesDownloaded, AND now-lastProgressAt >= 5min. On stall: mark
 * failed (error 'stalled-5m'), delete torrent from qBittorrent.
 *
 * A download that still progresses (completed bytes increased) must NOT be failed.
 * A download that is fresh (lastProgressAt < 5 min ago) must NOT be failed even
 * if dlspeed=0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload, getDownload } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { qbtWatchDescriptor } from '@/server/jobs/kinds/qbt-watch';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { getDb } from '@/server/db/client';
import { downloads } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import type * as QbtModuleType from '@/server/integrations/qbittorrent';

// Spy on deleteTorrent so we never call real qBittorrent.
const { deleteTorrentMock } = vi.hoisted(() => ({ deleteTorrentMock: vi.fn(async () => {}) }));
vi.mock('@/server/integrations/qbittorrent', async () => {
  const actual = await vi.importActual<typeof QbtModuleType>('@/server/integrations/qbittorrent');
  return { ...actual, deleteTorrent: deleteTorrentMock };
});

let h: SeedHandle;
let releaseId: number;

const QBT_CFG = {
  host: 'x',
  port: 1,
  username: 'u',
  password: 'p',
  useHttps: false as const,
};

/** Helper: a qBit list response with a single torrent at 0% progress, dlspeed=0. */
function mockQbtStalled(hash: string, completedBytes: number): void {
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    return {
      ok: true,
      status: 200,
      headers: {},
      text: async () =>
        JSON.stringify([
          {
            hash,
            name: 'x',
            state: 'downloading',
            progress: completedBytes / 1_000_000,
            category: 'bookkeeprr-manga',
            tags: '',
            save_path: '/x',
            size: 1_000_000,
            completed: completedBytes,
            dlspeed: 0,
          },
        ]),
    };
  });
}

/** Helper: a qBit list response where the torrent has active throughput. */
function mockQbtProgressing(hash: string, completedBytes: number): void {
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    return {
      ok: true,
      status: 200,
      headers: {},
      text: async () =>
        JSON.stringify([
          {
            hash,
            name: 'x',
            state: 'downloading',
            progress: completedBytes / 1_000_000,
            category: 'bookkeeprr-manga',
            tags: '',
            save_path: '/x',
            size: 1_000_000,
            completed: completedBytes,
            dlspeed: 5000,
          },
        ]),
    };
  });
}

async function backdateLastProgressAt(downloadId: number, msAgo: number): Promise<void> {
  await getDb()
    .update(downloads)
    .set({ lastProgressAt: new Date(Date.now() - msAgo) })
    .where(eq(downloads.id, downloadId));
}

beforeEach(async () => {
  h = await seedDb();
  await qbtConnectionSetting.set(QBT_CFG);
  releaseId = await upsertReleaseByGuid({
    indexerId: 1,
    indexerGuid: 'stall-g1',
    seriesId: h.seriesId,
    title: 'Stall Test',
    link: 'magnet:?xt=urn:btih:stallhash',
    targetKind: 'volume',
    targetLow: 1,
    targetHigh: 1,
    sizeBytes: 1_000_000,
    publishedAt: new Date(),
  });
  __resetQbtForTests();
  deleteTorrentMock.mockClear();
});

afterEach(() => h.cleanup());

describe('qbt_watch — stall detection', () => {
  it('marks a download failed and deletes the torrent when stalled for 5+ minutes', async () => {
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'stallhash',
      status: 'downloading',
    });
    // Set bytesDownloaded=0 in DB (already default); set lastProgressAt to 6 minutes ago.
    await backdateLastProgressAt(downloadId, 6 * 60 * 1000);

    // qBit reports 0 completed bytes and dlspeed=0 — stalled.
    mockQbtStalled('stallhash', 0);

    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);

    const row = await getDownload(downloadId);
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('stalled-5m');
    expect(deleteTorrentMock).toHaveBeenCalledOnce();
    expect(deleteTorrentMock).toHaveBeenCalledWith(expect.anything(), 'stallhash', {
      deleteFiles: true,
    });
  });

  it('does NOT fail a download that is still progressing (completed bytes increased)', async () => {
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'stallhash',
      status: 'downloading',
    });
    // Backdate lastProgressAt to 8 minutes ago — but qBit now reports MORE bytes.
    await backdateLastProgressAt(downloadId, 8 * 60 * 1000);
    // Set stored bytesDownloaded to 100 so qBit's 200 bytes = progress.
    await getDb()
      .update(downloads)
      .set({ bytesDownloaded: 100 })
      .where(eq(downloads.id, downloadId));

    // qBit reports 200 completed bytes (progressed from 100).
    mockQbtStalled('stallhash', 200); // dlspeed=0 but completed grew

    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);

    const row = await getDownload(downloadId);
    // Should update bytesDownloaded and lastProgressAt, not fail.
    expect(row?.status).toBe('downloading');
    expect(row?.bytesDownloaded).toBe(200);
    expect(deleteTorrentMock).not.toHaveBeenCalled();
  });

  it('does NOT fail a freshly-added downloading torrent even with 0 bytes (within 5 min window)', async () => {
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'stallhash',
      status: 'downloading',
    });
    // lastProgressAt defaults to now (< 5 min ago) — fresh download, no stall.

    mockQbtStalled('stallhash', 0);

    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);

    const row = await getDownload(downloadId);
    expect(row?.status).toBe('downloading');
    expect(deleteTorrentMock).not.toHaveBeenCalled();
  });

  it('updates bytesDownloaded and lastProgressAt when a downloading torrent makes progress', async () => {
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'stallhash',
      status: 'downloading',
    });
    // No bytes stored yet; backdating is not needed — just check the update path.
    const before = await getDownload(downloadId);
    expect(before?.bytesDownloaded).toBe(0);

    mockQbtProgressing('stallhash', 50_000);

    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);

    const row = await getDownload(downloadId);
    expect(row?.status).toBe('downloading');
    expect(row?.bytesDownloaded).toBe(50_000);
    expect(row?.lastProgressAt).not.toBeNull();
    expect(deleteTorrentMock).not.toHaveBeenCalled();
  });
});

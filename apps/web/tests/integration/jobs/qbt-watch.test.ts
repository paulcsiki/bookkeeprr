import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { upsertReleaseByGuid } from '@/server/db/releases';
import { insertDownload, getDownload } from '@/server/db/downloads';
import { insertSeries } from '@/server/db/series';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { contentTypePathsSetting } from '@/server/db/settings/library';
import { qbtWatchDescriptor } from '@/server/jobs/kinds/qbt-watch';
import { enqueueJob, listJobsByKind } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';

let h: SeedHandle;
let releaseId: number;

beforeEach(async () => {
  h = await seedDb();
  await seedDefaultIndexer();
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
  });
  __resetQbtForTests();
});

afterEach(() => h.cleanup());

const LIST_OK = (hash: string, state: string, progress: number) =>
  JSON.stringify([
    {
      hash,
      name: 'x',
      state,
      progress,
      category: 'bookkeeprr-manga',
      tags: '',
      save_path: '/x',
      size: 100,
      completed: 100 * progress,
    },
  ]);

function mockQbt(listBody: string): void {
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    return { ok: true, status: 200, headers: {}, text: async () => listBody };
  });
}

describe('qbt_watch job', () => {
  it('no-op when qbt not configured', async () => {
    let called = false;
    __setQbtFetcherForTests(async () => {
      called = true;
      return { ok: true, status: 200, headers: {}, text: async () => '' };
    });
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    expect(called).toBe(false);
  });

  it('updates status downloading→completed and enqueues import', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'abc123',
      status: 'downloading',
    });
    mockQbt(LIST_OK('abc123', 'stalledUP', 1.0));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    const row = await getDownload(downloadId);
    expect(row?.status).toBe('completed');
    const imports = await listJobsByKind('import');
    expect(imports.length).toBeGreaterThan(0);
  });

  it('does not re-enqueue import if status already imported', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    await insertDownload({ releaseId, qbtHash: 'abc123', status: 'imported' });
    mockQbt(LIST_OK('abc123', 'pausedUP', 1.0));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    const imports = await listJobsByKind('import');
    expect(imports).toHaveLength(0);
  });

  it('does NOT enqueue a second import when one is already pending for the download', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'abc123',
      status: 'downloading',
    });
    // A prior watch tick (or an outage-driven flap) already queued the import.
    await enqueueJob('import', { downloadId });
    mockQbt(LIST_OK('abc123', 'stalledUP', 1.0));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    const row = await getDownload(downloadId);
    expect(row?.status).toBe('completed');
    // Still exactly one import job — no duplicate.
    const imports = await listJobsByKind('import');
    expect(imports).toHaveLength(1);
  });

  it('maps error/missingFiles → failed', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'abc123',
      status: 'downloading',
    });
    mockQbt(LIST_OK('abc123', 'error', 0.5));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    const row = await getDownload(downloadId);
    expect(row?.status).toBe('failed');
  });

  // Regression: qBit can report state='error' for WebSeed-only torrents
  // (tracker returns no peers, all bytes came from the WebSeed URL) even
  // though progress=1 and the file is on disk. The state mapping must treat
  // progress as authoritative — bytes-on-disk trumps tracker errors.
  it('state=error with progress=1.0 → completed (not failed)', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    const downloadId = await insertDownload({
      releaseId,
      qbtHash: 'abc123',
      status: 'downloading',
    });
    mockQbt(LIST_OK('abc123', 'error', 1.0));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    const row = await getDownload(downloadId);
    expect(row?.status).toBe('completed');
    const imports = await listJobsByKind('import');
    expect(imports.length).toBeGreaterThan(0);
  });

  it('ignores torrents not in our downloads', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    mockQbt(LIST_OK('unknown-hash', 'downloading', 0.5));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    // No-op; no errors
    expect(true).toBe(true);
  });
});

describe('qbt_watch — multi-category', () => {
  it('with no pending downloads: zero qBT category calls', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    let listCallCount = 0;
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
        listCallCount++;
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    expect(listCallCount).toBe(0);
  });

  it('with multiple content types pending: one list call per type', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    // Create an ebook series + release + pending download
    const ebookSeriesId = await insertSeries({
      contentType: 'ebook',
      anilistId: null,
      status: 'finished',
      rootPath: '/media/books/E',
      qualityProfileId: h.qpId,
    });
    const ebookReleaseId = await upsertReleaseByGuid({
      indexerId: 1,
      indexerGuid: 'eb1',
      seriesId: ebookSeriesId,
      title: 'Eb',
      link: 'magnet:?xt=urn:btih:b',
      targetKind: 'volume',
      targetLow: 1,
      targetHigh: 1,
      sizeBytes: 0,
      publishedAt: new Date(),
    });
    await insertDownload({ releaseId: ebookReleaseId, qbtHash: 'ebhash', status: 'downloading' });
    // Manga download from the beforeEach releaseId
    await insertDownload({ releaseId, qbtHash: 'mhash', status: 'downloading' });

    const calledCategories: string[] = [];
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
        const u = new URL(url);
        const cat = u.searchParams.get('category');
        if (cat) calledCategories.push(cat);
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);

    expect(calledCategories.sort()).toEqual(['bookkeeprr-ebook', 'bookkeeprr-manga']);
  });

  it('uses the configured per-type category in the list', async () => {
    await qbtConnectionSetting.set({
      host: 'x',
      port: 1,
      username: 'u',
      password: 'p',
      useHttps: false,
    });
    await contentTypePathsSetting.set({
      manga: { libraryRoot: '', qbtCategory: 'my-manga' },
      comic: { libraryRoot: '', qbtCategory: '' },
      light_novel: { libraryRoot: '', qbtCategory: '' },
      ebook: { libraryRoot: '', qbtCategory: '' },
      audiobook: { libraryRoot: '', qbtCategory: '' },
    });
    await insertDownload({ releaseId, qbtHash: 'mhash', status: 'downloading' });

    const calledCategories: string[] = [];
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
        const cat = new URL(url).searchParams.get('category');
        if (cat) calledCategories.push(cat);
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);

    expect(calledCategories).toEqual(['my-manga']);
  });

  it('marks a pending download failed when its torrent vanished (past grace)', async () => {
    await qbtConnectionSetting.set({ host: 'x', port: 1, username: 'u', password: 'p', useHttps: false });
    const downloadId = await insertDownload({ releaseId, qbtHash: 'gone999', status: 'queued' });
    // Backdate addedAt past the 10-minute grace window.
    const { getDb } = await import('@/server/db/client');
    const { downloads } = await import('@/server/db/schema');
    const { eq } = await import('drizzle-orm');
    await getDb()
      .update(downloads)
      .set({ addedAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(downloads.id, downloadId));
    // qBit lists a different torrent — ours is absent.
    mockQbt(LIST_OK('someoneelse', 'downloading', 0.5));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    const row = await getDownload(downloadId);
    expect(row?.status).toBe('failed');
    expect(row?.error).toMatch(/missing/i);
  });

  it('does NOT fail a freshly-added pending download whose torrent is not yet visible', async () => {
    await qbtConnectionSetting.set({ host: 'x', port: 1, username: 'u', password: 'p', useHttps: false });
    const downloadId = await insertDownload({ releaseId, qbtHash: 'fresh999', status: 'queued' });
    mockQbt(LIST_OK('someoneelse', 'downloading', 0.5));
    await enqueueJob('qbt_watch', {});
    await runOnce(qbtWatchDescriptor);
    const row = await getDownload(downloadId);
    expect(row?.status).toBe('queued'); // within grace — left alone
  });
});

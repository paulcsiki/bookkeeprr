import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { seedDefaultIndexer } from '@/server/db/indexers';
import { listDownloadsByRelease } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { __setNyaaFetcherForTests, __resetNyaaForTests } from '@/server/integrations/nyaa/client';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';
import { indexerPollDescriptor } from '@/server/jobs/kinds/indexer-poll';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { updateSeries } from '@/server/db/series';

const NYAA_HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RSS = (items: string) =>
  `<?xml version="1.0"?><rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0"><channel>${items}</channel></rss>`;
const ITEM = (title: string, guid: string) => `
  <item>
    <title>${title}</title>
    <link>magnet:?xt=urn:btih:${NYAA_HASH}</link>
    <guid isPermaLink="true">https://nyaa.si/view/${guid}</guid>
    <pubDate>Mon, 22 May 2026 12:00:00 +0000</pubDate>
    <nyaa:seeders>50</nyaa:seeders>
    <nyaa:leechers>1</nyaa:leechers>
    <nyaa:downloads>100</nyaa:downloads>
    <nyaa:infoHash>${NYAA_HASH}</nyaa:infoHash>
    <nyaa:categoryId>3_1</nyaa:categoryId>
    <nyaa:size>100 MiB</nyaa:size>
    <nyaa:comments>0</nyaa:comments>
    <nyaa:trusted>No</nyaa:trusted>
    <nyaa:remake>No</nyaa:remake>
  </item>`;

function mockQbtHappy(): void {
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return {
        ok: true,
        status: 200,
        headers: { 'set-cookie': 'SID=abc' },
        text: async () => 'Ok.',
      };
    }
    if (url.endsWith('/torrents/add')) {
      return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
    }
    if (url.includes('/torrents/info')) {
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          JSON.stringify([
            {
              hash: NYAA_HASH,
              name: 'x',
              state: 'downloading',
              progress: 0,
              category: 'bookkeeprr-manga',
              tags: '',
              save_path: '/x',
              size: 0,
              completed: 0,
            },
          ]),
      };
    }
    throw new Error(`unexpected ${url}`);
  });
}

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ rootPath: '/media/comics/Test Series' });
  await seedDefaultIndexer();
  await qbtConnectionSetting.set({
    host: 'x',
    port: 1,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
  // Series with totalVolumes set so unowned set is non-empty
  await updateSeries(h.seriesId, { totalVolumes: 1 });
  __resetNyaaForTests();
  __resetQbtForTests();
});
afterEach(() => h.cleanup());

describe('auto-grab via indexer_poll', () => {
  it('grabs a matched release when series is monitored=all', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM('[Group] Test Series v01', '111')),
    }));
    mockQbtHappy();

    await enqueueJob('indexer_poll', { indexerId: 1 });
    await runOnce(indexerPollDescriptor);

    // Find the upserted release; assert a downloads row exists for it
    const { listReleasesBySeries } = await import('@/server/db/releases');
    const releases = await listReleasesBySeries(h.seriesId);
    expect(releases.length).toBeGreaterThan(0);
    const downloads = await listDownloadsByRelease(releases[0]!.id);
    expect(downloads).toHaveLength(1);
  });

  it('does not grab when series monitoring=none', async () => {
    await updateSeries(h.seriesId, { monitoring: 'none' });
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM('[Group] Test Series v01', '222')),
    }));
    let qbtAddCalled = false;
    __setQbtFetcherForTests(async (url) => {
      if (url.endsWith('/torrents/add')) qbtAddCalled = true;
      if (url.endsWith('/api/v2/auth/login')) {
        return {
          ok: true,
          status: 200,
          headers: { 'set-cookie': 'SID=abc' },
          text: async () => 'Ok.',
        };
      }
      return { ok: true, status: 200, headers: {}, text: async () => '[]' };
    });

    await enqueueJob('indexer_poll', { indexerId: 1 });
    await runOnce(indexerPollDescriptor);

    expect(qbtAddCalled).toBe(false);
  });

  it('does not grab when qbt not configured (graceful)', async () => {
    await qbtConnectionSetting.set({
      host: '',
      port: 8080,
      username: '',
      password: '',
      useHttps: false,
    });
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM('[Group] Test Series v01', '333')),
    }));
    let qbtCalled = false;
    __setQbtFetcherForTests(async () => {
      qbtCalled = true;
      return { ok: true, status: 200, headers: {}, text: async () => 'Ok.' };
    });

    await enqueueJob('indexer_poll', { indexerId: 1 });
    await runOnce(indexerPollDescriptor);

    expect(qbtCalled).toBe(false); // grabber returns not-configured before any qbt call
  });

  it('does not re-grab an already-grabbed release', async () => {
    __setNyaaFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => RSS(ITEM('[Group] Test Series v01', '444')),
    }));
    mockQbtHappy();

    await enqueueJob('indexer_poll', { indexerId: 1 });
    await runOnce(indexerPollDescriptor);

    // Run a second cycle (cache may serve same items)
    await enqueueJob('indexer_poll', { indexerId: 1 });
    await runOnce(indexerPollDescriptor);

    const { listReleasesBySeries } = await import('@/server/db/releases');
    const releases = await listReleasesBySeries(h.seriesId);
    const downloads = await listDownloadsByRelease(releases[0]!.id);
    expect(downloads).toHaveLength(1); // not 2
  });
});

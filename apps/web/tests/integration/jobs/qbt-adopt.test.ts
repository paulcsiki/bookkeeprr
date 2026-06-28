import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { listDownloads } from '@/server/db/downloads';
import { qbtConnectionSetting } from '@/server/db/settings/qbt';
import { qbtAdoptDescriptor } from '@/server/jobs/kinds/qbt-adopt';
import { enqueueJob, listJobsByKind } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import {
  __setQbtFetcherForTests,
  __resetQbtForTests,
} from '@/server/integrations/qbittorrent/client';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  __resetQbtForTests();
  await qbtConnectionSetting.set({
    host: 'x',
    port: 1,
    username: 'u',
    password: 'p',
    useHttps: false,
  });
});
afterEach(() => {
  h.cleanup();
  __resetQbtForTests();
});

function torrent(name: string, hash: string) {
  return {
    hash,
    name,
    state: 'stalledUP',
    progress: 1,
    category: 'bookkeeprr-ebook',
    tags: '',
    save_path: '/x',
    size: 5_000_000,
    completed: 5_000_000,
  };
}

/** qBit mock: returns the given ebook-category torrents; [] for every other category. */
function mockQbt(ebookTorrents: ReturnType<typeof torrent>[]): void {
  __setQbtFetcherForTests(async (url) => {
    if (url.endsWith('/api/v2/auth/login')) {
      return { ok: true, status: 200, headers: { 'set-cookie': 'SID=abc' }, text: async () => 'Ok.' };
    }
    const cat = new URL(url).searchParams.get('category');
    const body = cat === 'bookkeeprr-ebook' ? ebookTorrents : [];
    return { ok: true, status: 200, headers: {}, text: async () => JSON.stringify(body) };
  });
}

describe('qbt_adopt job', () => {
  it('adopts a manually-added torrent that matches a series by title', async () => {
    const seriesId = await insertSeries({
      contentType: 'ebook',
      anilistId: 4242,
      status: 'finished',
      rootPath: '/media/books/Atomic Habits',
      qualityProfileId: h.qpId,
      titleEnglish: 'Atomic Habits',
      author: 'James Clear',
      totalVolumes: 1,
    });
    mockQbt([torrent('Atomic Habits by James Clear EPUB', 'adopthash1')]);

    await enqueueJob('qbt_adopt', {});
    await runOnce(qbtAdoptDescriptor);

    const dls = await listDownloads();
    const mine = dls.find((d) => d.qbtHash === 'adopthash1');
    expect(mine).toBeTruthy();
    expect(mine?.status).toBe('completed');
    // a completed adoption enqueues an import
    const imports = await listJobsByKind('import');
    expect(imports.length).toBeGreaterThan(0);
    void seriesId;
  });

  it('leaves an unmatched torrent alone', async () => {
    await insertSeries({
      contentType: 'ebook',
      anilistId: 99,
      status: 'finished',
      rootPath: '/media/books/Atomic Habits',
      qualityProfileId: h.qpId,
      titleEnglish: 'Atomic Habits',
      author: 'James Clear',
      totalVolumes: 1,
    });
    mockQbt([torrent('Some Completely Unrelated Book by Nobody', 'adopthash2')]);

    await enqueueJob('qbt_adopt', {});
    await runOnce(qbtAdoptDescriptor);

    const dls = await listDownloads();
    expect(dls.find((d) => d.qbtHash === 'adopthash2')).toBeUndefined();
  });

  it('does not re-adopt a torrent that already has a download row', async () => {
    const seriesId = await insertSeries({
      contentType: 'ebook',
      anilistId: 7,
      status: 'finished',
      rootPath: '/media/books/Atomic Habits',
      qualityProfileId: h.qpId,
      titleEnglish: 'Atomic Habits',
      author: 'James Clear',
      totalVolumes: 1,
    });
    mockQbt([torrent('Atomic Habits by James Clear EPUB', 'adopthash3')]);

    await enqueueJob('qbt_adopt', {});
    await runOnce(qbtAdoptDescriptor);
    await enqueueJob('qbt_adopt', {});
    await runOnce(qbtAdoptDescriptor);

    const dls = (await listDownloads()).filter((d) => d.qbtHash === 'adopthash3');
    expect(dls).toHaveLength(1); // not duplicated
    void seriesId;
  });
});

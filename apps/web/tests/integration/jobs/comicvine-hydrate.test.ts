import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';
import { listChaptersBySeries } from '@/server/db/chapters';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { comicvineHydrateDescriptor } from '@/server/jobs/kinds/comicvine-hydrate';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import {
  __setComicVineFetcherForTests,
  __resetComicVineForTests,
} from '@/server/integrations/comicvine/client';

const F = (n: string) => readFileSync(join(process.cwd(), 'tests/fixtures/comicvine', n), 'utf-8');

let h: SeedHandle;
let comicSeriesId: number;

beforeEach(async () => {
  h = await seedDb();
  comicSeriesId = await insertSeries({
    contentType: 'comic',
    anilistId: null,
    comicvineId: 18847,
    publisher: 'DC Comics',
    startYear: 1986,
    titleEnglish: 'Watchmen',
    status: 'finished',
    rootPath: '/media/comics/DC Comics/Watchmen (1986)',
    qualityProfileId: h.qpId,
    granularity: 'chapter',
  });
  __resetComicVineForTests();
});
afterEach(() => h.cleanup());

describe('comicvine_hydrate', () => {
  it('happy path: hydrates issues paginated', async () => {
    await comicVineApiKeySetting.set('TESTKEY');
    __setComicVineFetcherForTests(async (url) => {
      const u = new URL(url);
      const offset = parseInt(u.searchParams.get('offset') ?? '0', 10);
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          offset === 0 ? F('issues-watchmen-page1.json') : F('issues-watchmen-page2.json'),
      };
    });
    await enqueueJob('comicvine_hydrate', { seriesId: comicSeriesId });
    await runOnce(comicvineHydrateDescriptor);

    const chapters = await listChaptersBySeries(comicSeriesId);
    expect(chapters).toHaveLength(8);
    // numbers preserved as strings
    expect(chapters.some((c) => c.numberText === '0.5')).toBe(true);
    expect(chapters.some((c) => c.numberText === 'Annual 1')).toBe(true);

    const series = await getSeries(comicSeriesId);
    expect(series?.totalChapters).toBe(8);
  });

  it('throws when comicvineId is null', async () => {
    await comicVineApiKeySetting.set('TESTKEY');
    const noCvId = await insertSeries({
      contentType: 'comic',
      anilistId: null,
      comicvineId: null,
      titleEnglish: 'X',
      status: 'releasing',
      rootPath: '/x',
      qualityProfileId: h.qpId,
      granularity: 'chapter',
    });
    await enqueueJob('comicvine_hydrate', { seriesId: noCvId });
    await runOnce(comicvineHydrateDescriptor);

    const chapters = await listChaptersBySeries(noCvId);
    expect(chapters).toHaveLength(0);
    // Job recorded an error; we just verify no chapters were created.
  });

  it('throws when api key empty', async () => {
    await comicVineApiKeySetting.set('');
    __setComicVineFetcherForTests(async () => {
      throw new Error('should not be called');
    });
    await enqueueJob('comicvine_hydrate', { seriesId: comicSeriesId });
    await runOnce(comicvineHydrateDescriptor);

    const chapters = await listChaptersBySeries(comicSeriesId);
    expect(chapters).toHaveLength(0);
  });

  it('idempotent re-run does not duplicate', async () => {
    await comicVineApiKeySetting.set('TESTKEY');
    __setComicVineFetcherForTests(async (url) => {
      const u = new URL(url);
      const offset = parseInt(u.searchParams.get('offset') ?? '0', 10);
      return {
        ok: true,
        status: 200,
        headers: {},
        text: async () =>
          offset === 0 ? F('issues-watchmen-page1.json') : F('issues-watchmen-page2.json'),
      };
    });
    await enqueueJob('comicvine_hydrate', { seriesId: comicSeriesId });
    await runOnce(comicvineHydrateDescriptor);
    await enqueueJob('comicvine_hydrate', { seriesId: comicSeriesId });
    await runOnce(comicvineHydrateDescriptor);

    const chapters = await listChaptersBySeries(comicSeriesId);
    expect(chapters).toHaveLength(8);
  });

  it('returns zero counts when series is not a comic', async () => {
    await comicVineApiKeySetting.set('TESTKEY');
    __setComicVineFetcherForTests(async () => {
      throw new Error('should not be called for manga series');
    });
    await enqueueJob('comicvine_hydrate', { seriesId: h.seriesId }); // manga from seed
    await runOnce(comicvineHydrateDescriptor);

    const chapters = await listChaptersBySeries(h.seriesId);
    // Only the seeded chapter exists — no new ones added by this job
    expect(chapters).toHaveLength(1);
  });
});

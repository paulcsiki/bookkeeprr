import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('series DAL — comic fields', () => {
  it('insertSeries accepts comic fields', async () => {
    const id = await insertSeries({
      contentType: 'comic',
      anilistId: null,
      comicvineId: 4242,
      publisher: 'DC Comics',
      startYear: 1986,
      titleEnglish: 'Watchmen',
      status: 'finished',
      rootPath: '/media/comics/DC Comics/Watchmen (1986)',
      qualityProfileId: h.qpId,
      granularity: 'chapter',
    });
    const row = await getSeries(id);
    expect(row?.contentType).toBe('comic');
    expect(row?.comicvineId).toBe(4242);
    expect(row?.publisher).toBe('DC Comics');
    expect(row?.startYear).toBe(1986);
    expect(row?.granularity).toBe('chapter');
  });

  it('comic fields default to null when omitted', async () => {
    const id = await insertSeries({
      anilistId: 9999,
      status: 'releasing',
      rootPath: '/media/comics/M',
      qualityProfileId: h.qpId,
    });
    const row = await getSeries(id);
    expect(row?.contentType).toBe('manga');
    expect(row?.comicvineId).toBeNull();
    expect(row?.publisher).toBeNull();
    expect(row?.startYear).toBeNull();
  });

  it('duplicate comicvine_id throws (UNIQUE)', async () => {
    await insertSeries({
      contentType: 'comic',
      anilistId: null,
      comicvineId: 7777,
      titleEnglish: 'A',
      status: 'releasing',
      rootPath: '/a',
      qualityProfileId: h.qpId,
      granularity: 'chapter',
    });
    await expect(
      insertSeries({
        contentType: 'comic',
        anilistId: null,
        comicvineId: 7777,
        titleEnglish: 'B',
        status: 'releasing',
        rootPath: '/b',
        qualityProfileId: h.qpId,
        granularity: 'chapter',
      }),
    ).rejects.toBeTruthy();
  });
});

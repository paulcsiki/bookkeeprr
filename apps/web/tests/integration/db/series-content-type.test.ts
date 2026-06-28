import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('series DAL — contentType', () => {
  it('insertSeries defaults to manga when contentType omitted', async () => {
    const id = await insertSeries({
      anilistId: 9999,
      status: 'releasing',
      rootPath: '/media/comics/X',
      qualityProfileId: h.qpId,
    });
    const row = await getSeries(id);
    expect(row?.contentType).toBe('manga');
  });

  it('insertSeries accepts ebook + null anilistId', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      anilistId: null,
      status: 'finished',
      rootPath: '/media/books/X',
      qualityProfileId: h.qpId,
    });
    const row = await getSeries(id);
    expect(row?.contentType).toBe('ebook');
    expect(row?.anilistId).toBeNull();
  });

  it('insertSeries accepts all 5 content types', async () => {
    const types = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'] as const;
    for (const t of types) {
      const id = await insertSeries({
        contentType: t,
        anilistId: null,
        status: 'releasing',
        rootPath: `/media/${t}/X`,
        qualityProfileId: h.qpId,
      });
      const row = await getSeries(id);
      expect(row?.contentType).toBe(t);
    }
  });
});

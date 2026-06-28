import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('series DAL — author field', () => {
  it('insertSeries persists author', async () => {
    const id = await insertSeries({
      contentType: 'light_novel',
      anilistId: 21355,
      author: 'Tappei Nagatsuki',
      titleEnglish: 'Re:Zero',
      status: 'releasing',
      rootPath: '/media/books/Tappei Nagatsuki/Re:Zero Light Novel',
      qualityProfileId: h.qpId,
      granularity: 'volume',
    });
    const row = await getSeries(id);
    expect(row?.contentType).toBe('light_novel');
    expect(row?.author).toBe('Tappei Nagatsuki');
  });

  it('insertSeries author defaults to null when omitted', async () => {
    const id = await insertSeries({
      anilistId: 12345,
      status: 'releasing',
      rootPath: '/media/comics/X',
      qualityProfileId: h.qpId,
    });
    const row = await getSeries(id);
    expect(row?.author).toBeNull();
  });
});

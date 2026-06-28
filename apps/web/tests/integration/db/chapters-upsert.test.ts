import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { upsertChapterByNumberSort, listChaptersBySeries } from '@/server/db/chapters';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('upsertChapterByNumberSort', () => {
  it('inserts a new chapter', async () => {
    await upsertChapterByNumberSort(h.seriesId, 5, { numberText: '5', title: 'Issue Five' });
    const list = await listChaptersBySeries(h.seriesId);
    expect(list.some((c) => c.numberSort === 5 && c.numberText === '5')).toBe(true);
  });

  it('updates numberText + title if numberSort already exists', async () => {
    await upsertChapterByNumberSort(h.seriesId, 5, { numberText: '5', title: 'Old' });
    await upsertChapterByNumberSort(h.seriesId, 5, { numberText: '5', title: 'New' });
    const list = await listChaptersBySeries(h.seriesId);
    const five = list.find((c) => c.numberSort === 5);
    expect(five?.title).toBe('New');
    expect(list.filter((c) => c.numberSort === 5)).toHaveLength(1);
  });

  it('supports non-numeric numberText (e.g., Annual)', async () => {
    await upsertChapterByNumberSort(h.seriesId, 100001, { numberText: 'Annual 1', title: 'A' });
    const list = await listChaptersBySeries(h.seriesId);
    const annual = list.find((c) => c.numberSort === 100001);
    expect(annual?.numberText).toBe('Annual 1');
  });
});

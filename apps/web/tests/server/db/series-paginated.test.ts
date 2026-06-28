import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries, listSeriesPaginated } from '@/server/db/series';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

async function seedN(n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await insertSeries({
      contentType: 'manga',
      titleEnglish: `Series ${String(i).padStart(3, '0')}`,
      status: 'releasing',
      rootPath: `/media/comics/S${i}`,
      qualityProfileId: h.qpId,
    });
  }
}

describe('listSeriesPaginated', () => {
  it('returns first page with limit', async () => {
    await seedN(25);
    const { rows, total } = await listSeriesPaginated({
      page: 1,
      limit: 10,
      sort: 'added_at:desc',
    });
    expect(rows).toHaveLength(10);
    expect(total).toBe(25);
  });

  it('returns second page', async () => {
    await seedN(25);
    const { rows } = await listSeriesPaginated({
      page: 2,
      limit: 10,
      sort: 'added_at:desc',
    });
    expect(rows).toHaveLength(10);
  });

  it('returns partial last page', async () => {
    await seedN(25);
    const { rows } = await listSeriesPaginated({
      page: 3,
      limit: 10,
      sort: 'added_at:desc',
    });
    expect(rows).toHaveLength(5);
  });

  it('sort=title:asc orders by titleEnglish ascending', async () => {
    await seedN(3);
    const { rows } = await listSeriesPaginated({
      page: 1,
      limit: 10,
      sort: 'title:asc',
    });
    expect(rows.map((r) => r.titleEnglish)).toEqual(['Series 001', 'Series 002', 'Series 003']);
  });

  it('empty DB returns rows=[] total=0', async () => {
    const { rows, total } = await listSeriesPaginated({
      page: 1,
      limit: 10,
      sort: 'added_at:desc',
    });
    expect(rows).toEqual([]);
    expect(total).toBe(0);
  });
});

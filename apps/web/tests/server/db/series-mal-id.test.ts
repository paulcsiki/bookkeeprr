import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries, getSeries, getSeriesByMalId } from '@/server/db/series';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('insertSeries — malId', () => {
  it('persists malId and is retrievable by getSeriesByMalId', async () => {
    const id = await insertSeries({
      contentType: 'manga',
      malId: 12345,
      titleEnglish: 'MAL Manga',
      status: 'releasing',
      rootPath: '/media/comics/MAL Manga',
      qualityProfileId: h.qpId,
    });
    const row = await getSeries(id);
    expect(row?.malId).toBe(12345);

    const byMal = await getSeriesByMalId(12345);
    expect(byMal?.id).toBe(id);
  });

  it('stores both anilistId and malId for a cross-linked add', async () => {
    const id = await insertSeries({
      contentType: 'manga',
      anilistId: 999,
      malId: 54321,
      titleEnglish: 'Cross Linked',
      status: 'releasing',
      rootPath: '/media/comics/Cross Linked',
      qualityProfileId: h.qpId,
    });
    const row = await getSeries(id);
    expect(row?.anilistId).toBe(999);
    expect(row?.malId).toBe(54321);
  });

  it('enforces UNIQUE(mal_id)', async () => {
    await insertSeries({
      contentType: 'manga',
      malId: 777,
      titleEnglish: 'First',
      status: 'releasing',
      rootPath: '/media/comics/First',
      qualityProfileId: h.qpId,
    });
    await expect(
      insertSeries({
        contentType: 'manga',
        malId: 777,
        titleEnglish: 'Dup',
        status: 'releasing',
        rootPath: '/media/comics/Dup',
        qualityProfileId: h.qpId,
      }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('allows multiple rows with NULL mal_id', async () => {
    const id1 = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'NoMal A',
      status: 'releasing',
      rootPath: '/media/comics/NoMal A',
      qualityProfileId: h.qpId,
    });
    const id2 = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'NoMal B',
      status: 'releasing',
      rootPath: '/media/comics/NoMal B',
      qualityProfileId: h.qpId,
    });
    expect(id1).not.toBe(id2);
  });

  it('returns null from getSeriesByMalId for an unknown malId', async () => {
    expect(await getSeriesByMalId(424242)).toBeNull();
  });
});

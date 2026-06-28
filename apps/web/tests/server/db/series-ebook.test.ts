import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries, getSeries } from '@/server/db/series';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => {
  h.cleanup();
});

describe('insertSeries — ebook fields', () => {
  it('round-trips openlibraryId and isbn', async () => {
    const id = await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OL27448W',
      isbn: '9780593135204',
      author: 'Andy Weir',
      titleEnglish: 'Project Hail Mary',
      status: 'finished',
      rootPath: '/media/books/Andy Weir/Project Hail Mary',
      qualityProfileId: h.qpId,
      totalVolumes: 1,
      granularity: 'volume',
    });
    const row = await getSeries(id);
    expect(row?.openlibraryId).toBe('OL27448W');
    expect(row?.isbn).toBe('9780593135204');
    expect(row?.author).toBe('Andy Weir');
    expect(row?.contentType).toBe('ebook');
  });

  it('enforces UNIQUE(openlibrary_id)', async () => {
    await insertSeries({
      contentType: 'ebook',
      openlibraryId: 'OL27448W',
      isbn: '9780593135204',
      author: 'Andy Weir',
      titleEnglish: 'Project Hail Mary',
      status: 'finished',
      rootPath: '/media/books/Andy Weir/Project Hail Mary',
      qualityProfileId: h.qpId,
      totalVolumes: 1,
      granularity: 'volume',
    });
    await expect(
      insertSeries({
        contentType: 'ebook',
        openlibraryId: 'OL27448W',
        isbn: '9780593135204',
        author: 'Andy Weir',
        titleEnglish: 'Project Hail Mary (dup)',
        status: 'finished',
        rootPath: '/media/books/Andy Weir/Project Hail Mary (dup)',
        qualityProfileId: h.qpId,
        totalVolumes: 1,
        granularity: 'volume',
      }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('allows multiple rows with NULL openlibraryId (non-ebook)', async () => {
    const id1 = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'A',
      status: 'releasing',
      rootPath: '/media/comics/A',
      qualityProfileId: h.qpId,
    });
    const id2 = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'B',
      status: 'releasing',
      rootPath: '/media/comics/B',
      qualityProfileId: h.qpId,
    });
    expect(id1).not.toBe(id2);
  });
});

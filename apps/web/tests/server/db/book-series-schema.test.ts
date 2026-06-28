import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { bookSeries, bookSeriesMembers, bookSeriesEntries } from '@/server/db/schema';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { h.cleanup(); });

describe('book_series schema', () => {
  it('inserts a book_series, a member, and an entry; cascades on delete', async () => {
    const [bs] = await getDb().insert(bookSeries)
      .values({ name: 'His Dark Materials', contentType: 'ebook', source: 'manual' })
      .returning();
    const seriesId = await insertSeries({
      contentType: 'ebook', status: 'finished', rootPath: '/tmp/hdm1',
      qualityProfileId: h.qpId, titleEnglish: 'Northern Lights',
    });
    await getDb().insert(bookSeriesMembers)
      .values({ bookSeriesId: bs!.id, seriesId, position: 1, linkSource: 'manual' });
    await getDb().insert(bookSeriesEntries)
      .values({ bookSeriesId: bs!.id, position: 2, title: 'The Subtle Knife', externalRef: 'OL2W' });

    // Cascade: deleting the book_series removes members + entries.
    await getDb().delete(bookSeries).where(eq(bookSeries.id, bs!.id));
    expect(await getDb().select().from(bookSeriesMembers)).toHaveLength(0);
    expect(await getDb().select().from(bookSeriesEntries)).toHaveLength(0);
  });

  it('cascades member removal when the underlying series is deleted', async () => {
    const [bs] = await getDb().insert(bookSeries)
      .values({ name: 'X', contentType: 'audiobook', source: 'manual' }).returning();
    const seriesId = await insertSeries({
      contentType: 'audiobook', status: 'finished', rootPath: '/tmp/x',
      qualityProfileId: h.qpId, titleEnglish: 'X1',
    });
    await getDb().insert(bookSeriesMembers)
      .values({ bookSeriesId: bs!.id, seriesId, linkSource: 'auto' });
    const { deleteSeries } = await import('@/server/db/series');
    await deleteSeries(seriesId);
    expect(await getDb().select().from(bookSeriesMembers)).toHaveLength(0);
  });
});

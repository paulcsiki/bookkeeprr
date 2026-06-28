import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';
import * as dal from '@/server/db/book-series';

let h: SeedHandle;
beforeEach(async () => { h = await seedDb({ skipDefaultSeries: true }); });
afterEach(() => { h.cleanup(); });

async function ebook(title: string): Promise<number> {
  return insertSeries({
    contentType: 'ebook', status: 'finished', rootPath: `/tmp/${title}`,
    qualityProfileId: h.qpId, titleEnglish: title,
  });
}

describe('listAllMemberships', () => {
  it('returns empty array when no memberships exist', async () => {
    const rows = await dal.listAllMemberships();
    expect(rows).toEqual([]);
  });

  it('returns all junction rows across all book series', async () => {
    const bs1 = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
    const bs2 = await dal.createBookSeries({ name: 'Discworld', contentType: 'ebook', source: 'manual' });
    const s1 = await ebook('Northern Lights');
    const s2 = await ebook('The Subtle Knife');
    const s3 = await ebook('The Amber Spyglass');
    const s4 = await ebook('The Colour of Magic');

    await dal.addMember(bs1.id, s1, { position: 1, linkSource: 'manual' });
    await dal.addMember(bs1.id, s2, { position: 2, linkSource: 'manual' });
    await dal.addMember(bs1.id, s3, { position: 3, linkSource: 'manual' });
    await dal.addMember(bs2.id, s4, { position: 1, linkSource: 'auto' });

    const rows = await dal.listAllMemberships();
    expect(rows).toHaveLength(4);

    const bySeriesId = new Map(rows.map((r) => [r.seriesId, r.bookSeriesId]));
    expect(bySeriesId.get(s1)).toBe(bs1.id);
    expect(bySeriesId.get(s2)).toBe(bs1.id);
    expect(bySeriesId.get(s3)).toBe(bs1.id);
    expect(bySeriesId.get(s4)).toBe(bs2.id);
  });

  it('each row has bookSeriesId and seriesId fields', async () => {
    const bs = await dal.createBookSeries({ name: 'A', contentType: 'ebook', source: 'manual' });
    const s = await ebook('Book');
    await dal.addMember(bs.id, s, { linkSource: 'manual' });

    const [row] = await dal.listAllMemberships();
    expect(row).toHaveProperty('bookSeriesId', bs.id);
    expect(row).toHaveProperty('seriesId', s);
  });
});

import { afterEach, beforeEach, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertSeries } from '@/server/db/series';
import * as dal from '@/server/db/book-series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

it('exposes the book series for a member title', async () => {
  const bs = await dal.createBookSeries({ name: 'HDM', contentType: 'ebook', source: 'manual' });
  const s = await insertSeries({
    contentType: 'ebook',
    status: 'finished',
    rootPath: '/t',
    qualityProfileId: h.qpId,
    titleEnglish: 'Northern Lights',
  });
  await dal.addMember(bs.id, s, { linkSource: 'manual' });
  const found = await dal.getBookSeriesForTitle(s);
  expect(found).toMatchObject({ id: bs.id, name: 'HDM', memberCount: 1 });
});

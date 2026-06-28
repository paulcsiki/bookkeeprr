import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { novelUpdatesChapterSyncFanoutDescriptor } from '@/server/jobs/kinds/novel-updates-chapter-sync-fanout';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => h.cleanup());

describe('novel_updates_chapter_sync_fanout', () => {
  it('enqueues one job per LN series with novelUpdatesId', async () => {
    await insertSeries({
      contentType: 'light_novel',
      status: 'releasing',
      rootPath: '/tmp/ln1',
      qualityProfileId: h.qpId,
      titleEnglish: 'LN with NU',
      novelUpdatesId: 42,
    });
    await insertSeries({
      contentType: 'light_novel',
      status: 'releasing',
      rootPath: '/tmp/ln2',
      qualityProfileId: h.qpId,
      titleEnglish: 'LN without NU',
    });
    await insertSeries({
      contentType: 'manga',
      status: 'releasing',
      rootPath: '/tmp/m1',
      qualityProfileId: h.qpId,
      titleEnglish: 'Manga with bogus id',
      novelUpdatesId: 99,
    });

    const result = await novelUpdatesChapterSyncFanoutDescriptor.handler({}, 1);
    expect(result.enqueuedIds).toHaveLength(1);
  });

  it('returns empty when no LN series have novelUpdatesId', async () => {
    const result = await novelUpdatesChapterSyncFanoutDescriptor.handler({}, 1);
    expect(result.enqueuedIds).toHaveLength(0);
  });
});

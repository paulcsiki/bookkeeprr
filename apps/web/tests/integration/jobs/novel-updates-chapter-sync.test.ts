import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { novelUpdatesChapterSyncDescriptor } from '@/server/jobs/kinds/novel-updates-chapter-sync';
import { insertSeries, updateSeries } from '@/server/db/series';
import { listChaptersBySeries } from '@/server/db/chapters';
import * as nuClient from '@/server/integrations/novelupdates/client';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

async function makeLnSeries(numericId: number | null): Promise<number> {
  const id = await insertSeries({
    contentType: 'light_novel',
    anilistId: 1,
    rootPath: '/tmp/ln',
    qualityProfileId: h.qpId,
    titleEnglish: 'Test LN',
    status: 'releasing',
  });
  if (numericId !== null) {
    await updateSeries(id, { novelUpdatesId: numericId });
  }
  return id;
}

describe('novel_updates_chapter_sync', () => {
  it('no-op when series has no novelUpdatesId', async () => {
    const id = await makeLnSeries(null);
    const spy = vi.spyOn(nuClient, 'fetchChapterFeed');
    const result = await novelUpdatesChapterSyncDescriptor.handler({ seriesId: id }, 1);
    expect(spy).not.toHaveBeenCalled();
    expect(result.chaptersAdded).toBe(0);
  });

  it('upserts chapters from RSS', async () => {
    const id = await makeLnSeries(2000);
    vi.spyOn(nuClient, 'fetchChapterFeed').mockResolvedValue([
      {
        title: 'Test LN v26 c264',
        link: 'https://x.test/c264',
        pubDate: new Date('2026-03-24T10:00:00.000Z'),
      },
      {
        title: 'Test LN v26 c263',
        link: 'https://x.test/c263',
        pubDate: new Date('2026-03-23T10:00:00.000Z'),
      },
    ]);

    await novelUpdatesChapterSyncDescriptor.handler({ seriesId: id }, 1);
    const chaptersList = await listChaptersBySeries(id);
    expect(chaptersList.length).toBe(2);
    // Verify the numberSort values are parsed correctly.
    const sorts = chaptersList.map((c) => c.numberSort).sort((a, b) => a - b);
    expect(sorts).toEqual([263, 264]);
  });

  it('is idempotent (re-running with same RSS does not duplicate)', async () => {
    const id = await makeLnSeries(2000);
    vi.spyOn(nuClient, 'fetchChapterFeed').mockResolvedValue([
      {
        title: 'Test LN v26 c264',
        link: 'https://x.test/c264',
        pubDate: new Date('2026-03-24T10:00:00.000Z'),
      },
    ]);

    await novelUpdatesChapterSyncDescriptor.handler({ seriesId: id }, 1);
    await novelUpdatesChapterSyncDescriptor.handler({ seriesId: id }, 1);
    const chaptersList = await listChaptersBySeries(id);
    expect(chaptersList.length).toBe(1);
  });
});

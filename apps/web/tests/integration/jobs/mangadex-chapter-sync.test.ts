import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import * as md from '@/server/integrations/mangadex/client';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { mangadexChapterSyncDescriptor } from '@/server/jobs/kinds/mangadex-chapter-sync';
import { listChaptersBySeries } from '@/server/db/chapters';
import { getSeries, updateSeriesMetadata } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ anilistId: 105778 });
  vi.restoreAllMocks();
});
afterEach(() => h.cleanup());

const chapter = (numberSort: number) => ({
  mangadexChapterId: `c${numberSort}`,
  numberText: String(numberSort),
  numberSort,
  volume: 1,
  title: `Ch ${numberSort}`,
  publishAt: new Date('2020-01-01T00:00:00Z'),
  language: 'en',
});

describe('mangadex_chapter_sync', () => {
  it('populates chapters from a validated MangaDex match and persists the id', async () => {
    vi.spyOn(md, 'findMangaByTitles').mockResolvedValue({
      mangadexId: 'uuid-1',
      titleEnglish: 'Test Series',
      titleJa: null,
      status: 'ongoing',
      year: 2018,
    });
    vi.spyOn(md, 'getChapters').mockResolvedValue([chapter(2), chapter(3)]);

    await enqueueJob('mangadex_chapter_sync', { seriesId: h.seriesId });
    expect(await runOnce(mangadexChapterSyncDescriptor)).toBe('ran');

    const sorts = (await listChaptersBySeries(h.seriesId))
      .map((c) => c.numberSort)
      .sort((a, b) => a - b);
    expect(sorts).toEqual([1, 2, 3]); // seed's 1 + synced 2,3
    expect((await getSeries(h.seriesId))?.mangadexId).toBe('uuid-1');
  });

  // Regression: a title-less relevance query used to return an arbitrary manga
  // (e.g. a Spice & Wolf doujinshi for "Usagi Drop") and persist it, mis-linking
  // the whole series. The resolver now validates the title and returns null on no
  // match — the job must then leave the series UNLINKED, never poisoned.
  it('does NOT link the series when no title matches (no poisoning)', async () => {
    const findSpy = vi.spyOn(md, 'findMangaByTitles').mockResolvedValue(null);
    const chaptersSpy = vi.spyOn(md, 'getChapters');

    await enqueueJob('mangadex_chapter_sync', { seriesId: h.seriesId });
    await runOnce(mangadexChapterSyncDescriptor);

    expect(findSpy).toHaveBeenCalled();
    expect(chaptersSpy).not.toHaveBeenCalled();
    expect((await getSeries(h.seriesId))?.mangadexId).toBeNull(); // not poisoned
    expect(await listChaptersBySeries(h.seriesId)).toHaveLength(1); // only the seed
  });

  // Regression: chapter-sync used to overwrite an existing (correct) mangadexId
  // on every run with whatever the broken resolver returned.
  it('uses an existing mangadexId and never re-resolves or overwrites it', async () => {
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'correct-id' });
    const findSpy = vi.spyOn(md, 'findMangaByTitles');
    vi.spyOn(md, 'getChapters').mockResolvedValue([]);

    await enqueueJob('mangadex_chapter_sync', { seriesId: h.seriesId });
    await runOnce(mangadexChapterSyncDescriptor);

    expect(findSpy).not.toHaveBeenCalled();
    expect((await getSeries(h.seriesId))?.mangadexId).toBe('correct-id');
  });

  it('links chapters to their volume by number, backfilling existing rows', async () => {
    // seed creates volume #1 (h.volumeId) and chapter sort 1 with a null volumeId.
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'u' });
    vi.spyOn(md, 'getChapters').mockResolvedValue([
      { ...chapter(1), volume: 1 }, // existing -> volumeId backfilled
      { ...chapter(2), volume: 1 }, // new -> inserted with volumeId
    ]);

    await enqueueJob('mangadex_chapter_sync', { seriesId: h.seriesId });
    await runOnce(mangadexChapterSyncDescriptor);

    const chs = await listChaptersBySeries(h.seriesId);
    expect(chs).toHaveLength(2);
    for (const c of chs) expect(c.volumeId).toBe(h.volumeId);
  });

  it('is idempotent: re-running adds nothing', async () => {
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'u' });
    vi.spyOn(md, 'getChapters').mockResolvedValue([chapter(2)]);

    await enqueueJob('mangadex_chapter_sync', { seriesId: h.seriesId });
    await runOnce(mangadexChapterSyncDescriptor);
    await enqueueJob('mangadex_chapter_sync', { seriesId: h.seriesId });
    await runOnce(mangadexChapterSyncDescriptor);

    expect(await listChaptersBySeries(h.seriesId)).toHaveLength(2); // seed's 1 + new 2
  });
});

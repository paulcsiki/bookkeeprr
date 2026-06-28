import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  searchMangaCached,
  searchNovelCached,
  __clearCacheForTests,
} from '@/server/integrations/anilist/cache';
import * as client from '@/server/integrations/anilist/client';

beforeEach(() => {
  __clearCacheForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('AniList search cache', () => {
  it('hits the client on first call and caches on second', async () => {
    const spy = vi.spyOn(client, 'searchManga').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'X',
        titleRomaji: null,
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: null,
        startYear: null,
      },
    ]);
    const a = await searchMangaCached('foo');
    const b = await searchMangaCached('foo');
    expect(a).toEqual(b);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('different queries cache separately', async () => {
    const spy = vi.spyOn(client, 'searchManga').mockResolvedValue([]);
    await searchMangaCached('a');
    await searchMangaCached('b');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('expires entries after TTL', async () => {
    vi.useFakeTimers();
    try {
      const spy = vi.spyOn(client, 'searchManga').mockResolvedValue([]);
      await searchMangaCached('x');
      vi.advanceTimersByTime(6 * 60_000);
      await searchMangaCached('x');
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AniList cache namespacing', () => {
  it('manga and novel caches do not collide on identical query strings', async () => {
    const mangaHit = {
      anilistId: 1,
      titleEnglish: 'Manga Result',
      titleRomaji: null,
      titleNative: null,
      coverUrl: null,
      status: 'releasing' as const,
      format: 'MANGA' as const,
      startYear: null,
    };
    const novelHit = {
      anilistId: 2,
      titleEnglish: 'Novel Result',
      titleRomaji: null,
      titleNative: null,
      coverUrl: null,
      status: 'releasing' as const,
      format: 'LIGHT_NOVEL' as const,
      startYear: null,
    };

    const mangaSpy = vi.spyOn(client, 'searchManga').mockResolvedValue([mangaHit]);
    const novelSpy = vi.spyOn(client, 'searchNovel').mockResolvedValue([novelHit]);

    const mangaResult = await searchMangaCached('Re:Zero');
    const novelResult = await searchNovelCached('Re:Zero');

    // Results are distinct — no cache collision
    expect(mangaResult).toEqual([mangaHit]);
    expect(novelResult).toEqual([novelHit]);
    expect(mangaResult).not.toEqual(novelResult);

    // Each fetcher called exactly once
    expect(mangaSpy).toHaveBeenCalledTimes(1);
    expect(novelSpy).toHaveBeenCalledTimes(1);

    // Second calls hit the cache — fetchers not called again
    await searchMangaCached('Re:Zero');
    await searchNovelCached('Re:Zero');
    expect(mangaSpy).toHaveBeenCalledTimes(1);
    expect(novelSpy).toHaveBeenCalledTimes(1);
  });

  it('searchNovelCached caches independently from searchMangaCached', async () => {
    vi.spyOn(client, 'searchManga').mockResolvedValue([]);
    const novelSpy = vi.spyOn(client, 'searchNovel').mockResolvedValue([]);

    // Prime the manga cache for 'test'
    await searchMangaCached('test');

    // Novel cache for the same query should still call searchNovel
    await searchNovelCached('test');
    expect(novelSpy).toHaveBeenCalledTimes(1);

    // Second call to searchNovelCached hits the novel cache, not manga
    await searchNovelCached('test');
    expect(novelSpy).toHaveBeenCalledTimes(1);
  });
});

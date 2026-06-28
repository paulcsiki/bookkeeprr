import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findMangaByTitles,
  mangaTitleMatches,
  searchMangaByTitle,
  getChapters,
  getChapterCount,
  getVolumeCovers,
  __resetMdForTests,
} from '@/server/integrations/mangadex/client';
import type { MangaDexManga } from '@/server/integrations/mangadex/schemas';

const manga = (over: Partial<MangaDexManga>): MangaDexManga => ({
  mangadexId: 'x',
  titleEnglish: null,
  titleJa: null,
  status: null,
  year: null,
  ...over,
});

const fixturesDir = join(process.cwd(), 'tests/fixtures/mangadex');
function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  __resetMdForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MangaDex client', () => {
  // mangaTitleMatches is the guard that stops a series being mis-linked to an
  // unrelated manga (the real bug: "Usagi Drop" was linked to a Spice & Wolf
  // doujinshi because the resolver did a title-less relevance query).
  it('mangaTitleMatches accepts a genuine title match', () => {
    expect(mangaTitleMatches(manga({ titleEnglish: 'Usagi Drop' }), 'Usagi Drop')).toBe(true);
    expect(mangaTitleMatches(manga({ titleJa: 'Usagi Drop' }), '  usagi   drop! ')).toBe(true);
    expect(mangaTitleMatches(manga({ titleEnglish: 'Usagi Drop: Special' }), 'Usagi Drop')).toBe(true);
  });

  it('mangaTitleMatches rejects an unrelated manga (anti mis-link)', () => {
    expect(
      mangaTitleMatches(
        manga({ titleEnglish: 'Spice & Wolf: Merchants Meet City Life (Doujinshi)' }),
        'Usagi Drop',
      ),
    ).toBe(false);
    expect(mangaTitleMatches(manga({ titleEnglish: null, titleJa: null }), 'Usagi Drop')).toBe(false);
  });

  it('findMangaByTitles returns the hit whose title matches', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('manga-search-chainsaw-man.json'),
    } as Response);
    const m = await findMangaByTitles(['Chainsaw Man']);
    expect(m?.mangadexId).toBe('a96676e5-8ae2-425e-b549-7f15dd34a6d8');
  });

  it('findMangaByTitles returns null rather than an unrelated relevance hit', async () => {
    // Even though MangaDex returns Chainsaw Man, the query is unrelated, so the
    // validator rejects it and we DO NOT mis-link.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('manga-search-chainsaw-man.json'),
    } as Response);
    expect(await findMangaByTitles(['Totally Different Series'])).toBeNull();
  });

  it('findMangaByTitles returns null on empty results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('no-match.json'),
    } as Response);
    expect(await findMangaByTitles(['asdfzzz'])).toBeNull();
  });

  it('searchMangaByTitle returns top hit', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('manga-search-chainsaw-man.json'),
    } as Response);
    const m = await searchMangaByTitle('Chainsaw Man');
    expect(m?.mangadexId).toBe('a96676e5-8ae2-425e-b549-7f15dd34a6d8');
  });

  it('searchMangaByTitle returns null on empty results', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('no-match.json'),
    } as Response);
    expect(await searchMangaByTitle('asdfzzz')).toBeNull();
  });

  it('getChapters returns mapped entries', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('chapters-page1.json'),
    } as Response);
    const chapters = await getChapters('a96676e5-8ae2-425e-b549-7f15dd34a6d8');
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.numberSort).toBe(1);
    expect(chapters[0]?.title).toBe('Dog & Chainsaw');
    expect(chapters[1]?.numberSort).toBe(2);
  });

  it('getChapters parses publishAt into Date', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('chapters-page1.json'),
    } as Response);
    const chapters = await getChapters('a96676e5-8ae2-425e-b549-7f15dd34a6d8');
    expect(chapters[0]?.publishAt).toBeInstanceOf(Date);
    expect(chapters[0]?.publishAt?.toISOString()).toBe('2018-12-03T00:00:00.000Z');
    expect(chapters[0]?.volume).toBe(1);
  });

  function chapterPage(count: number, offset: number, total: number): unknown {
    return {
      result: 'ok',
      limit: 500,
      offset,
      total,
      data: Array.from({ length: count }, (_, i) => ({
        id: `${String(offset + i).padStart(8, '0')}-0000-4000-8000-000000000000`,
        type: 'chapter',
        attributes: { chapter: String(offset + i + 1), volume: '1', publishAt: '2020-01-01T00:00:00+00:00' },
      })),
    };
  }

  it('getChapters paginates through the whole feed when no limit is given', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => chapterPage(500, 0, 600) } as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => chapterPage(100, 500, 600) } as Response);
    const chapters = await getChapters('a96676e5-8ae2-425e-b549-7f15dd34a6d8');
    expect(chapters).toHaveLength(600);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second page requested at offset 500.
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('offset=500');
  });

  it('getChapters fetches a single page when an explicit limit is given', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => chapterPage(100, 0, 600) } as Response);
    const chapters = await getChapters('a96676e5-8ae2-425e-b549-7f15dd34a6d8', { limit: 100 });
    expect(chapters).toHaveLength(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('getChapterCount requests a single-row feed and returns the total', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: 'ok', limit: 1, offset: 0, total: 142, data: [] }),
    } as Response);
    const count = await getChapterCount('a96676e5-8ae2-425e-b549-7f15dd34a6d8');
    expect(count).toBe(142);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/manga/a96676e5-8ae2-425e-b549-7f15dd34a6d8/feed');
    expect(url).toContain('limit=1');
    expect(url).toContain('translatedLanguage%5B%5D=en');
    expect(url).toContain('includeFutureUpdates=0');
  });

  it('getChapterCount honours a non-default language', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: 'ok', limit: 1, offset: 0, total: 9, data: [] }),
    } as Response);
    const count = await getChapterCount('a96676e5-8ae2-425e-b549-7f15dd34a6d8', 'ja');
    expect(count).toBe(9);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('translatedLanguage%5B%5D=ja');
  });

  it('getVolumeCovers maps covers, skips invalid volumes, dedupes, builds URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('covers-page1.json'),
    } as Response);
    const mangadexId = 'a96676e5-8ae2-425e-b549-7f15dd34a6d8';
    const covers = await getVolumeCovers(mangadexId);
    // null, "none", "0", and "1.5" volumes skipped; volume 1 deduped to first;
    // volume 3 has a null fileName so it is skipped rather than throwing.
    expect(covers.map((c) => c.volume)).not.toContain(3);
    expect(covers).toEqual([
      {
        volume: 1,
        url: `https://uploads.mangadex.org/covers/${mangadexId}/vol1-aaa.jpg.512.jpg`,
      },
      {
        volume: 2,
        url: `https://uploads.mangadex.org/covers/${mangadexId}/vol2-bbb.jpg.512.jpg`,
      },
    ]);
  });

  it('throws on non-200', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(findMangaByTitles(['anything'])).rejects.toThrow();
  });
});

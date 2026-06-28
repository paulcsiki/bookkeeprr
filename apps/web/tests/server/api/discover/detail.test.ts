import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { closeDb, getDb } from '@/server/db/client';
import { malClientIdSetting } from '@/server/db/settings/mal';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { nytApiKeySetting } from '@/server/db/settings/nyt';
import * as anilist from '@/server/integrations/anilist';
import * as malIndex from '@/server/integrations/mal';
import * as mangadex from '@/server/integrations/mangadex';
import * as openlibrary from '@/server/integrations/openlibrary';
import * as comicvine from '@/server/integrations/comicvine';
import * as audnex from '@/server/integrations/audnex';
import * as librivox from '@/server/integrations/librivox';
import * as browse from '@/server/discover/browse';
import type { NytAudioHit } from '@/server/integrations/nyt';
import { GET, type DiscoverDetail } from '@/app/api/discover/detail/route';

const anilistManga = (over: Partial<anilist.MangaDetail> = {}): anilist.MangaDetail => ({
  anilistId: 101663,
  titleEnglish: 'Some Series',
  titleRomaji: 'Some Series',
  titleNative: 'シリーズ',
  coverUrl: null,
  status: 'releasing',
  format: 'MANGA',
  startYear: 2018,
  description: 'A story.',
  totalVolumes: 11,
  totalChapters: 97,
  ...over,
});

let tmpDir: string;

beforeEach(async () => {
  // Isolation: a prior seedDb test may have left BOOKKEEPRR_DB_PATH pointing at
  // its own DB (the db singleton keys off it). Drop it + close the cached
  // connection so getDb opens THIS test's fresh CONFIG_DIR DB — otherwise a
  // leaked mal.client_id would route MAL-only manga through the real API.
  delete process.env.BOOKKEEPRR_DB_PATH;
  await closeDb();
  tmpDir = mkdtempSync(join(tmpdir(), 'bk-discover-detail-'));
  process.env.BOOKKEEPRR_CONFIG_DIR = tmpDir;
  // getDb() resolves its file from BOOKKEEPRR_DB_PATH (NOT CONFIG_DIR). Without
  // this it would fall back to ./bookkeeprr.dev.db and clobber real settings.
  process.env.BOOKKEEPRR_DB_PATH = join(tmpDir, 'test.db');
  const db = getDb();
  const migrationsFolder = path.resolve(__dirname, '../../../../drizzle');
  migrate(db, { migrationsFolder });
  vi.restoreAllMocks();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeDb();
  delete process.env.BOOKKEEPRR_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/discover/detail?${qs}`);
}

describe('GET /api/discover/detail — validation', () => {
  it('returns 400 when contentType is missing', async () => {
    const res = await GET(req('source=anilist&id=1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when source is invalid', async () => {
    const res = await GET(req('contentType=manga&source=nope&id=1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when id is empty', async () => {
    const res = await GET(req('contentType=manga&source=anilist&id='));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/discover/detail — manga via AniList', () => {
  it('returns description + counts from getManga when anilistId present', async () => {
    const spy = vi.spyOn(anilist, 'getManga').mockResolvedValue({
      anilistId: 101663,
      titleEnglish: 'Chainsaw Man',
      titleRomaji: 'Chainsaw Man',
      titleNative: 'チェンソーマン',
      coverUrl: null,
      status: 'releasing',
      format: 'MANGA',
      startYear: 2018,
      description: 'A devil hunter story.',
      totalVolumes: 11,
      totalChapters: 97,
    });

    const res = await GET(req('contentType=manga&source=anilist&id=101663'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).toHaveBeenCalledWith(101663);
    expect(body.description).toBe('A devil hunter story.');
    expect(body.totalVolumes).toBe(11);
    expect(body.totalChapters).toBe(97);
  });
});

describe('GET /api/discover/detail — manga via MyAnimeList', () => {
  it('uses getMangaMal for a MAL-only result when MAL is configured', async () => {
    await malClientIdSetting.set('cid');
    const spy = vi.spyOn(malIndex, 'getMangaMal').mockResolvedValue({
      source: 'mal',
      malId: 200,
      title: 'MAL Only Series',
      titles: { main: 'MAL Only Series', en: null, ja: null, synonyms: [], all: ['MAL Only Series'] },
      coverUrl: null,
      status: 'finished',
      totalVolumes: 3,
      totalChapters: 25,
      year: 2010,
      mediaType: 'manga',
      synopsis: 'From MAL.',
    });

    const res = await GET(req('contentType=manga&source=mal&id=mal:200'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).toHaveBeenCalledWith(200);
    expect(body.description).toBe('From MAL.');
    expect(body.totalVolumes).toBe(3);
    expect(body.totalChapters).toBe(25);
  });

  it('returns {} for a MAL-only result when MAL is not configured', async () => {
    await malClientIdSetting.set('');
    const spy = vi.spyOn(malIndex, 'getMangaMal');

    const res = await GET(req('contentType=manga&source=mal&id=mal:200'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).not.toHaveBeenCalled();
    expect(body).toEqual({});
  });
});

describe('GET /api/discover/detail — MangaDex chapter fallback', () => {
  it('falls back to MangaDex count when AniList chapters are null and mdexId is present', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(
      anilistManga({ description: 'Ongoing webtoon.', totalVolumes: null, totalChapters: null }),
    );
    const countSpy = vi.spyOn(mangadex, 'getChapterCount').mockResolvedValue(212);

    const res = await GET(req('contentType=manga&source=anilist&id=101663&mdexId=abc-uuid'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(countSpy).toHaveBeenCalledWith('abc-uuid');
    expect(body.description).toBe('Ongoing webtoon.');
    expect(body.totalChapters).toBe(212);
  });

  it('does NOT overwrite a non-null AniList chapter count even when mdexId is present', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(anilistManga({ totalChapters: 97 }));
    const countSpy = vi.spyOn(mangadex, 'getChapterCount').mockResolvedValue(999);

    const res = await GET(req('contentType=manga&source=anilist&id=101663&mdexId=abc-uuid'));
    const body = (await res.json()) as DiscoverDetail;
    expect(countSpy).not.toHaveBeenCalled();
    expect(body.totalChapters).toBe(97);
  });

  it('leaves totalChapters null when chapters are null and no mdexId is supplied', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(anilistManga({ totalChapters: null }));
    const countSpy = vi.spyOn(mangadex, 'getChapterCount');

    const res = await GET(req('contentType=manga&source=anilist&id=101663'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(countSpy).not.toHaveBeenCalled();
    expect(body.totalChapters).toBeNull();
  });

  it('keeps description/volumes when the MangaDex fallback throws (chapters stays null)', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(
      anilistManga({ description: 'Still here.', totalVolumes: 5, totalChapters: null }),
    );
    vi.spyOn(mangadex, 'getChapterCount').mockRejectedValue(new Error('MangaDex HTTP 503'));

    const res = await GET(req('contentType=manga&source=anilist&id=101663&mdexId=abc-uuid'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description).toBe('Still here.');
    expect(body.totalVolumes).toBe(5);
    expect(body.totalChapters).toBeNull();
  });

  it('ignores a zero/negative MangaDex count (chapters stays null)', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(anilistManga({ totalChapters: null }));
    vi.spyOn(mangadex, 'getChapterCount').mockResolvedValue(0);

    const res = await GET(req('contentType=manga&source=anilist&id=101663&mdexId=abc-uuid'));
    const body = (await res.json()) as DiscoverDetail;
    expect(body.totalChapters).toBeNull();
    // A real match was found (count just happened to be 0), so the id is still echoed.
    expect(body.mangadexId).toBe('abc-uuid');
  });
});

describe('GET /api/discover/detail — MangaDex lazy resolve-by-title', () => {
  const mdexManga = (id: string): mangadex.MangaDexManga => ({
    mangadexId: id,
    titleEnglish: 'Some Series',
    titleJa: null,
    status: 'ongoing',
    year: 2018,
  });

  it('resolves a MangaDex match by title when chapters null + no mdexId, filling count and returning mangadexId', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(
      anilistManga({ description: 'Ongoing webtoon.', totalVolumes: null, totalChapters: null }),
    );
    const findSpy = vi
      .spyOn(mangadex, 'findMangaByTitles')
      .mockResolvedValue(mdexManga('mdex-uuid'));
    const countSpy = vi.spyOn(mangadex, 'getChapterCount').mockResolvedValue(212);

    const res = await GET(
      req('contentType=manga&source=anilist&id=101663&title=' + encodeURIComponent('Some Series')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(findSpy).toHaveBeenCalledWith(['Some Series']);
    expect(countSpy).toHaveBeenCalledWith('mdex-uuid');
    expect(body.totalChapters).toBe(212);
    expect(body.mangadexId).toBe('mdex-uuid');
  });

  it('leaves chapters null + no mangadexId when no confident MangaDex match is found', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(
      anilistManga({ description: 'Kept.', totalVolumes: 4, totalChapters: null }),
    );
    const findSpy = vi.spyOn(mangadex, 'findMangaByTitles').mockResolvedValue(null);
    const countSpy = vi.spyOn(mangadex, 'getChapterCount');

    const res = await GET(
      req('contentType=manga&source=anilist&id=101663&title=' + encodeURIComponent('Some Series')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(findSpy).toHaveBeenCalled();
    expect(countSpy).not.toHaveBeenCalled();
    expect(body.description).toBe('Kept.');
    expect(body.totalVolumes).toBe(4);
    expect(body.totalChapters).toBeNull();
    expect(body.mangadexId == null).toBe(true);
  });

  it('uses an explicit mdexId directly and does NOT call findMangaByTitles', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(anilistManga({ totalChapters: null }));
    const findSpy = vi.spyOn(mangadex, 'findMangaByTitles');
    const countSpy = vi.spyOn(mangadex, 'getChapterCount').mockResolvedValue(50);

    const res = await GET(
      req(
        'contentType=manga&source=anilist&id=101663&mdexId=abc-uuid&title=' +
          encodeURIComponent('Some Series'),
      ),
    );
    const body = (await res.json()) as DiscoverDetail;
    expect(findSpy).not.toHaveBeenCalled();
    expect(countSpy).toHaveBeenCalledWith('abc-uuid');
    expect(body.totalChapters).toBe(50);
    expect(body.mangadexId).toBe('abc-uuid');
  });

  it('does not resolve or count when chapters are non-null (no overwrite, no wasted lookup)', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(anilistManga({ totalChapters: 97 }));
    const findSpy = vi.spyOn(mangadex, 'findMangaByTitles');
    const countSpy = vi.spyOn(mangadex, 'getChapterCount');

    const res = await GET(
      req('contentType=manga&source=anilist&id=101663&title=' + encodeURIComponent('Some Series')),
    );
    const body = (await res.json()) as DiscoverDetail;
    expect(findSpy).not.toHaveBeenCalled();
    expect(countSpy).not.toHaveBeenCalled();
    expect(body.totalChapters).toBe(97);
  });

  it('makes no by-title resolve attempt for a short title (mis-link guard)', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(anilistManga({ totalChapters: null }));
    const findSpy = vi.spyOn(mangadex, 'findMangaByTitles');
    const countSpy = vi.spyOn(mangadex, 'getChapterCount');

    // "GTO" (3 chars) is below the min-length threshold — a short query is a
    // substring of many unrelated MangaDex titles, so we skip the lookup.
    const res = await GET(
      req('contentType=manga&source=anilist&id=101663&title=' + encodeURIComponent('GTO')),
    );
    const body = (await res.json()) as DiscoverDetail;
    expect(findSpy).not.toHaveBeenCalled();
    expect(countSpy).not.toHaveBeenCalled();
    expect(body.totalChapters).toBeNull();
  });

  it('makes no resolve attempt when title is omitted and no mdexId is supplied', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(anilistManga({ totalChapters: null }));
    const findSpy = vi.spyOn(mangadex, 'findMangaByTitles');
    const countSpy = vi.spyOn(mangadex, 'getChapterCount');

    const res = await GET(req('contentType=manga&source=anilist&id=101663'));
    const body = (await res.json()) as DiscoverDetail;
    expect(findSpy).not.toHaveBeenCalled();
    expect(countSpy).not.toHaveBeenCalled();
    expect(body.totalChapters).toBeNull();
  });

  it('preserves description/volumes when the by-title resolve/count throws (chapters stays null)', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue(
      anilistManga({ description: 'Still here.', totalVolumes: 5, totalChapters: null }),
    );
    vi.spyOn(mangadex, 'findMangaByTitles').mockRejectedValue(new Error('MangaDex HTTP 503'));

    const res = await GET(
      req('contentType=manga&source=anilist&id=101663&title=' + encodeURIComponent('Some Series')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description).toBe('Still here.');
    expect(body.totalVolumes).toBe(5);
    expect(body.totalChapters).toBeNull();
    expect(body.mangadexId == null).toBe(true);
  });
});

describe('GET /api/discover/detail — light novel via AniList', () => {
  it('returns description + counts from getNovel when anilistId present', async () => {
    const spy = vi.spyOn(anilist, 'getNovel').mockResolvedValue(
      anilistManga({
        description: 'An isekai novel.',
        totalVolumes: 23,
        totalChapters: null,
        format: 'NOVEL',
      }),
    );

    const res = await GET(req('contentType=light_novel&source=anilist&id=101663'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).toHaveBeenCalledWith(101663);
    expect(body.description).toBe('An isekai novel.');
    expect(body.totalVolumes).toBe(23);
    expect(body.totalChapters).toBeNull();
  });

  it('returns {} for a light novel from a non-AniList source', async () => {
    const res = await GET(req('contentType=light_novel&source=openlibrary&id=OL1W'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(body).toEqual({});
  });
});

describe('GET /api/discover/detail — eBook via Open Library', () => {
  it('returns the synopsis from a plain-string work description', async () => {
    const spy = vi
      .spyOn(openlibrary, 'getWork')
      .mockResolvedValue({ description: 'A dystopian survival tale.' } as Awaited<
        ReturnType<typeof openlibrary.getWork>
      >);
    const res = await GET(req('contentType=ebook&source=openlibrary&id=OL1W'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).toHaveBeenCalledWith('OL1W');
    expect(body.description).toBe('A dystopian survival tale.');
  });

  it('normalizes a typed { value } work description', async () => {
    vi.spyOn(openlibrary, 'getWork').mockResolvedValue({
      description: { value: 'Wrapped synopsis.' },
    } as Awaited<ReturnType<typeof openlibrary.getWork>>);
    const res = await GET(req('contentType=ebook&source=openlibrary&id=OL2W'));
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description).toBe('Wrapped synopsis.');
  });

  it('returns {} when the work has no description', async () => {
    vi.spyOn(openlibrary, 'getWork').mockResolvedValue({} as Awaited<
      ReturnType<typeof openlibrary.getWork>
    >);
    const res = await GET(req('contentType=ebook&source=openlibrary&id=OL3W'));
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description == null).toBe(true);
  });

  it('returns {} for an eBook from a non-OpenLibrary source', async () => {
    const spy = vi.spyOn(openlibrary, 'getWork');
    const res = await GET(req('contentType=ebook&source=audnex&id=B00X'));
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).not.toHaveBeenCalled();
    expect(body).toEqual({});
  });

  it('degrades to {} (no throw) when getWork fails', async () => {
    vi.spyOn(openlibrary, 'getWork').mockRejectedValue(new Error('OL HTTP 503'));
    const res = await GET(req('contentType=ebook&source=openlibrary&id=OL4W'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(body).toEqual({});
  });
});

describe('GET /api/discover/detail — comic via ComicVine', () => {
  it('returns the synopsis from getVolume when ComicVine is configured', async () => {
    await comicVineApiKeySetting.set('cv-key');
    const spy = vi.spyOn(comicvine, 'getVolume').mockResolvedValue({
      comicvineId: 123,
      name: 'Saga',
      publisher: 'Image',
      startYear: 2012,
      issueCount: 60,
      coverUrl: null,
      description: '<p>A space opera.</p>',
    } as Awaited<ReturnType<typeof comicvine.getVolume>>);

    const res = await GET(req('contentType=comic&source=comicvine&id=123'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    // id parsed to an int before the lookup.
    expect(spy).toHaveBeenCalledWith('cv-key', 123);
    expect(body.description).toBe('<p>A space opera.</p>');
  });

  it('returns {} and does not call getVolume when ComicVine is unconfigured', async () => {
    await comicVineApiKeySetting.set('');
    const spy = vi.spyOn(comicvine, 'getVolume');

    const res = await GET(req('contentType=comic&source=comicvine&id=123'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).not.toHaveBeenCalled();
    expect(body).toEqual({});
  });

  it('degrades to {} (no throw) when getVolume fails', async () => {
    await comicVineApiKeySetting.set('cv-key');
    vi.spyOn(comicvine, 'getVolume').mockRejectedValue(new Error('ComicVine HTTP 503'));

    const res = await GET(req('contentType=comic&source=comicvine&id=123'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(body).toEqual({});
  });

  it('returns {} for a comic from a non-ComicVine source', async () => {
    await comicVineApiKeySetting.set('cv-key');
    const spy = vi.spyOn(comicvine, 'getVolume');
    const res = await GET(req('contentType=comic&source=openlibrary&id=OL1W'));
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).not.toHaveBeenCalled();
    expect(body).toEqual({});
  });
});

describe('GET /api/discover/detail — audiobook via Audnex', () => {
  it('returns the synopsis from getAudiobook by ASIN', async () => {
    const spy = vi.spyOn(audnex, 'getAudiobook').mockResolvedValue({
      asin: 'B00X',
      title: 'Project Hail Mary',
      description: 'A lone astronaut.',
    } as Awaited<ReturnType<typeof audnex.getAudiobook>>);

    const res = await GET(req('contentType=audiobook&source=audnex&id=B00X'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).toHaveBeenCalledWith('B00X');
    expect(body.description).toBe('A lone astronaut.');
  });

  it('returns a null description when getAudiobook yields null', async () => {
    vi.spyOn(audnex, 'getAudiobook').mockResolvedValue(null);
    const res = await GET(req('contentType=audiobook&source=audnex&id=B00X'));
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description).toBeNull();
  });
});

describe('GET /api/discover/detail — audiobook via LibriVox', () => {
  it('strips the librivox: prefix and returns the description from getAudiobookById', async () => {
    const spy = vi.spyOn(librivox, 'getAudiobookById').mockResolvedValue({
      librivoxId: '711',
      title: 'The Count of Monte Cristo',
      author: 'Alexandre Dumas',
      coverUrl: null,
      description: 'A tale of revenge.',
    });

    const res = await GET(req('contentType=audiobook&source=librivox&id=librivox:711'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).toHaveBeenCalledWith('711');
    expect(body.description).toBe('A tale of revenge.');
  });

  it('returns a null description when getAudiobookById yields null', async () => {
    vi.spyOn(librivox, 'getAudiobookById').mockResolvedValue(null);
    const res = await GET(req('contentType=audiobook&source=librivox&id=librivox:999'));
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description).toBeNull();
  });
});

describe('GET /api/discover/detail — audiobook via NYT', () => {
  const nytHit = (over: Partial<NytAudioHit> = {}): NytAudioHit => ({
    title: 'Fourth Wing',
    author: 'Rebecca Yarros',
    coverUrl: null,
    isbn: '9781649374042',
    description: 'A war college fantasy.',
    rank: 1,
    ...over,
  });

  it('matches the cached bestsellers by isbn key and returns the description', async () => {
    await nytApiKeySetting.set('nyt-key');
    const spy = vi
      .spyOn(browse, 'getAudioBestsellersCached')
      .mockResolvedValue([nytHit()]);

    const res = await GET(
      req('contentType=audiobook&source=nyt&id=nyt:9781649374042'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).toHaveBeenCalledWith('nyt-key');
    expect(body.description).toBe('A war college fantasy.');
  });

  it('matches by title key when the isbn was absent (sourceId fell back to title)', async () => {
    await nytApiKeySetting.set('nyt-key');
    vi.spyOn(browse, 'getAudioBestsellersCached').mockResolvedValue([
      nytHit({ isbn: null }),
    ]);

    const res = await GET(
      req('contentType=audiobook&source=nyt&id=' + encodeURIComponent('nyt:Fourth Wing')),
    );
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description).toBe('A war college fantasy.');
  });

  it('returns {} and does not hit NYT when unconfigured', async () => {
    await nytApiKeySetting.set('');
    const spy = vi.spyOn(browse, 'getAudioBestsellersCached');

    const res = await GET(
      req('contentType=audiobook&source=nyt&id=nyt:9781649374042'),
    );
    const body = (await res.json()) as DiscoverDetail;
    expect(spy).not.toHaveBeenCalled();
    expect(body).toEqual({});
  });

  it('returns a null description when no cached hit matches the key', async () => {
    await nytApiKeySetting.set('nyt-key');
    vi.spyOn(browse, 'getAudioBestsellersCached').mockResolvedValue([nytHit()]);

    const res = await GET(req('contentType=audiobook&source=nyt&id=nyt:0000000000000'));
    const body = (await res.json()) as DiscoverDetail;
    expect(body.description).toBeNull();
  });
});

describe('GET /api/discover/detail — best-effort degrade', () => {
  it('returns {} for an audiobook from an unsupported source', async () => {
    const res = await GET(req('contentType=audiobook&source=fixture&id=x'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(body).toEqual({});
  });

  it('returns {} (no throw) when the provider lookup fails', async () => {
    vi.spyOn(anilist, 'getManga').mockRejectedValue(new Error('AniList HTTP 429'));
    const res = await GET(req('contentType=manga&source=anilist&id=101663'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiscoverDetail;
    expect(body).toEqual({});
  });
});

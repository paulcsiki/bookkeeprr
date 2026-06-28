import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { recoverQueryFromTitles, searchMangaMerged } from '@/server/discover/manga-search';
import * as anilistCache from '@/server/integrations/anilist/cache';
import * as malIndex from '@/server/integrations/mal';
import { malClientIdSetting } from '@/server/db/settings/mal';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
import type { MalMangaHit } from '@/server/integrations/mal/schemas';

describe('recoverQueryFromTitles', () => {
  it('collapses mixed-separator Naruto titles to "Naruto" for a partial query', () => {
    const titles = [
      'Naruto - Rocket (Doujinshi)',
      'Naruto: Road to Ninja',
      'Naruto - The Sun (Doujinshi)',
      'NARUTO: Rai no Sho',
    ];
    expect(recoverQueryFromTitles(titles, 'narut')).toBe('Naruto');
  });

  it('returns the canonical title when it is itself a prefix match', () => {
    expect(recoverQueryFromTitles(['Naruto', 'Naruto: Road to Ninja'], 'narut')).toBe('Naruto');
  });

  it('keeps a longer shared prefix when titles share more words', () => {
    const titles = ['Naruto Gaiden Vol 1', 'Naruto Gaiden Vol 2'];
    expect(recoverQueryFromTitles(titles, 'narut')).toBe('Naruto Gaiden Vol');
  });

  it('ignores titles that only contain the query mid-string', () => {
    expect(recoverQueryFromTitles(['Renge and Naruto!', 'Boku no Naruto'], 'narut')).toBeNull();
  });

  it('matches case-insensitively (casing follows the first hit)', () => {
    expect(recoverQueryFromTitles(['BLEACH', 'Bleach Short Story Edition'], 'bleac')).toBe('BLEACH');
  });

  it('returns null when nothing matches', () => {
    expect(recoverQueryFromTitles(['One Piece', 'Berserk'], 'narut')).toBeNull();
  });

  it('returns null for an empty query', () => {
    expect(recoverQueryFromTitles(['Naruto'], '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// searchMangaMerged — AniList + MyAnimeList merge with MAL as best-effort.
// ---------------------------------------------------------------------------

function anilist(over: Partial<SearchHit> & { anilistId: number }): SearchHit {
  return {
    titleEnglish: null,
    titleRomaji: null,
    titleNative: null,
    coverUrl: null,
    status: 'releasing',
    format: null,
    startYear: null,
    ...over,
  };
}

function mal(over: Partial<MalMangaHit> & { malId: number; title: string }): MalMangaHit {
  const titles = over.titles ?? {
    main: over.title,
    en: null,
    ja: null,
    synonyms: [],
    all: [over.title],
  };
  return {
    source: 'mal',
    coverUrl: null,
    status: 'releasing',
    totalVolumes: null,
    totalChapters: null,
    year: null,
    mediaType: null,
    ...over,
    titles,
  };
}

describe('searchMangaMerged', () => {
  let h: SeedHandle;

  beforeEach(async () => {
    h = await seedDb({ skipDefaultSeries: true });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    h.cleanup();
  });

  it('MAL disabled (empty client id): returns AniList-only and never calls searchMangaMal', async () => {
    await malClientIdSetting.set('');
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      anilist({ anilistId: 1, titleEnglish: 'Chainsaw Man' }),
    ]);
    const malSpy = vi.spyOn(malIndex, 'searchMangaMal');

    const out = await searchMangaMerged('chainsaw');

    expect(malSpy).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0]!.anilistId).toBe(1);
    expect(out[0]!.malId).toBeNull();
    expect(out[0]!.sources).toEqual(['anilist']);
  });

  it('MAL enabled: cross-links a shared title once and emits MAL-only hits with anilistId null', async () => {
    await malClientIdSetting.set('cid');
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      anilist({ anilistId: 1, titleEnglish: 'Chainsaw Man' }),
    ]);
    vi.spyOn(malIndex, 'searchMangaMal').mockResolvedValue([
      mal({ malId: 100, title: 'Chainsaw Man' }), // links to AniList #1
      mal({ malId: 200, title: 'MAL Only Series' }), // standalone
    ]);

    const out = await searchMangaMerged('chainsaw');

    // Cross-linked hit appears once, carrying both ids.
    const linked = out.filter((h) => h.anilistId === 1);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.malId).toBe(100);
    expect(linked[0]!.sources).toEqual(['anilist', 'mal']);

    // MAL-only hit: anilistId null, malId set, sources ['mal'].
    const malOnly = out.find((h) => h.malId === 200)!;
    expect(malOnly.anilistId).toBeNull();
    expect(malOnly.sources).toEqual(['mal']);
    expect(malOnly.titleRomaji).toBe('MAL Only Series');
  });

  it('MAL throws: still returns AniList results without surfacing the error', async () => {
    await malClientIdSetting.set('cid');
    vi.spyOn(anilistCache, 'searchMangaCached').mockResolvedValue([
      anilist({ anilistId: 1, titleEnglish: 'Chainsaw Man' }),
    ]);
    vi.spyOn(malIndex, 'searchMangaMal').mockRejectedValue(new Error('MAL HTTP 500'));

    const out = await searchMangaMerged('chainsaw');

    expect(out).toHaveLength(1);
    expect(out[0]!.anilistId).toBe(1);
    expect(out[0]!.malId).toBeNull();
    expect(out[0]!.sources).toEqual(['anilist']);
  });
});

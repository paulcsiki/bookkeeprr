import { describe, it, expect } from 'vitest';
import { crossLinkHits } from '@/server/discover/cross-link';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
import type { MalMangaHit } from '@/server/integrations/mal/schemas';

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

function mal(over: Partial<MalMangaHit> & { malId: number }): MalMangaHit {
  const titles = over.titles ?? {
    main: over.title ?? '',
    en: null,
    ja: null,
    synonyms: [],
    all: over.title ? [over.title] : [],
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
    title: titles.main,
    titles,
  };
}

describe('crossLinkHits', () => {
  it('links via shared english title', () => {
    const a = anilist({ anilistId: 1, titleEnglish: 'Vinland Saga', titleRomaji: 'Vinrando Saga' });
    const m = mal({
      malId: 100,
      titles: { main: 'Vinrando Saga', en: 'Vinland Saga', ja: null, synonyms: [], all: ['Vinrando Saga', 'Vinland Saga'] },
    });
    const out = crossLinkHits([a], [m]);
    expect(out).toHaveLength(1);
    expect(out[0]!.anilistId).toBe(1);
    expect(out[0]!.malId).toBe(100);
    expect(out[0]!.sources).toEqual(['anilist', 'mal']);
  });

  it('links via shared native / ja title', () => {
    const a = anilist({ anilistId: 1, titleEnglish: 'Something', titleNative: '進撃の巨人' });
    const m = mal({
      malId: 100,
      titles: { main: 'Shingeki no Kyojin', en: null, ja: '進撃の巨人', synonyms: [], all: ['Shingeki no Kyojin', '進撃の巨人'] },
    });
    const out = crossLinkHits([a], [m]);
    expect(out).toHaveLength(1);
    expect(out[0]!.malId).toBe(100);
  });

  it('links via a synonym', () => {
    const a = anilist({ anilistId: 1, titleEnglish: 'Attack on Titan' });
    const m = mal({
      malId: 100,
      titles: { main: 'Shingeki no Kyojin', en: null, ja: null, synonyms: ['Attack on Titan'], all: ['Shingeki no Kyojin', 'Attack on Titan'] },
    });
    const out = crossLinkHits([a], [m]);
    expect(out[0]!.malId).toBe(100);
  });

  it('links via romaji ↔ MAL main', () => {
    const a = anilist({ anilistId: 1, titleRomaji: 'One Piece' });
    const m = mal({ malId: 100, title: 'One Piece' });
    const out = crossLinkHits([a], [m]);
    expect(out[0]!.malId).toBe(100);
  });

  it('linked hit has both ids, sources order, and AniList display fields', () => {
    const a = anilist({
      anilistId: 1,
      titleEnglish: 'Berserk EN',
      titleRomaji: 'Berserk',
      titleNative: 'ベルセルク',
      coverUrl: 'https://anilist/cover.jpg',
      status: 'hiatus',
      startYear: 1989,
    });
    const m = mal({
      malId: 100,
      titles: { main: 'Berserk', en: 'Berserk MAL EN', ja: null, synonyms: [], all: ['Berserk', 'Berserk MAL EN'] },
      coverUrl: 'https://mal/cover.jpg',
      status: 'finished',
      year: 2000,
      totalVolumes: 41,
      totalChapters: 364,
    });
    const out = crossLinkHits([a], [m]);
    expect(out[0]).toEqual({
      anilistId: 1,
      malId: 100,
      sources: ['anilist', 'mal'],
      titleEnglish: 'Berserk EN',
      titleRomaji: 'Berserk',
      titleNative: 'ベルセルク',
      coverUrl: 'https://anilist/cover.jpg',
      status: 'hiatus',
      // AniList has no counts; pulled from linked MAL is not done — AniList primary.
      totalVolumes: null,
      totalChapters: null,
      year: 1989,
    });
  });

  it('AniList-only hit: malId null, sources [anilist]', () => {
    const a = anilist({ anilistId: 7, titleEnglish: 'Lonely Manga' });
    const out = crossLinkHits([a], []);
    expect(out).toHaveLength(1);
    expect(out[0]!.anilistId).toBe(7);
    expect(out[0]!.malId).toBeNull();
    expect(out[0]!.sources).toEqual(['anilist']);
  });

  it('MAL-only hit: anilistId null, sources [mal], MAL display fields', () => {
    const m = mal({
      malId: 200,
      titles: { main: 'MAL Romaji', en: 'MAL English', ja: 'MAL Native', synonyms: [], all: ['MAL Romaji', 'MAL English', 'MAL Native'] },
      coverUrl: 'https://mal/c.jpg',
      status: 'finished',
      year: 2010,
      totalVolumes: 5,
      totalChapters: 50,
    });
    const out = crossLinkHits([], [m]);
    expect(out).toEqual([
      {
        anilistId: null,
        malId: 200,
        sources: ['mal'],
        titleEnglish: 'MAL English',
        titleRomaji: 'MAL Romaji',
        titleNative: 'MAL Native',
        coverUrl: 'https://mal/c.jpg',
        status: 'finished',
        totalVolumes: 5,
        totalChapters: 50,
        year: 2010,
      },
    ]);
  });

  it('no false link when no title overlaps', () => {
    const a = anilist({ anilistId: 1, titleEnglish: 'Naruto' });
    const m = mal({ malId: 100, title: 'Bleach' });
    const out = crossLinkHits([a], [m]);
    expect(out).toHaveLength(2);
    const al = out.find((o) => o.anilistId === 1)!;
    const ml = out.find((o) => o.malId === 100)!;
    expect(al.malId).toBeNull();
    expect(al.sources).toEqual(['anilist']);
    expect(ml.anilistId).toBeNull();
    expect(ml.sources).toEqual(['mal']);
  });

  it('a MAL hit matching two AniList hits links only the first; not double-emitted', () => {
    const a1 = anilist({ anilistId: 1, titleEnglish: 'Dragon Ball' });
    const a2 = anilist({ anilistId: 2, titleEnglish: 'Dragon Ball' });
    const m = mal({ malId: 100, title: 'Dragon Ball' });
    const out = crossLinkHits([a1, a2], [m]);
    expect(out).toHaveLength(2);
    expect(out[0]!.anilistId).toBe(1);
    expect(out[0]!.malId).toBe(100);
    expect(out[1]!.anilistId).toBe(2);
    expect(out[1]!.malId).toBeNull();
    // No standalone MAL-only emission.
    expect(out.some((o) => o.anilistId === null)).toBe(false);
  });

  it('order: AniList hits first (input order), then MAL-only (input order)', () => {
    const a1 = anilist({ anilistId: 1, titleEnglish: 'Alpha' });
    const a2 = anilist({ anilistId: 2, titleEnglish: 'Beta' });
    const m1 = mal({ malId: 100, title: 'Gamma' });
    const m2 = mal({ malId: 200, title: 'Delta' });
    const out = crossLinkHits([a1, a2], [m1, m2]);
    expect(out.map((o) => [o.anilistId, o.malId])).toEqual([
      [1, null],
      [2, null],
      [null, 100],
      [null, 200],
    ]);
  });

  it('normalizes punctuation/whitespace/case when matching', () => {
    const a = anilist({ anilistId: 1, titleEnglish: '  The Vinland Saga!! ' });
    const m = mal({ malId: 100, title: 'the vinland saga' });
    const out = crossLinkHits([a], [m]);
    expect(out).toHaveLength(1);
    expect(out[0]!.malId).toBe(100);
  });

  it('does not spuriously link two hits whose titles are all empty/null', () => {
    const a = anilist({ anilistId: 1 }); // all title fields null
    const m = mal({ malId: 100, titles: { main: '', en: null, ja: null, synonyms: [], all: [] } });
    const out = crossLinkHits([a], [m]);
    expect(out).toHaveLength(2);
    expect(out[0]!.malId).toBeNull();
    expect(out[1]!.anilistId).toBeNull();
  });
});

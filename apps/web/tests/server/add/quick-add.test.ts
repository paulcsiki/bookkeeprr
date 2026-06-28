import { describe, it, expect } from 'vitest';
import { buildSeriesBody } from '@/components/add/quick-add';
import type { DiscoverResult } from '@/app/api/discover/search/route';

const base = {
  year: 2010,
  author: 'Author Name',
  coverUrl: 'https://example.com/cover.jpg',
  source: 'test',
  detail: null,
  inLib: false,
};

describe('buildSeriesBody', () => {
  it('builds a manga body from a result with anilist + mangadex cross-links', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: '123',
      title: 'Test Manga',
      sources: { anilist: 123, mangadex: 'abc-def' },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 7, rootPath: '/media/manga/Test' });
    expect(body.contentType).toBe('manga');
    expect(body.anilistId).toBe(123);
    expect(body.mangadexId).toBe('abc-def');
    expect(body.titleEnglish).toBe('Test Manga');
    expect(body.coverUrl).toBe('https://example.com/cover.jpg');
    expect(body.monitoring).toBe('future');
    expect(body.qualityProfileId).toBe(7);
    expect(body.rootPath).toBe('/media/manga/Test');
  });

  it('builds a comic body with comicvineId and required fields', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'comic',
      sourceId: '555',
      title: 'Test Comic',
      sources: { comicvine: 555 },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 2, rootPath: '/media/comics/Test' });
    expect(body.contentType).toBe('comic');
    expect(body.comicvineId).toBe(555);
    expect(body.titleEnglish).toBe('Test Comic');
    expect(body.publisher).toBe('Author Name');
    expect(body.startYear).toBe(2010);
    expect(body.coverUrl).toBe('https://example.com/cover.jpg');
    expect(body.monitoring).toBe('future');
    expect(body.qualityProfileId).toBe(2);
    expect(body.rootPath).toBe('/media/comics/Test');
  });

  it('builds a light_novel body with anilistId', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'light_novel',
      sourceId: '999',
      title: 'Test Novel',
      sources: { anilist: 999 },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 3, rootPath: '/media/books/Test' });
    expect(body.contentType).toBe('light_novel');
    expect(body.anilistId).toBe(999);
    expect(body.titleEnglish).toBe('Test Novel');
    expect(body.author).toBe('Author Name');
    expect(body.monitoring).toBe('future');
    expect(body.qualityProfileId).toBe(3);
    expect(body.rootPath).toBe('/media/books/Test');
  });

  it('builds an NU-only light_novel body with novelUpdatesSlug and no anilistId', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'light_novel',
      sourceId: 'nu:solo-leveling',
      title: 'Solo Leveling',
      source: 'novelupdates',
      sources: { novelupdates: 'solo-leveling' },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 3, rootPath: '/media/books/Solo' });
    expect(body.contentType).toBe('light_novel');
    expect(body.novelUpdatesSlug).toBe('solo-leveling');
    expect(body.anilistId).toBeUndefined();
    expect(body.titleEnglish).toBe('Solo Leveling');
  });

  it('throws for a light_novel with neither anilistId nor novelUpdatesSlug', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'light_novel',
      sourceId: 'nu:foo',
      title: 'Foo',
      sources: {},
    };
    expect(() =>
      buildSeriesBody(result, { qualityProfileId: 3, rootPath: '/media/books/Foo' }),
    ).toThrow();
  });

  it('builds an ebook body with olid from sourceId and no rootPath', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'ebook',
      sourceId: 'OL123W',
      title: 'Test Book',
      isbn: '9781234567890',
      sources: { openlibrary: 'OL123W' },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 4 });
    expect(body.contentType).toBe('ebook');
    expect(body.flow).toBe('single');
    expect(body.olid).toBe('OL123W');
    expect(body.title).toBe('Test Book');
    expect(body.isbn).toBe('9781234567890');
    expect(body.author).toBe('Author Name');
    expect(body.year).toBe(2010);
    expect(body.coverUrl).toBe('https://example.com/cover.jpg');
    expect(body.monitoring).toBe('future');
    expect(body.qualityProfileId).toBe(4);
    expect(body).not.toHaveProperty('rootPath');
  });

  it('falls back to sourceId for ebook olid when sources is absent', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'ebook',
      sourceId: 'OL999W',
      title: 'Fallback Book',
    };
    const body = buildSeriesBody(result, { qualityProfileId: 4 });
    expect(body.olid).toBe('OL999W');
  });

  it('builds an audiobook body with asin from sourceId and no rootPath', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'audiobook',
      sourceId: 'B00ASIN123',
      title: 'Test Audiobook',
      sources: { audnex: 'B00ASIN123' },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 5 });
    expect(body.contentType).toBe('audiobook');
    expect(body.asin).toBe('B00ASIN123');
    expect(body.title).toBe('Test Audiobook');
    expect(body.author).toBe('Author Name');
    expect(body.year).toBe(2010);
    expect(body.coverUrl).toBe('https://example.com/cover.jpg');
    expect(body.monitoring).toBe('future');
    expect(body.qualityProfileId).toBe(5);
    expect(body).not.toHaveProperty('rootPath');
  });

  it('builds an audiobook body WITHOUT an asin for an iTunes-sourced tile', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'audiobook',
      source: 'itunes',
      sourceId: 'itunes:555',
      title: 'Greenlights',
      // no sources.audnex → no Audible ASIN
    };
    const body = buildSeriesBody(result, { qualityProfileId: 5 });
    expect(body.contentType).toBe('audiobook');
    expect(body).not.toHaveProperty('asin'); // never the itunes: sourceId
    expect(body.title).toBe('Greenlights');
    expect(body.monitoring).toBe('future');
  });

  it('builds a MAL-only manga body with malId and no anilistId', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: 'mal:200',
      title: 'MAL Only Manga',
      source: 'mal',
      malId: 200,
      sources: { mal: 200 },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 8, rootPath: '/media/manga/MAL' });
    expect(body.contentType).toBe('manga');
    expect(body).not.toHaveProperty('anilistId');
    expect(body.malId).toBe(200);
    expect(body.titleEnglish).toBe('MAL Only Manga');
    expect(body.monitoring).toBe('future');
    expect(body.qualityProfileId).toBe(8);
    expect(body.rootPath).toBe('/media/manga/MAL');
  });

  it('builds a cross-linked manga body with both anilistId and malId', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: '123',
      title: 'Cross Linked Manga',
      malId: 456,
      sources: { anilist: 123, mal: 456, mangadex: 'abc' },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 9, rootPath: '/media/manga/X' });
    expect(body.anilistId).toBe(123);
    expect(body.malId).toBe(456);
    expect(body.mangadexId).toBe('abc');
  });

  it('builds an AniList-only manga body with anilistId and no malId', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: '321',
      title: 'AniList Only Manga',
      sources: { anilist: 321 },
    };
    const body = buildSeriesBody(result, { qualityProfileId: 1, rootPath: '/x' });
    expect(body.anilistId).toBe(321);
    expect(body).not.toHaveProperty('malId');
  });

  it('throws when a required identifier is missing (manga without anilistId or malId)', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: 'not-a-number',
      title: 'No Id Manga',
    };
    expect(() => buildSeriesBody(result, { qualityProfileId: 1, rootPath: '/x' })).toThrow();
  });

  it('throws when a required identifier is missing (comic without comicvineId)', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'comic',
      sourceId: 'nope',
      title: 'No Id Comic',
    };
    expect(() => buildSeriesBody(result, { qualityProfileId: 1, rootPath: '/x' })).toThrow();
  });

  describe('groupId ("Add into" selection)', () => {
    const results: Array<{ result: DiscoverResult; rootPath?: string }> = [
      {
        result: {
          ...base,
          contentType: 'manga',
          sourceId: '123',
          title: 'G Manga',
          sources: { anilist: 123 },
        },
        rootPath: '/media/comics/G',
      },
      {
        result: {
          ...base,
          contentType: 'comic',
          sourceId: '555',
          title: 'G Comic',
          sources: { comicvine: 555 },
        },
        rootPath: '/media/comics/G',
      },
      {
        result: {
          ...base,
          contentType: 'light_novel',
          sourceId: '999',
          title: 'G Novel',
          sources: { anilist: 999 },
        },
        rootPath: '/media/books/G',
      },
      {
        result: {
          ...base,
          contentType: 'ebook',
          sourceId: 'OL123W',
          title: 'G Book',
          sources: { openlibrary: 'OL123W' },
        },
      },
      {
        result: {
          ...base,
          contentType: 'audiobook',
          sourceId: 'B00ASIN123',
          title: 'G Audiobook',
          sources: { audnex: 'B00ASIN123' },
        },
      },
    ];

    it('includes groupId on every content-type body when provided', () => {
      for (const { result, rootPath } of results) {
        const body = buildSeriesBody(result, { qualityProfileId: 1, rootPath, groupId: 42 });
        expect(body.groupId, result.contentType).toBe(42);
      }
    });

    it('omits the groupId key when null (Library root)', () => {
      for (const { result, rootPath } of results) {
        const body = buildSeriesBody(result, { qualityProfileId: 1, rootPath, groupId: null });
        expect(body, result.contentType).not.toHaveProperty('groupId');
      }
    });

    it('omits the groupId key when undefined', () => {
      for (const { result, rootPath } of results) {
        const body = buildSeriesBody(result, { qualityProfileId: 1, rootPath });
        expect(body, result.contentType).not.toHaveProperty('groupId');
      }
    });
  });
});

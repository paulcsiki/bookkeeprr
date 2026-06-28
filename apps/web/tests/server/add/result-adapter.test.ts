import { describe, it, expect } from 'vitest';
import { toSheetHit } from '@/components/add/result-adapter';
import type { DiscoverResult } from '@/app/api/discover/search/route';

const base = {
  year: 2010,
  author: 'Author Name',
  coverUrl: 'https://example.com/cover.jpg',
  source: 'test',
  detail: null,
  inLib: false,
};

describe('toSheetHit (manga)', () => {
  it('carries malId and a null anilistId for a MAL-only result (never 0)', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: 'mal:200',
      title: 'MAL Only Manga',
      source: 'mal',
      malId: 200,
      sources: { mal: 200 },
    };
    const target = toSheetHit(result);
    expect(target.type).toBe('manga');
    if (target.type !== 'manga') throw new Error('expected manga target');
    expect(target.hit.anilistId).toBeNull();
    expect(target.hit.anilistId).not.toBe(0);
    expect(target.hit.malId).toBe(200);
    expect(target.hit.titleEnglish).toBe('MAL Only Manga');
  });

  it('carries both ids for a cross-linked result', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: '123',
      title: 'Cross Linked',
      malId: 456,
      sources: { anilist: 123, mal: 456 },
    };
    const target = toSheetHit(result);
    if (target.type !== 'manga') throw new Error('expected manga target');
    expect(target.hit.anilistId).toBe(123);
    expect(target.hit.malId).toBe(456);
  });

  it('keeps AniList-only behaviour (real anilistId, null malId)', () => {
    const result: DiscoverResult = {
      ...base,
      contentType: 'manga',
      sourceId: '321',
      title: 'AniList Only',
      sources: { anilist: 321 },
    };
    const target = toSheetHit(result);
    if (target.type !== 'manga') throw new Error('expected manga target');
    expect(target.hit.anilistId).toBe(321);
    expect(target.hit.malId).toBeNull();
  });
});

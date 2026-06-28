import { describe, expect, it } from 'vitest';
import { anilistMangaUrl, mangadexMangaUrl, novelUpdatesUrl } from '@/lib/external-links';

describe('external-links', () => {
  it('anilistMangaUrl', () => {
    expect(anilistMangaUrl(123)).toBe('https://anilist.co/manga/123');
  });

  it('mangadexMangaUrl', () => {
    expect(mangadexMangaUrl('abc-def')).toBe('https://mangadex.org/title/abc-def');
  });

  it('novelUpdatesUrl builds the series URL from a slug', () => {
    expect(novelUpdatesUrl('solo-leveling')).toBe(
      'https://www.novelupdates.com/series/solo-leveling/',
    );
  });
});

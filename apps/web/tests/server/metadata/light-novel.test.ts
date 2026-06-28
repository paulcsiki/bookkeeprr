import { describe, expect, it, vi } from 'vitest';
import * as anilistCache from '@/server/integrations/anilist/cache';
import * as nuClient from '@/server/integrations/novelupdates/client';
import { composeNovelMetadata } from '@/server/metadata/light-novel';

describe('composeNovelMetadata', () => {
  it('returns hits from both sources in parallel', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'Mushoku Tensei',
        titleRomaji: 'Mushoku Tensei',
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: 'NOVEL',
        startYear: 2012,
      },
    ]);
    vi.spyOn(nuClient, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'mushoku-tensei', title: 'Mushoku Tensei', coverUrl: null, year: 2012 },
    ]);

    const result = await composeNovelMetadata('mushoku');
    expect(result.aniList.length).toBe(1);
    expect(result.novelUpdates.length).toBe(1);
    expect(result.aniList[0]!.anilistId).toBe(1);
    expect(result.novelUpdates[0]!.slug).toBe('mushoku-tensei');
    vi.restoreAllMocks();
  });

  it('returns NU hits when AniList fails', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockRejectedValue(new Error('anilist down'));
    vi.spyOn(nuClient, 'searchNovelUpdates').mockResolvedValue([
      { slug: 'mushoku-tensei', title: 'Mushoku Tensei', coverUrl: null, year: 2012 },
    ]);

    const result = await composeNovelMetadata('mushoku');
    expect(result.aniList).toEqual([]);
    expect(result.novelUpdates.length).toBe(1);
    vi.restoreAllMocks();
  });

  it('returns AniList hits when NU fails', async () => {
    vi.spyOn(anilistCache, 'searchNovelCached').mockResolvedValue([
      {
        anilistId: 1,
        titleEnglish: 'X',
        titleRomaji: 'X',
        titleNative: null,
        coverUrl: null,
        status: 'releasing',
        format: null,
        startYear: null,
      },
    ]);
    vi.spyOn(nuClient, 'searchNovelUpdates').mockRejectedValue(new Error('nu down'));

    const result = await composeNovelMetadata('x');
    expect(result.aniList.length).toBe(1);
    expect(result.novelUpdates).toEqual([]);
    vi.restoreAllMocks();
  });
});

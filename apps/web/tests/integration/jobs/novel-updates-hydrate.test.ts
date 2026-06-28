import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { novelUpdatesHydrateDescriptor } from '@/server/jobs/kinds/novel-updates-hydrate';
import { insertSeries, getSeries, updateSeries } from '@/server/db/series';
import * as nuClient from '@/server/integrations/novelupdates/client';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

async function makeLnSeries(slug: string | null): Promise<number> {
  const id = await insertSeries({
    contentType: 'light_novel',
    anilistId: 1,
    rootPath: '/tmp/ln',
    qualityProfileId: h.qpId,
    titleEnglish: 'Test LN',
    status: 'releasing',
  });
  if (slug !== null) {
    await updateSeries(id, { novelUpdatesSlug: slug });
  }
  return id;
}

describe('novel_updates_hydrate', () => {
  it('no-op when series has no novelUpdatesSlug', async () => {
    const id = await makeLnSeries(null);
    const spy = vi.spyOn(nuClient, 'getSeriesBySlug');
    const result = await novelUpdatesHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(spy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).toEqual([]);
  });

  it('populates numericId, author, totalVolumes, aliases on first hydrate', async () => {
    const id = await makeLnSeries('mushoku-tensei');
    vi.spyOn(nuClient, 'getSeriesBySlug').mockResolvedValue({
      slug: 'mushoku-tensei',
      numericId: 2000,
      title: 'Mushoku Tensei',
      aliases: ['無職転生', 'Wuzhi Zhuansheng'],
      coverUrl: null,
      description: null,
      author: 'Rifujin na Magonote',
      illustrator: 'Shirotaka',
      originalLanguage: 'Japanese',
      totalVolumes: 26,
      statusInCoo: '26 Volumes (Completed)',
    });

    const result = await novelUpdatesHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(result.fieldsUpdated).toContain('novelUpdatesId');
    expect(result.fieldsUpdated).toContain('author');
    expect(result.fieldsUpdated).toContain('totalVolumes');
    // Aliases are NOT merged into extraSearchTermsJson — the indexer query
    // template AND-appends extras, so foreign-language aliases would
    // over-constrain the release search to zero matches.
    expect(result.fieldsUpdated).not.toContain('extraSearchTermsJson');

    const updated = await getSeries(id);
    expect(updated!.novelUpdatesId).toBe(2000);
    expect(updated!.author).toBe('Rifujin na Magonote');
    expect(updated!.totalVolumes).toBe(26);
    expect(JSON.parse(updated!.extraSearchTermsJson ?? '[]')).toEqual([]);
  });

  it('does not overwrite non-null AniList-set fields', async () => {
    const id = await makeLnSeries('mushoku-tensei');
    await updateSeries(id, { author: 'AniList Author', totalVolumes: 12 });

    vi.spyOn(nuClient, 'getSeriesBySlug').mockResolvedValue({
      slug: 'mushoku-tensei',
      numericId: 2000,
      title: 'Mushoku Tensei',
      aliases: ['無職転生'],
      coverUrl: null,
      description: null,
      author: 'NU Author',
      illustrator: null,
      originalLanguage: null,
      totalVolumes: 26,
      statusInCoo: '26 Volumes',
    });

    await novelUpdatesHydrateDescriptor.handler({ seriesId: id }, 1);
    const updated = await getSeries(id);
    expect(updated!.author).toBe('AniList Author');
    expect(updated!.totalVolumes).toBe(12);
    expect(updated!.novelUpdatesId).toBe(2000);
  });
});

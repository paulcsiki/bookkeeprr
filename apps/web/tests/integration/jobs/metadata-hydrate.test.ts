import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import * as anilist from '@/server/integrations/anilist/client';
import * as nu from '@/server/integrations/novelupdates';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { metadataHydrateDescriptor } from '@/server/jobs/kinds/metadata-hydrate';
import { listVolumesBySeries } from '@/server/db/volumes';
import { getSeries, insertSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ anilistId: 105778 });
  vi.restoreAllMocks();
});
afterEach(() => {
  h.cleanup();
});

describe('metadata_hydrate job', () => {
  it('populates volumes from AniList', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue({
      anilistId: 105778,
      titleEnglish: 'Chainsaw Man',
      titleRomaji: 'Chainsaw Man',
      titleNative: 'チェンソーマン',
      coverUrl: 'https://x/y.jpg',
      status: 'releasing',
      format: 'MANGA',
      startYear: 2018,
      description: 'A story.',
      totalVolumes: 3,
      totalChapters: 27,
    });

    await enqueueJob('metadata_hydrate', { seriesId: h.seriesId });
    const result = await runOnce(metadataHydrateDescriptor);
    expect(result).toBe('ran');

    const vols = await listVolumesBySeries(h.seriesId);
    // seedDb pre-creates volume 1; hydrate should ADD 2 and 3 without touching 1
    const numbers = vols.map((v) => v.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3]);

    const series = await getSeries(h.seriesId);
    expect(series?.coverUrl).toBe('https://x/y.jpg');
    expect(series?.totalVolumes).toBe(3);
  });

  it('is idempotent: re-running does not duplicate volumes', async () => {
    vi.spyOn(anilist, 'getManga').mockResolvedValue({
      anilistId: 105778,
      titleEnglish: 'X',
      titleRomaji: null,
      titleNative: null,
      coverUrl: null,
      status: 'releasing',
      format: null,
      startYear: null,
      description: null,
      totalVolumes: 2,
      totalChapters: null,
    });
    await enqueueJob('metadata_hydrate', { seriesId: h.seriesId });
    await runOnce(metadataHydrateDescriptor);
    await enqueueJob('metadata_hydrate', { seriesId: h.seriesId });
    await runOnce(metadataHydrateDescriptor);
    const vols = await listVolumesBySeries(h.seriesId);
    expect(vols).toHaveLength(2);
  });

  it('re-hydrates an NU-anchored novel (anilistId null + slug) from the NU client, seeds no volumes', async () => {
    const nuSeriesId = await insertSeries({
      contentType: 'light_novel',
      anilistId: null,
      status: 'releasing',
      rootPath: '/media/books/Solo Leveling',
      qualityProfileId: h.qpId,
      titleEnglish: 'Old Title',
      granularity: 'volume',
      novelUpdatesSlug: 'solo-leveling',
    });
    const nuSpy = vi.spyOn(nu, 'getSeriesBySlug').mockResolvedValue({
      slug: 'solo-leveling',
      numericId: 999,
      title: 'Solo Leveling',
      aliases: [],
      coverUrl: 'https://nu/cover.jpg',
      description: 'desc',
      author: 'Chugong',
      illustrator: null,
      originalLanguage: 'Korean',
      totalVolumes: null,
      statusInCoo: 'Completed',
    });
    const aniSpy = vi.spyOn(anilist, 'getManga');

    await enqueueJob('metadata_hydrate', { seriesId: nuSeriesId });
    await runOnce(metadataHydrateDescriptor);

    expect(nuSpy).toHaveBeenCalledWith('solo-leveling');
    expect(aniSpy).not.toHaveBeenCalled();
    const series = await getSeries(nuSeriesId);
    expect(series?.titleEnglish).toBe('Solo Leveling');
    expect(series?.coverUrl).toBe('https://nu/cover.jpg');
    expect(series?.description).toBe('desc');
    expect(series?.status).toBe('finished');
    const vols = await listVolumesBySeries(nuSeriesId);
    expect(vols).toHaveLength(0);
  });
});

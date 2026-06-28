import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import * as mal from '@/server/integrations/mal';
import type { MalMangaDetail } from '@/server/integrations/mal/schemas';
import { enqueueJob, listJobsByKind } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { malHydrateDescriptor } from '@/server/jobs/kinds/mal-hydrate';
import { listVolumesBySeries } from '@/server/db/volumes';
import { getSeries, insertSeries } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  vi.restoreAllMocks();
});
afterEach(() => h.cleanup());

const detail = (overrides: Partial<MalMangaDetail> = {}): MalMangaDetail => ({
  source: 'mal',
  malId: 4242,
  title: 'Berserk',
  titles: {
    main: 'Berserk',
    en: 'Berserk (English)',
    ja: 'ベルセルク',
    synonyms: [],
    all: ['Berserk', 'Berserk (English)', 'ベルセルク'],
  },
  coverUrl: 'https://mal/cover.jpg',
  status: 'hiatus',
  totalVolumes: 3,
  totalChapters: 360,
  year: 1989,
  mediaType: 'manga',
  synopsis: 'Guts wields a big sword.',
  ...overrides,
});

async function newMalSeries(malId: number | null): Promise<number> {
  return insertSeries({
    malId,
    status: 'releasing',
    rootPath: `/media/comics/MAL-${malId ?? 'none'}-${Math.random()}`,
    qualityProfileId: h.qpId,
  });
}

describe('mal_hydrate job', () => {
  it('hydrates a series: title fields, cover, counts, status, volume stubs, chain', async () => {
    const seriesId = await newMalSeries(4242);
    const getSpy = vi.spyOn(mal, 'getMangaMal').mockResolvedValue(detail());

    await enqueueJob('mal_hydrate', { seriesId });
    expect(await runOnce(malHydrateDescriptor)).toBe('ran');

    expect(getSpy).toHaveBeenCalledWith(4242);

    const s = await getSeries(seriesId);
    expect(s?.titleEnglish).toBe('Berserk (English)');
    expect(s?.titleRomaji).toBe('Berserk');
    expect(s?.titleNative).toBe('ベルセルク');
    expect(s?.coverUrl).toBe('https://mal/cover.jpg');
    expect(s?.description).toBe('Guts wields a big sword.');
    expect(s?.status).toBe('hiatus');
    expect(s?.totalVolumes).toBe(3);
    expect(s?.totalChapters).toBe(360);

    const vols = await listVolumesBySeries(seriesId);
    expect(vols.map((v) => v.number).sort((a, b) => a - b)).toEqual([1, 2, 3]);

    const volHydrate = await listJobsByKind('mangadex_volume_hydrate');
    const chapterSync = await listJobsByKind('mangadex_chapter_sync');
    expect(volHydrate.some((j) => j.payloadJson.includes(`"seriesId":${seriesId}`))).toBe(true);
    expect(chapterSync.some((j) => j.payloadJson.includes(`"seriesId":${seriesId}`))).toBe(true);
  });

  it('falls back to titles.main for titleEnglish when titles.en is null', async () => {
    const seriesId = await newMalSeries(4242);
    vi.spyOn(mal, 'getMangaMal').mockResolvedValue(
      detail({
        titles: { main: 'Berserk', en: null, ja: 'ベルセルク', synonyms: [], all: ['Berserk', 'ベルセルク'] },
      }),
    );

    await enqueueJob('mal_hydrate', { seriesId });
    await runOnce(malHydrateDescriptor);

    const s = await getSeries(seriesId);
    expect(s?.titleEnglish).toBe('Berserk');
  });

  it('no-ops when the series has no mal_id (no fetch)', async () => {
    const seriesId = await newMalSeries(null);
    const getSpy = vi.spyOn(mal, 'getMangaMal');

    await enqueueJob('mal_hydrate', { seriesId });
    const result = await malHydrateDescriptor.handler({ seriesId }, 0);

    expect(result).toEqual({ volumesAdded: 0 });
    expect(getSpy).not.toHaveBeenCalled();
    expect(await listVolumesBySeries(seriesId)).toHaveLength(0);
  });

  it('no-ops when getMangaMal returns null', async () => {
    const seriesId = await newMalSeries(9999);
    const getSpy = vi.spyOn(mal, 'getMangaMal').mockResolvedValue(null);

    await enqueueJob('mal_hydrate', { seriesId });
    const result = await malHydrateDescriptor.handler({ seriesId }, 0);

    expect(result).toEqual({ volumesAdded: 0 });
    expect(getSpy).toHaveBeenCalledWith(9999);
    expect(await listVolumesBySeries(seriesId)).toHaveLength(0);
    // Series fields untouched.
    expect((await getSeries(seriesId))?.coverUrl).toBeNull();
  });

  it('is idempotent: a second run adds no new volumes and reports volumesAdded 0', async () => {
    const seriesId = await newMalSeries(4242);
    vi.spyOn(mal, 'getMangaMal').mockResolvedValue(detail());

    await enqueueJob('mal_hydrate', { seriesId });
    await runOnce(malHydrateDescriptor);
    const after1 = await listVolumesBySeries(seriesId);

    const result2 = await malHydrateDescriptor.handler({ seriesId }, 0);
    expect(result2).toEqual({ volumesAdded: 0 });

    const after2 = await listVolumesBySeries(seriesId);
    expect(after2.length).toBe(after1.length);
    expect(after2.length).toBe(3);
  });
});

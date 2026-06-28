import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import * as md from '@/server/integrations/mangadex/client';
import * as ol from '@/server/integrations/openlibrary';
import * as gb from '@/server/integrations/googlebooks';
import * as cv from '@/server/integrations/comicvine';
import type { OpenLibrarySearchHit } from '@/server/integrations/openlibrary';
import { comicVineApiKeySetting } from '@/server/db/settings/comicvine';
import { enqueueJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { mangadexVolumeHydrateDescriptor } from '@/server/jobs/kinds/mangadex-volume-hydrate';
import { insertVolume, listVolumesBySeries, updateVolume } from '@/server/db/volumes';
import { getSeries, updateSeries, updateSeriesMetadata } from '@/server/db/series';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ anilistId: 105778 });
  vi.restoreAllMocks();
  // Default: Open Library returns nothing, so the fallback pass is a no-op
  // unless a test opts in. matchVolumeEdition stays real (pure helper).
  vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);
  // Default: Google Books returns nothing, so the GB cover pass is a no-op
  // unless a test opts in. pickVolumeEdition stays real (pure helper). This
  // also prevents the unmocked GB client from hitting the rate-limited network.
  vi.spyOn(gb, 'searchVolumeEdition').mockResolvedValue([]);
});
afterEach(() => h.cleanup());

// Build an OL hit titled so the real matchVolumeEdition accepts it for `vol`.
const olHit = (
  vol: number,
  overrides: Partial<OpenLibrarySearchHit> = {},
): OpenLibrarySearchHit => ({
  olid: `OL${vol}M`,
  title: `Test Series, Vol. ${vol}`,
  author: 'Author',
  firstPublishYear: 2013,
  isbn: `978000000${vol}`,
  coverUrl: `https://ol/cover-v${vol}.jpg`,
  ...overrides,
});

const chapter = (volume: number | null, publishAt: Date | null, sort: number) => ({
  mangadexChapterId: `c${sort}`,
  numberText: String(sort),
  numberSort: sort,
  volume,
  title: null,
  publishAt,
  language: 'en',
});

describe('mangadex_volume_hydrate job', () => {
  it('creates missing volumes, sets title, cover, and earliest releaseDate', async () => {
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 3 });
    vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([
      { volume: 1, url: 'https://cdn/v1.jpg' },
      { volume: 2, url: 'https://cdn/v2.jpg' },
    ]);
    vi.spyOn(md, 'getChapters').mockResolvedValue([
      chapter(2, new Date('2020-06-01T00:00:00Z'), 10),
      chapter(2, new Date('2020-01-01T00:00:00Z'), 9), // earlier -> wins for vol 2
      chapter(3, new Date('2021-01-01T00:00:00Z'), 30),
    ]);

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    expect(await runOnce(mangadexVolumeHydrateDescriptor)).toBe('ran');

    const vols = await listVolumesBySeries(h.seriesId);
    const byNum = new Map(vols.map((v) => [v.number, v]));
    expect([...byNum.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3]);

    // Titles always "Volume N" (overwrites seed's "v1").
    expect(byNum.get(1)?.title).toBe('Volume 1');
    expect(byNum.get(2)?.title).toBe('Volume 2');

    // Covers stored in metadataJson.
    expect(JSON.parse(byNum.get(1)!.metadataJson)).toEqual({ coverUrl: 'https://cdn/v1.jpg' });
    expect(JSON.parse(byNum.get(2)!.metadataJson)).toEqual({ coverUrl: 'https://cdn/v2.jpg' });
    // Volume 3 has no cover.
    expect(JSON.parse(byNum.get(3)!.metadataJson).coverUrl).toBeUndefined();

    // releaseDate = earliest chapter publishAt for that volume.
    expect(byNum.get(2)?.releaseDate?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    expect(byNum.get(3)?.releaseDate?.toISOString()).toBe('2021-01-01T00:00:00.000Z');
    // Volume 1 has no chapters -> no releaseDate.
    expect(byNum.get(1)?.releaseDate).toBeNull();
  });

  it('merges coverUrl into metadataJson without clobbering other keys', async () => {
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
    await updateVolume(h.volumeId, { metadataJson: JSON.stringify({ keep: 'me' }) });
    vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
    vi.spyOn(md, 'getChapters').mockResolvedValue([]);

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    await runOnce(mangadexVolumeHydrateDescriptor);

    const vols = await listVolumesBySeries(h.seriesId);
    expect(JSON.parse(vols[0]!.metadataJson)).toEqual({ keep: 'me', coverUrl: 'https://cdn/v1.jpg' });
  });

  it('does not overwrite an existing releaseDate', async () => {
    const existing = new Date('2010-01-01T00:00:00Z');
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
    await updateVolume(h.volumeId, { releaseDate: existing });
    vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
    vi.spyOn(md, 'getChapters').mockResolvedValue([
      chapter(1, new Date('2022-01-01T00:00:00Z'), 1),
    ]);

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    await runOnce(mangadexVolumeHydrateDescriptor);

    const vols = await listVolumesBySeries(h.seriesId);
    expect(vols[0]?.releaseDate?.toISOString()).toBe(existing.toISOString());
  });

  it('is idempotent: a second run makes no further changes', async () => {
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 2 });
    vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
    vi.spyOn(md, 'getChapters').mockResolvedValue([
      chapter(1, new Date('2020-01-01T00:00:00Z'), 1),
    ]);

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    await runOnce(mangadexVolumeHydrateDescriptor);
    const after1 = await listVolumesBySeries(h.seriesId);

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    const result2 = await mangadexVolumeHydrateDescriptor.handler({ seriesId: h.seriesId }, 0);
    expect(result2).toEqual({ volumesAdded: 0, volumesUpdated: 0 });

    const after2 = await listVolumesBySeries(h.seriesId);
    expect(after2.length).toBe(after1.length);
    expect(after2.length).toBe(2);
  });

  it('resolves mangadexId via findMangaByTitles when missing', async () => {
    // Seed has anilistId but no mangadexId.
    vi.spyOn(md, 'findMangaByTitles').mockResolvedValue({
      mangadexId: 'resolved-uuid',
      titleEnglish: 'T',
      titleJa: null,
      status: null,
      year: null,
    });
    vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
    vi.spyOn(md, 'getChapters').mockResolvedValue([]);

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    await runOnce(mangadexVolumeHydrateDescriptor);

    const series = await getSeries(h.seriesId);
    expect(series?.mangadexId).toBe('resolved-uuid');
  });

  it('no-ops (does not throw) when there is no mangadexId and none resolves', async () => {
    const resolveSpy = vi.spyOn(md, 'findMangaByTitles').mockResolvedValue(null);
    const coverSpy = vi.spyOn(md, 'getVolumeCovers');

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    const result = await mangadexVolumeHydrateDescriptor.handler({ seriesId: h.seriesId }, 0);

    expect(result).toEqual({ volumesAdded: 0, volumesUpdated: 0 });
    expect(resolveSpy).toHaveBeenCalled();
    expect(coverSpy).not.toHaveBeenCalled();
    // Series must NOT be poisoned with a wrong id, and the seed volume untouched.
    expect((await getSeries(h.seriesId))?.mangadexId).toBeNull();
    const vols = await listVolumesBySeries(h.seriesId);
    expect(vols).toHaveLength(1);
    expect(vols[0]?.title).toBe('v1');
  });

  it('fills covers from Google Books when MangaDex lacks them', async () => {
    await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 3 });
    vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
    vi.spyOn(md, 'getChapters').mockResolvedValue([]);
    // OL returns nothing (default mock); Google Books supplies vols 2 and 3.
    vi.spyOn(gb, 'searchVolumeEdition').mockImplementation(async (_title, n) =>
      n === 1
        ? []
        : [
            {
              id: `gb${n}QBAJ`,
              title: `Test Series, Vol. ${n}`,
              publisher: 'VIZ',
              description: 'd',
              pageCount: 200,
              language: 'en',
              coverUrl: `https://books.google.com/v${n}.jpg`,
              viewability: 'PARTIAL',
              isbn: `97800${n}`,
            },
          ],
    );

    await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
    expect(await runOnce(mangadexVolumeHydrateDescriptor)).toBe('ran');

    const vols = await listVolumesBySeries(h.seriesId);
    const byNum = new Map(vols.map((v) => [v.number, JSON.parse(v.metadataJson) as Record<string, unknown>]));
    expect(byNum.get(1)?.coverUrl).toBe('https://cdn/v1.jpg'); // MangaDex wins
    expect(byNum.get(2)?.coverUrl).toBe('https://books.google.com/v2.jpg');
    expect(byNum.get(2)?.coverSource).toBe('googlebooks');
    expect(byNum.get(3)?.coverSource).toBe('googlebooks');
  });

  describe('open library fallback', () => {
    it('fills a coverless volume from OL and tags coverSource', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 2 });
      // MangaDex covers vol 1 only; vol 2 is coverless.
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      vi.spyOn(ol, 'searchBooks').mockImplementation(async (q: string) =>
        q.includes('vol 2') ? [olHit(2)] : [],
      );

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const byNum = new Map((await listVolumesBySeries(h.seriesId)).map((v) => [v.number, v]));
      // Vol 1 keeps the MangaDex cover, no openlibrary tag.
      const m1 = JSON.parse(byNum.get(1)!.metadataJson);
      expect(m1.coverUrl).toBe('https://cdn/v1.jpg');
      expect(m1.coverSource).toBeUndefined();
      // Vol 2 gets the OL cover + tag + year.
      const m2 = JSON.parse(byNum.get(2)!.metadataJson);
      expect(m2.coverUrl).toBe('https://ol/cover-v2.jpg');
      expect(m2.coverSource).toBe('openlibrary');
      expect(m2.releaseYear).toBe(2013);
      expect(m2.olid).toBe('OL2M');
    });

    it('does not overwrite a MangaDex cover with OL', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // OL would offer a cover, but vol 1 already has a MangaDex one (still a gap
      // on the date side, so OL is queried — its cover must be ignored).
      vi.spyOn(ol, 'searchBooks').mockResolvedValue([olHit(1)]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const vols = await listVolumesBySeries(h.seriesId);
      const meta = JSON.parse(vols[0]!.metadataJson);
      expect(meta.coverUrl).toBe('https://cdn/v1.jpg');
      expect(meta.coverSource).toBeUndefined();
      // OL year still fills since there's no precise date.
      expect(meta.releaseYear).toBe(2013);
    });

    it('sets releaseYear from OL only when no precise date exists', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
      // Vol 1 has a precise releaseDate from a chapter -> no OL year.
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([
        chapter(1, new Date('2019-05-01T00:00:00Z'), 1),
      ]);
      vi.spyOn(ol, 'searchBooks').mockResolvedValue([olHit(1)]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const vols = await listVolumesBySeries(h.seriesId);
      expect(vols[0]?.releaseDate?.toISOString()).toBe('2019-05-01T00:00:00.000Z');
      expect(JSON.parse(vols[0]!.metadataJson).releaseYear).toBeUndefined();
    });

    it('does not overwrite an existing releaseYear', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
      await updateVolume(h.volumeId, {
        metadataJson: JSON.stringify({ coverUrl: 'https://cdn/v1.jpg', releaseYear: 2005 }),
      });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      vi.spyOn(ol, 'searchBooks').mockResolvedValue([olHit(1, { firstPublishYear: 2013 })]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const vols = await listVolumesBySeries(h.seriesId);
      expect(JSON.parse(vols[0]!.metadataJson).releaseYear).toBe(2005);
    });

    it('drops the openlibrary coverSource when MangaDex later provides the cover', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
      // Vol 1 was previously filled from OL.
      await updateVolume(h.volumeId, {
        metadataJson: JSON.stringify({
          coverUrl: 'https://ol/old.jpg',
          coverSource: 'openlibrary',
          olid: 'OL1M',
        }),
      });
      // Now MangaDex has a cover for vol 1.
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const vols = await listVolumesBySeries(h.seriesId);
      const meta = JSON.parse(vols[0]!.metadataJson);
      expect(meta.coverUrl).toBe('https://cdn/v1.jpg');
      expect(meta.coverSource).toBeUndefined();
      // Edition identity is preserved.
      expect(meta.olid).toBe('OL1M');
    });

    it('leaves the volume untouched when OL does not match', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // Wrong volume number in the hit -> matchVolumeEdition returns null.
      vi.spyOn(ol, 'searchBooks').mockResolvedValue([olHit(7)]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const vols = await listVolumesBySeries(h.seriesId);
      const meta = JSON.parse(vols[0]!.metadataJson);
      expect(meta.coverUrl).toBeUndefined();
      expect(meta.releaseYear).toBeUndefined();
      expect(vols[0]?.releaseDate).toBeNull();
    });

    it('skips the OL pass entirely when seriesTitles is empty', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
      await updateSeries(h.seriesId, { titleEnglish: null, titleRomaji: null });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      const searchSpy = vi.spyOn(ol, 'searchBooks').mockResolvedValue([olHit(1)]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      expect(searchSpy).not.toHaveBeenCalled();
    });

    it('is idempotent: a second run writes nothing new after OL fill', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 2 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      vi.spyOn(ol, 'searchBooks').mockImplementation(async (q: string) =>
        q.includes('vol 2') ? [olHit(2)] : [],
      );

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      const result2 = await mangadexVolumeHydrateDescriptor.handler({ seriesId: h.seriesId }, 0);
      expect(result2).toEqual({ volumesAdded: 0, volumesUpdated: 0 });
    });

    it('respects the OL_FALLBACK_MAX cap and logs the remainder', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 70 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      const searchSpy = vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      // 70 gaps, cap 60 -> at most 60 OL searches.
      expect(searchSpy).toHaveBeenCalledTimes(60);
    });

    it('re-enqueues itself when it filled covers but gaps remain', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 3 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // GB fills only vol 2 this run; vol 3 stays a gap -> expect a re-enqueue.
      vi.spyOn(gb, 'searchVolumeEdition').mockImplementation(async (_t, n) =>
        n === 2
          ? [{ id: 'gb2QBAJ', title: 'Test Series, Vol. 2', publisher: 'V', description: 'd', pageCount: 1, language: 'en', coverUrl: 'https://g/v2.jpg', viewability: 'PARTIAL', isbn: '2' }]
          : [],
      );

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const { getDb } = await import('@/server/db/client');
      const { jobs } = await import('@/server/db/schema');
      const { eq } = await import('drizzle-orm');
      const all = await getDb().select().from(jobs).where(eq(jobs.kind, 'mangadex_volume_hydrate'));
      const reEnqueued = all.filter((j) => JSON.parse(j.payloadJson).pass === 1);
      expect(reEnqueued).toHaveLength(1);
    });

    it('does not re-enqueue when no progress was made', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 3 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // gb default mock returns [] (no covers) from beforeEach.

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const { getDb } = await import('@/server/db/client');
      const { jobs } = await import('@/server/db/schema');
      const { eq } = await import('drizzle-orm');
      const all = await getDb().select().from(jobs).where(eq(jobs.kind, 'mangadex_volume_hydrate'));
      expect(all.filter((j) => JSON.parse(j.payloadJson).pass === 1)).toHaveLength(0);
    });

    it('stops re-enqueuing at the MAX_PASSES ceiling, even with progress + gaps', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 3 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // GB fills vol 2 (progress); vol 3 stays a gap — a run below the ceiling
      // would re-enqueue. The gate is `pass < MAX_PASSES` (6), so pass 6 is the
      // terminal pass and must not spawn a pass 7.
      vi.spyOn(gb, 'searchVolumeEdition').mockImplementation(async (_t, n) =>
        n === 2
          ? [{ id: 'gb2QBAJ', title: 'Test Series, Vol. 2', publisher: 'V', description: 'd', pageCount: 1, language: 'en', coverUrl: 'https://g/v2.jpg', viewability: 'PARTIAL', isbn: '2' }]
          : [],
      );

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId, pass: 6 });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const { getDb } = await import('@/server/db/client');
      const { jobs } = await import('@/server/db/schema');
      const { eq } = await import('drizzle-orm');
      const all = await getDb().select().from(jobs).where(eq(jobs.kind, 'mangadex_volume_hydrate'));
      // No pass-7 follow-up may be created once the ceiling is hit.
      expect(all.filter((j) => JSON.parse(j.payloadJson).pass === 7)).toHaveLength(0);
    });

    it('re-enqueues on year progress alone, even when no cover was added', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 2 });
      // Both volumes already have covers but no dates/years (year-only gaps).
      await updateVolume(h.volumeId, {
        metadataJson: JSON.stringify({ coverUrl: 'https://c/v1.jpg' }),
      });
      await insertVolume({
        seriesId: h.seriesId,
        number: 2,
        title: 'Volume 2',
        releaseDate: null,
        metadataJson: JSON.stringify({ coverUrl: 'https://c/v2.jpg' }),
      });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // OL supplies a year for vol 1 only; its cover is ignored (cover present).
      vi.spyOn(ol, 'searchBooks').mockImplementation(async (q: string) =>
        q.includes('vol 1') ? [olHit(1)] : [],
      );

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const byNum = new Map((await listVolumesBySeries(h.seriesId)).map((v) => [v.number, v]));
      expect(JSON.parse(byNum.get(1)!.metadataJson).releaseYear).toBe(2013);
      expect(JSON.parse(byNum.get(2)!.metadataJson).releaseYear).toBeUndefined();

      const { getDb } = await import('@/server/db/client');
      const { jobs } = await import('@/server/db/schema');
      const { eq } = await import('drizzle-orm');
      const all = await getDb().select().from(jobs).where(eq(jobs.kind, 'mangadex_volume_hydrate'));
      // Year-only progress with a remaining year-gap must keep the chain alive.
      expect(all.filter((j) => JSON.parse(j.payloadJson).pass === 1)).toHaveLength(1);
    });

    it('GB gap list advances past already-complete volumes (cover + year)', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 2 });
      // Vol 1 is fully complete (cover + year) from a prior pass; vol 2 is the gap.
      await updateVolume(h.volumeId, {
        metadataJson: JSON.stringify({
          coverUrl: 'https://prior/v1.jpg',
          coverSource: 'googlebooks',
          releaseYear: 2012,
        }),
      });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]); // MangaDex has no covers
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      const gbSpy = vi.spyOn(gb, 'searchVolumeEdition').mockResolvedValue([]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      // Before the fix, gbGaps ignored existing-row state and always re-checked
      // vol 1, wasting the lookup budget. A complete vol 1 must be skipped;
      // only vol 2 (missing cover + year) is looked up.
      const lookedUp = gbSpy.mock.calls.map((c) => c[1]);
      expect(lookedUp).not.toContain(1);
      expect(lookedUp).toContain(2);
    });

    it('fills releaseYear from the Google Books publishedDate (cover present, year missing)', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 1 });
      // Vol 1 already has a cover but no date/year — a year-only gap.
      await updateVolume(h.volumeId, {
        metadataJson: JSON.stringify({ coverUrl: 'https://cdn/v1.jpg' }),
      });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // GB returns a real-cover edition carrying a publishedDate to mine the year.
      vi.spyOn(gb, 'searchVolumeEdition').mockResolvedValue([
        {
          id: 'gb1QBAJ',
          title: 'Test Series, Vol. 1',
          publisher: 'VIZ',
          description: 'd',
          pageCount: 200,
          language: 'en',
          coverUrl: 'https://books.google.com/v1.jpg',
          viewability: 'PARTIAL',
          isbn: '9781',
          publishedDate: '2011-06-17',
        },
      ]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const vols = await listVolumesBySeries(h.seriesId);
      const meta = JSON.parse(vols[0]!.metadataJson);
      // Existing MangaDex-style cover is kept; the year is mined from GB.
      expect(meta.coverUrl).toBe('https://cdn/v1.jpg');
      expect(meta.releaseYear).toBe(2011);
    });

    it('fills a cover + year from ComicVine when MangaDex/Google Books/OpenLibrary lack them', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 2 });
      await comicVineApiKeySetting.set('CVKEY');
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([{ volume: 1, url: 'https://cdn/v1.jpg' }]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      // GB + OL find nothing (default empty mocks). ComicVine has the series.
      vi.spyOn(cv, 'searchVolumes').mockResolvedValue([
        { comicvineId: 999, name: 'Test Series', publisher: 'Viz', startYear: 2004, issueCount: 2, coverUrl: null, description: null },
      ]);
      vi.spyOn(cv, 'listIssues').mockResolvedValue([
        { comicvineIssueId: 1, issueNumber: '1', issueNumberSort: 1, name: null, coverDate: '2004-01-05', coverUrl: 'https://comicvine.gamespot.com/v1.jpg' },
        { comicvineIssueId: 2, issueNumber: '2', issueNumberSort: 2, name: null, coverDate: '2005-06-01', coverUrl: 'https://comicvine.gamespot.com/v2.jpg' },
      ]);

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      await runOnce(mangadexVolumeHydrateDescriptor);

      const byNum = new Map((await listVolumesBySeries(h.seriesId)).map((v) => [v.number, v]));
      // Vol 1 keeps the MangaDex cover; ComicVine still supplies its year.
      const m1 = JSON.parse(byNum.get(1)!.metadataJson);
      expect(m1.coverUrl).toBe('https://cdn/v1.jpg');
      expect(m1.coverSource).toBeUndefined();
      expect(m1.releaseYear).toBe(2004);
      // Vol 2 had no cover from any prior source -> filled from ComicVine.
      const m2 = JSON.parse(byNum.get(2)!.metadataJson);
      expect(m2.coverUrl).toBe('https://comicvine.gamespot.com/v2.jpg');
      expect(m2.coverSource).toBe('comicvine');
      expect(m2.releaseYear).toBe(2005);
      // The resolved ComicVine volume id is cached on the series for next time.
      expect((await getSeries(h.seriesId))?.comicvineId).toBe(999);
    });

    it('continues when an OL lookup throws', async () => {
      await updateSeriesMetadata(h.seriesId, { mangadexId: 'uuid-1', totalVolumes: 2 });
      vi.spyOn(md, 'getVolumeCovers').mockResolvedValue([]);
      vi.spyOn(md, 'getChapters').mockResolvedValue([]);
      vi.spyOn(ol, 'searchBooks').mockImplementation(async (q: string) => {
        if (q.includes('vol 1')) throw new Error('OL down');
        return [olHit(2)];
      });

      await enqueueJob('mangadex_volume_hydrate', { seriesId: h.seriesId });
      // Must not throw.
      await runOnce(mangadexVolumeHydrateDescriptor);

      const byNum = new Map((await listVolumesBySeries(h.seriesId)).map((v) => [v.number, v]));
      // Vol 1 unaffected by the error; vol 2 still filled.
      expect(JSON.parse(byNum.get(1)!.metadataJson).coverUrl).toBeUndefined();
      expect(JSON.parse(byNum.get(2)!.metadataJson).coverUrl).toBe('https://ol/cover-v2.jpg');
    });
  });
});

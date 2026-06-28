/**
 * TDD RED tests — D. detectBookSeries ebook OL fallback:
 * When GB searchSeriesVolumes returns empty (e.g. 429/empty), and the series
 * has an ISBN → work → series, return an openlibrary detection result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { detectBookSeries } from '@/server/integrations/book-series/detect';
import * as gb from '@/server/integrations/googlebooks';
import * as ol from '@/server/integrations/openlibrary';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

async function makeEbookSeries(opts: {
  title: string;
  isbn?: string | null;
  openlibraryId?: string | null;
}): Promise<number> {
  return insertSeries({
    contentType: 'ebook',
    titleEnglish: opts.title,
    isbn: opts.isbn ?? null,
    openlibraryId: opts.openlibraryId ?? null,
    status: 'finished',
    rootPath: `/media/books/${opts.title}`,
    qualityProfileId: h.qpId,
    totalVolumes: 1,
    granularity: 'volume',
  });
}

describe('detectBookSeries — OpenLibrary fallback when GB returns empty', () => {
  it('returns an openlibrary detection result when GB is empty and OL work has series', async () => {
    const seriesId = await makeEbookSeries({
      title: 'Sabriel',
      isbn: '9781741769586',
      openlibraryId: 'OL326781W',
    });

    // GB returns nothing (empty editions array — simulates 429/keyless)
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue([]);
    vi.spyOn(gb, 'deriveSeriesFromEditions').mockReturnValue(null);

    // OL: getEditionByIsbn → work key
    vi.spyOn(ol, 'getEditionByIsbn').mockResolvedValue({
      publishDate: 'November 1, 1995',
      workKey: '/works/OL326781W',
    });

    // OL: getWork → series array (cast needed because WorkRecordT is generated from zod)
    vi.spyOn(ol, 'getWork').mockResolvedValue({
      key: '/works/OL326781W',
      title: 'Sabriel',
      description: { value: 'A coming-of-age story.' },
      series: [{ series: { key: '/series/OL326781L' }, position: '1' }],
    } as Awaited<ReturnType<typeof ol.getWork>>);

    // OL: getOLSeries → series name
    vi.spyOn(ol, 'getOLSeries').mockResolvedValue({ name: 'Old Kingdom' });

    // OL: getOLSeriesWorks → the full catalogue (year-sorted by the client).
    vi.spyOn(ol, 'getOLSeriesWorks').mockResolvedValue([
      { workKey: '/works/OL2628761W', title: 'Sabriel', coverUrl: 'c1', firstPublishYear: 1995 },
      { workKey: '/works/OL2628758W', title: 'Lirael', coverUrl: 'c2', firstPublishYear: 2001 },
      { workKey: '/works/OL2628772W', title: 'Abhorsen', coverUrl: 'c3', firstPublishYear: 2003 },
      { workKey: '/works/OL20039818W', title: 'Goldenhand', coverUrl: 'c4', firstPublishYear: 2016 },
    ]);

    const series = (await import('@/server/db/series')).getSeries;
    const row = await series(seriesId);
    const result = await detectBookSeries(row!);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Old Kingdom');
    expect(result!.source).toBe('openlibrary');
    expect(result!.externalId).toBe('/series/OL326781L');
    expect(result!.position).toBe(1);
    // Regression: the OL fallback now populates the full catalogue (was always []),
    // so the book-series page can list un-owned books (Lirael, Goldenhand, …).
    expect(result!.entries).toHaveLength(4);
    expect(result!.entries.map((e) => e.title)).toEqual([
      'Sabriel',
      'Lirael',
      'Abhorsen',
      'Goldenhand',
    ]);
    expect(result!.entries[0]).toMatchObject({ position: 1, externalRef: '/works/OL2628761W' });
  });

  it('still returns a detection result (empty entries) when the OL catalogue lookup is empty', async () => {
    const seriesId = await makeEbookSeries({
      title: 'Sabriel',
      isbn: '9781741769586',
    });
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue([]);
    vi.spyOn(gb, 'deriveSeriesFromEditions').mockReturnValue(null);
    vi.spyOn(ol, 'getEditionByIsbn').mockResolvedValue({
      publishDate: '1995',
      workKey: '/works/OL326781W',
    });
    vi.spyOn(ol, 'getWork').mockResolvedValue({
      key: '/works/OL326781W',
      title: 'Sabriel',
      series: [{ series: { key: '/series/OL326781L' }, position: '1' }],
    } as Awaited<ReturnType<typeof ol.getWork>>);
    vi.spyOn(ol, 'getOLSeries').mockResolvedValue({ name: 'Old Kingdom' });
    vi.spyOn(ol, 'getOLSeriesWorks').mockResolvedValue([]);

    const series = (await import('@/server/db/series')).getSeries;
    const row = await series(seriesId);
    const result = await detectBookSeries(row!);

    expect(result).not.toBeNull();
    expect(result!.entries).toEqual([]);
  });

  it('returns null when GB is empty and OL has no series on the work', async () => {
    const seriesId = await makeEbookSeries({
      title: 'Standalone Book',
      isbn: '9781234567890',
    });

    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue([]);
    vi.spyOn(gb, 'deriveSeriesFromEditions').mockReturnValue(null);
    vi.spyOn(ol, 'getEditionByIsbn').mockResolvedValue({
      publishDate: '2000',
      workKey: '/works/OL999W',
    });
    vi.spyOn(ol, 'getWork').mockResolvedValue({
      key: '/works/OL999W',
      title: 'Standalone Book',
      // no series field — standalone book
    } as Awaited<ReturnType<typeof ol.getWork>>);

    const series = (await import('@/server/db/series')).getSeries;
    const row = await series(seriesId);
    const result = await detectBookSeries(row!);

    expect(result).toBeNull();
  });

  it('returns null when GB is empty and series has no ISBN for OL fallback', async () => {
    const seriesId = await makeEbookSeries({
      title: 'No ISBN Book',
      isbn: null,
    });

    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue([]);
    vi.spyOn(gb, 'deriveSeriesFromEditions').mockReturnValue(null);
    vi.spyOn(ol, 'getEditionByIsbn');

    const series = (await import('@/server/db/series')).getSeries;
    const row = await series(seriesId);
    const result = await detectBookSeries(row!);

    expect(result).toBeNull();
    expect(vi.mocked(ol.getEditionByIsbn)).not.toHaveBeenCalled();
  });

  it('returns null (no throw) when OL edition lookup fails', async () => {
    const seriesId = await makeEbookSeries({
      title: 'Error Book',
      isbn: '9781234567890',
    });

    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue([]);
    vi.spyOn(gb, 'deriveSeriesFromEditions').mockReturnValue(null);
    vi.spyOn(ol, 'getEditionByIsbn').mockRejectedValue(new Error('OL down'));

    const series = (await import('@/server/db/series')).getSeries;
    const row = await series(seriesId);
    const result = await detectBookSeries(row!);

    expect(result).toBeNull(); // best-effort, no throw
  });
});

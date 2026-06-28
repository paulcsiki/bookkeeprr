import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { googleBooksHydrateDescriptor } from '@/server/jobs/kinds/googlebooks-hydrate';
import { insertSeries, getSeries } from '@/server/db/series';
import { listVolumesBySeries } from '@/server/db/volumes';
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

async function makeNovel(): Promise<number> {
  return insertSeries({
    contentType: 'light_novel',
    rootPath: '/tmp/ln',
    qualityProfileId: h.qpId,
    titleEnglish: 'Solo Leveling',
    status: 'releasing',
  });
}

// QBAJ-suffix ids ensure hasRealCover() treats these as Google-hosted editions.
const editions = [
  { id: 'v1QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', publisher: 'Yen Press', description: 'd1', pageCount: 300, language: 'en', coverUrl: 'https://books.google.com/c?id=v1', viewability: 'PARTIAL', isbn: null },
  { id: 'v2QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', publisher: 'Yen Press', description: 'd2', pageCount: 320, language: 'en', coverUrl: 'https://books.google.com/c?id=v2', viewability: 'PARTIAL', isbn: null },
  { id: 'v3QBAJ', title: 'Solo Leveling, Vol. 3 (novel)', publisher: 'Yen Press', description: 'd3', pageCount: 340, language: 'en', coverUrl: 'https://books.google.com/c?id=v3', viewability: 'PARTIAL', isbn: null },
];

describe('googlebooks_hydrate', () => {
  it('fills series fields, replaces cover, captures publisher, and creates volume stubs', async () => {
    const id = await makeNovel();
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue(editions);

    const r = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(r.totalVolumes).toBe(3);

    const s = await getSeries(id);
    expect(s!.totalVolumes).toBe(3);
    expect(s!.publisher).toBe('Yen Press');
    expect(s!.coverUrl).toBe('https://books.google.com/c?id=v1');
    expect(s!.googleBooksVolumeId).toBe('v1QBAJ');

    const vols = await listVolumesBySeries(id);
    expect(vols.map((v) => v.number).sort()).toEqual([1, 2, 3]);
    const v3 = vols.find((v) => v.number === 3)!;
    const meta = JSON.parse(v3.metadataJson) as Record<string, unknown>;
    expect(meta.coverUrl).toBe('https://books.google.com/c?id=v3');
    expect(meta.pageCount).toBe(340);
    expect(v3.title).toBe('Solo Leveling, Vol. 3 (novel)');
  });

  it('always replaces an existing novel cover but never lowers totalVolumes', async () => {
    const id = await makeNovel();
    const { updateSeries } = await import('@/server/db/series');
    await updateSeries(id, { coverUrl: 'https://old/cover', totalVolumes: 5 });
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue(editions);

    await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    const s = await getSeries(id);
    expect(s!.coverUrl).toBe('https://books.google.com/c?id=v1'); // replaced
    expect(s!.totalVolumes).toBe(5); // not lowered from 5 to 3

    // Volume rows must cover 1..5 (gap volumes 4 and 5 are still stubbed)
    const vols = await listVolumesBySeries(id);
    expect(vols.length).toBe(5);
    expect(vols.map((v) => v.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('is idempotent: second run reports volumesAdded === 0 and volumesUpdated === 0', async () => {
    const id = await makeNovel();
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue(editions);

    // First run: seeds everything
    await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);

    // Second run: nothing should change
    const r2 = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(r2.volumesAdded).toBe(0);
    expect(r2.volumesUpdated).toBe(0);
  });

  it('is a no-op on low confidence (single volume)', async () => {
    const id = await makeNovel();
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue([editions[0]!]);
    const r = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(r.totalVolumes).toBeNull();
    const s = await getSeries(id);
    expect(s!.totalVolumes).toBeNull();
    expect((await listVolumesBySeries(id)).length).toBe(0);
  });

  it('skips non-novel content types', async () => {
    const id = await insertSeries({
      contentType: 'manga', rootPath: '/tmp/m', qualityProfileId: h.qpId,
      titleEnglish: 'X', status: 'releasing',
    });
    const spy = vi.spyOn(gb, 'searchSeriesVolumes');
    const r = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(spy).not.toHaveBeenCalled();
    expect(r.totalVolumes).toBeNull();
  });

  it('OL fallback: catalog-only volume (NO_PAGES/ACAAJ) gets OL cover; QBAJ volume keeps GB cover', async () => {
    const id = await makeNovel();

    // Mix: vol 1+2 are real GB editions (QBAJ), vol 3 is catalog-only (ACAAJ, NO_PAGES)
    const mixedEditions = [
      { id: 'v1QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', publisher: 'Yen Press', description: 'd1', pageCount: 300, language: 'en', coverUrl: 'https://books.google.com/c?id=v1', viewability: 'PARTIAL', isbn: null },
      { id: 'v2QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', publisher: 'Yen Press', description: 'd2', pageCount: 320, language: 'en', coverUrl: 'https://books.google.com/c?id=v2', viewability: 'PARTIAL', isbn: null },
      { id: '7gMczgEACAAJ', title: 'Solo Leveling, Vol. 3 (novel)', publisher: 'Yen Press', description: 'd3', pageCount: 340, language: 'en', coverUrl: 'https://placeholder.google.com/not-available', viewability: 'NO_PAGES', isbn: null },
    ];
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue(mixedEditions);

    // OL mock: for vol 3 return a match with a cover; for others return null
    vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);
    vi.spyOn(ol, 'matchVolumeEdition').mockImplementation((_hits, opts) => {
      if (opts.volumeNumber === 3) {
        return { coverUrl: 'https://covers.openlibrary.org/b/id/12345-L.jpg', year: 2023, isbn: '9780000000003', olid: 'OL123M' };
      }
      return null;
    });

    const r = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(r.totalVolumes).toBe(3);

    const vols = await listVolumesBySeries(id);
    const v1 = vols.find((v) => v.number === 1)!;
    const v3 = vols.find((v) => v.number === 3)!;

    // Vol 1 keeps its GB cover
    const meta1 = JSON.parse(v1.metadataJson) as Record<string, unknown>;
    expect(meta1.coverUrl).toBe('https://books.google.com/c?id=v1');
    expect(meta1.coverSource).toBe('googlebooks');

    // Vol 3 gets OL cover (catalog-only GB cover was ignored)
    const meta3 = JSON.parse(v3.metadataJson) as Record<string, unknown>;
    expect(meta3.coverUrl).toBe('https://covers.openlibrary.org/b/id/12345-L.jpg');
    expect(meta3.coverSource).toBe('openlibrary');
    expect(meta3.olid).toBe('OL123M');
    expect(meta3.isbn).toBe('9780000000003');
  });

  it('retries title-only when a stored publisher filter starves the result set', async () => {
    const id = await makeNovel();
    const { updateSeries } = await import('@/server/db/series');
    await updateSeries(id, { publisher: 'Yen Press LLC' }); // too-specific stored imprint

    // First call (with publisher) returns too few; second call (title-only) returns the full set.
    const spy = vi
      .spyOn(gb, 'searchSeriesVolumes')
      .mockResolvedValueOnce([editions[0]!]) // publisher-filtered: 1 edition -> derive null
      .mockResolvedValueOnce(editions); // title-only fallback: full set
    vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);
    vi.spyOn(ol, 'matchVolumeEdition').mockReturnValue(null);

    const r = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(r.totalVolumes).toBe(3);
    expect(spy).toHaveBeenCalledTimes(2);
    // Second call dropped the publisher filter.
    expect(spy.mock.calls[1]![1]).toBeNull();
  });

  it('clears a stale placeholder cover on re-hydrate when no real cover is found', async () => {
    const id = await makeNovel();

    // First run: v1 has a real GB cover (stored as googlebooks).
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue(editions);
    vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);
    vi.spyOn(ol, 'matchVolumeEdition').mockReturnValue(null);
    await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    let vols = await listVolumesBySeries(id);
    let meta1 = JSON.parse(vols.find((v) => v.number === 1)!.metadataJson) as Record<string, unknown>;
    expect(meta1.coverUrl).toBe('https://books.google.com/c?id=v1');

    // Second run: v1 is now a catalog-only edition (NO_PAGES, ACAAJ id) → no real
    // cover; OL still finds nothing. The previously-stored placeholder must clear.
    vi.restoreAllMocks();
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue([
      { id: 'v1ACAAJ', title: 'Solo Leveling, Vol. 1 (novel)', publisher: 'Yen Press', description: 'd1', pageCount: 300, language: 'en', coverUrl: 'https://books.google.com/c?id=v1placeholder', viewability: 'NO_PAGES', isbn: null },
      { id: 'v2ACAAJ', title: 'Solo Leveling, Vol. 2 (novel)', publisher: 'Yen Press', description: 'd2', pageCount: 320, language: 'en', coverUrl: 'https://books.google.com/c?id=v2placeholder', viewability: 'NO_PAGES', isbn: null },
    ]);
    vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);
    vi.spyOn(ol, 'matchVolumeEdition').mockReturnValue(null);
    await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);

    vols = await listVolumesBySeries(id);
    meta1 = JSON.parse(vols.find((v) => v.number === 1)!.metadataJson) as Record<string, unknown>;
    expect(meta1.coverUrl).toBeUndefined(); // stale placeholder cleared, not kept
    expect(meta1.coverSource).toBeUndefined();
  });

  it('OL-by-ISBN tier: catalog-only vol with ISBN gets OL cover when targeted GB and OL title-search both miss', async () => {
    const id = await makeNovel();

    // Vol 3: catalog-only (ACAAJ, NO_PAGES) with an ISBN but no real GB cover.
    const mixedEditions = [
      { id: 'v1QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', publisher: 'Yen Press', description: 'd1', pageCount: 300, language: 'en', coverUrl: 'https://books.google.com/c?id=v1', viewability: 'PARTIAL', isbn: null },
      { id: 'v2QBAJ', title: 'Solo Leveling, Vol. 2 (novel)', publisher: 'Yen Press', description: 'd2', pageCount: 320, language: 'en', coverUrl: 'https://books.google.com/c?id=v2', viewability: 'PARTIAL', isbn: null },
      { id: '7gMczgEACAAJ', title: 'Solo Leveling, Vol. 3 (novel)', publisher: 'Yen Press', description: 'd3', pageCount: 340, language: 'en', coverUrl: 'https://placeholder.google.com/not-available', viewability: 'NO_PAGES', isbn: '9781975319311' },
    ];
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue(mixedEditions);

    // Targeted GB finds nothing for vol 3
    vi.spyOn(gb, 'searchVolumeEdition').mockResolvedValue([]);

    // OL title search finds nothing for vol 3
    vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);
    vi.spyOn(ol, 'matchVolumeEdition').mockReturnValue(null);

    // OL-by-ISBN: returns a real cover for 9781975319311
    vi.spyOn(ol, 'coverUrlByIsbn').mockImplementation(async (isbn) => {
      if (isbn === '9781975319311') return 'https://covers.openlibrary.org/b/isbn/9781975319311-L.jpg';
      return null;
    });

    const r = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(r.totalVolumes).toBe(3);

    const vols = await listVolumesBySeries(id);

    // Vol 1 keeps its GB cover
    const v1 = vols.find((v) => v.number === 1)!;
    const meta1 = JSON.parse(v1.metadataJson) as Record<string, unknown>;
    expect(meta1.coverSource).toBe('googlebooks');

    // Vol 3 gets the OL-by-ISBN cover
    const v3 = vols.find((v) => v.number === 3)!;
    const meta3 = JSON.parse(v3.metadataJson) as Record<string, unknown>;
    expect(meta3.coverUrl).toBe('https://covers.openlibrary.org/b/isbn/9781975319311-L.jpg');
    expect(meta3.coverSource).toBe('openlibrary');
    expect(meta3.isbn).toBe('9781975319311');
  });

  it('targeted GB pass creates a vol 2 missing from broad search and prefers it over OL', async () => {
    const id = await makeNovel();

    // Broad search returns only vol 1 (real) + vol 3 (catalog-only NO_PAGES).
    // Vol 2 is entirely absent from the broad search.
    const broadEditions = [
      { id: 'v1QBAJ', title: 'Solo Leveling, Vol. 1 (novel)', publisher: 'Yen Press', description: 'd1', pageCount: 300, language: 'en', coverUrl: 'https://books.google.com/c?id=v1', viewability: 'PARTIAL', isbn: null },
      { id: '7gMczgEACAAJ', title: 'Solo Leveling, Vol. 3 (novel)', publisher: 'Yen Press', description: 'd3', pageCount: 340, language: 'en', coverUrl: 'https://placeholder.google.com/not-available', viewability: 'NO_PAGES', isbn: null },
    ];
    vi.spyOn(gb, 'searchSeriesVolumes').mockResolvedValue(broadEditions);

    // searchVolumeEdition: vol 2 returns a real QBAJ edition; vol 3 also returns one.
    vi.spyOn(gb, 'searchVolumeEdition').mockImplementation((_title, volume) => {
      if (volume === 2) {
        return Promise.resolve([{
          id: 'v2QBAJ',
          title: 'Solo Leveling, Vol. 2 (novel)',
          publisher: 'Yen Press',
          description: 'd2-targeted',
          pageCount: 320,
          language: 'en',
          coverUrl: 'https://books.google.com/c?id=v2QBAJ',
          viewability: 'PARTIAL',
          isbn: null,
        }]);
      }
      if (volume === 3) {
        return Promise.resolve([{
          id: 'v3QBAJ',
          title: 'Solo Leveling, Vol. 3 (novel)',
          publisher: 'Yen Press',
          description: 'd3-targeted',
          pageCount: 340,
          language: 'en',
          coverUrl: 'https://books.google.com/c?id=v3QBAJ',
          viewability: 'PARTIAL',
          isbn: null,
        }]);
      }
      return Promise.resolve([]);
    });

    // OL would provide covers for vol 2 and 3 if targeted GB didn't fire first
    vi.spyOn(ol, 'searchBooks').mockResolvedValue([]);
    vi.spyOn(ol, 'matchVolumeEdition').mockImplementation((_hits, opts) => {
      if (opts.volumeNumber === 2 || opts.volumeNumber === 3) {
        return { coverUrl: 'https://covers.openlibrary.org/b/id/ol-fallback.jpg', year: 2023, isbn: '9780000000002', olid: 'OL_FALLBACK' };
      }
      return null;
    });

    const r = await googleBooksHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(r.totalVolumes).toBe(3);

    const vols = await listVolumesBySeries(id);
    // Vol 2 must have been created (was missing from broad search)
    expect(vols.map((v) => v.number).sort((a, b) => a - b)).toEqual([1, 2, 3]);

    const v2 = vols.find((v) => v.number === 2)!;
    const meta2 = JSON.parse(v2.metadataJson) as Record<string, unknown>;
    // Vol 2 cover comes from targeted GB, NOT from OL
    expect(meta2.coverUrl).toBe('https://books.google.com/c?id=v2QBAJ');
    expect(meta2.coverSource).toBe('googlebooks');
    expect(meta2.googleBooksVolumeId).toBe('v2QBAJ');

    // Vol 3 cover comes from targeted GB (upgraded from catalog-only)
    const v3 = vols.find((v) => v.number === 3)!;
    const meta3 = JSON.parse(v3.metadataJson) as Record<string, unknown>;
    expect(meta3.coverUrl).toBe('https://books.google.com/c?id=v3QBAJ');
    expect(meta3.coverSource).toBe('googlebooks');
  });
});

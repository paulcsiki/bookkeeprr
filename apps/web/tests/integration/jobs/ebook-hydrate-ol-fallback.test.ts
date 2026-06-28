/**
 * TDD RED tests — B, C, D for ebook-hydrate:
 *   B. gb:-prefixed openlibraryId routes to GB getVolume, not OL getWork/getWorkEdition
 *   C. OL-by-ISBN fallback populates description + start_year when GB returns nothing
 *   D. OL series detection fallback (tested via detect.ts, not hydrate directly)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { ebookHydrateDescriptor } from '@/server/jobs/kinds/ebook-hydrate';
import { insertSeries, getSeries } from '@/server/db/series';
import * as googleBooks from '@/server/integrations/googlebooks';
import * as gbClient from '@/server/integrations/googlebooks/client';
import * as ol from '@/server/integrations/openlibrary';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

async function makeEbook(opts: {
  isbn?: string | null;
  openlibraryId?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  pageCount?: number | null;
  startYear?: number | null;
}): Promise<number> {
  return insertSeries({
    contentType: 'ebook',
    openlibraryId: opts.openlibraryId ?? 'OL123M',
    isbn: opts.isbn ?? null,
    titleEnglish: 'Test Ebook',
    status: 'finished',
    rootPath: '/media/books/Author/Test Ebook',
    qualityProfileId: h.qpId,
    coverUrl: opts.coverUrl ?? null,
    description: opts.description ?? null,
    totalVolumes: 1,
    pageCount: opts.pageCount ?? null,
    granularity: 'volume',
    monitoring: 'future',
    startYear: opts.startYear ?? null,
  });
}

// ---------------------------------------------------------------------------
// B. gb: prefix routing — gb: IDs must NOT call OL getWork/getWorkEdition
// ---------------------------------------------------------------------------
describe('gb:-prefixed openlibraryId routing', () => {
  it('does NOT call OL getWorkEdition when openlibraryId is a gb: id', async () => {
    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'gb:OL_gbid_123',
      description: null,
      coverUrl: null,
    });

    const getWorkEditionSpy = vi.spyOn(ol, 'getWorkEdition');
    const getWorkSpy = vi.spyOn(ol, 'getWork');
    // For gb: ids, the code routes to getVolume, not lookupByIsbn or OL.
    vi.spyOn(gbClient, 'getVolume').mockResolvedValue({
      description: 'A tale.',
      pageCount: 300,
      coverUrl: 'https://books.example/cover.jpg',
      publishedYear: 2001,
    });

    await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(getWorkEditionSpy).not.toHaveBeenCalled();
    expect(getWorkSpy).not.toHaveBeenCalled();
  });

  it('still fills description/cover from GB getVolume when openlibraryId is gb: prefixed', async () => {
    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'gb:OL_gbid_123',
      description: null,
      coverUrl: null,
    });

    // For gb: ids, the hydrate uses getVolume (not lookupByIsbn).
    vi.spyOn(gbClient, 'getVolume').mockResolvedValue({
      description: 'A tale from GB.',
      pageCount: 300,
      coverUrl: 'https://books.example/cover.jpg',
      publishedYear: 2001,
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(result.fieldsUpdated).toContain('description');
    expect(result.fieldsUpdated).toContain('coverUrl');

    const updated = await getSeries(id);
    expect(updated!.description).toBe('A tale from GB.');
  });

  it('falls through to OL-by-ISBN when a gb: series has an ISBN and GB getVolume yields no description/year', async () => {
    // The real Sabriel case: openlibraryId is a gb: id, but Google Books has no
    // description for the volume. The gb: branch must still reach the OL-by-ISBN
    // fallback (path C) so description + startYear get populated from OpenLibrary.
    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'gb:ED3mdV8AR6IC',
      description: null,
      coverUrl: 'https://existing/cover.jpg',
      startYear: null,
    });

    // GB getVolume returns nothing useful (no description, no year).
    vi.spyOn(gbClient, 'getVolume').mockResolvedValue({
      description: null,
      pageCount: null,
      coverUrl: null,
      publishedYear: null,
    });

    const editionSpy = vi.spyOn(ol, 'getEditionByIsbn').mockResolvedValue({
      publishDate: 'November 1, 1995',
      workKey: '/works/OL326781W',
    });
    vi.spyOn(ol, 'getWork').mockResolvedValue({
      key: '/works/OL326781W',
      title: 'Sabriel',
      description: { value: 'Sabriel must enter the Old Kingdom...' },
      first_publish_date: '2001',
    } as Awaited<ReturnType<typeof ol.getWork>>);

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(editionSpy).toHaveBeenCalledWith('9781741769586');
    expect(result.fieldsUpdated).toContain('description');
    expect(result.fieldsUpdated).toContain('startYear');

    const updated = await getSeries(id);
    expect(updated!.description).toBe('Sabriel must enter the Old Kingdom...');
    expect(updated!.startYear).toBe(1995);
  });
});

// ---------------------------------------------------------------------------
// C. OL-by-ISBN hydration — when GB returns nothing, OL edition+work backfills
// ---------------------------------------------------------------------------
describe('OL-by-ISBN fallback (C)', () => {
  it('backfills description via OL-by-ISBN when GB has nothing AND OL-by-OLID also has none', async () => {
    // When GB returns no description AND tier-2 OL getWork (by OLID) also
    // returns nothing, OL-by-ISBN is the final fallback for description.
    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'OL123M',
      description: null,
      coverUrl: 'https://existing/cover.jpg',
      pageCount: null,
    });

    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: null,
      pageCount: null,
      coverUrl: null,
    });
    vi.spyOn(ol, 'getWorkEdition').mockResolvedValue({ isbn: null, pages: null });
    // Tier 2 getWork (by OLID) returns null — no description from that path
    // Note: this mock intercepts ALL getWork calls. The OL-by-ISBN path calls
    // getWork with the workKey's olid; since the same mock returns null, the
    // description will only come from a second, more targeted mock below.
    // So we use a custom implementation to differentiate the two getWork calls.
    const getWorkMock = vi.spyOn(ol, 'getWork').mockImplementation(async (olid) => {
      if (olid === 'OL123M') return null; // tier 2 returns null
      if (olid === 'OL326781W') {
        return {
          key: '/works/OL326781W',
          title: 'Sabriel',
          description: { value: 'Sabriel is the story of a young woman...' },
          first_publish_date: '2001',
        } as Awaited<ReturnType<typeof ol.getWork>>;
      }
      return null;
    });

    const olEditionSpy = vi.spyOn(ol, 'getEditionByIsbn').mockResolvedValue({
      publishDate: 'November 1, 1995',
      workKey: '/works/OL326781W',
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(olEditionSpy).toHaveBeenCalledWith('9781741769586');
    expect(getWorkMock).toHaveBeenCalledWith('OL326781W', 2); // OL-by-ISBN path (with retries)
    expect(result.fieldsUpdated).toContain('description');
    expect(result.fieldsUpdated).toContain('startYear'); // from edition publishDate

    const updated = await getSeries(id);
    expect(updated!.description).toBe('Sabriel is the story of a young woman...');
    expect(updated!.startYear).toBe(1995);
  });

  it('backfills start_year from OL edition publish_date (opportunistically with description)', async () => {
    // description is null → triggers OL-by-ISBN path; startYear is also null →
    // the same path opportunistically fills it from publish_date.
    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'OL123M',
      description: null,
      coverUrl: 'https://existing/cover.jpg',
      pageCount: null,
      startYear: null,
    });

    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue({
      description: null,
      pageCount: null,
      coverUrl: null,
    });
    vi.spyOn(ol, 'getWorkEdition').mockResolvedValue({ isbn: null, pages: null });
    vi.spyOn(ol, 'getWork').mockResolvedValue(null);
    vi.spyOn(ol, 'getEditionByIsbn').mockResolvedValue({
      publishDate: '1995',
      workKey: null,
    });

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(result.fieldsUpdated).toContain('startYear');
    const updated = await getSeries(id);
    expect(updated!.startYear).toBe(1995);
  });

  it('skips OL-by-ISBN when description is already present', async () => {
    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'OL123M',
      description: 'Already set',
      coverUrl: 'https://existing/cover.jpg',
      pageCount: 300,
      startYear: 1995,
    });

    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue(null);

    // getEditionByIsbn should NOT be called since description + startYear already set
    const olEditionSpy = vi.spyOn(ol, 'getEditionByIsbn');

    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    // No description/startYear to fill, no OL-by-ISBN call needed
    expect(olEditionSpy).not.toHaveBeenCalled();
    expect(result.fieldsUpdated).not.toContain('description');
    expect(result.fieldsUpdated).not.toContain('startYear');
  });

  it('does not throw when OL-by-ISBN edition lookup fails', async () => {
    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'OL123M',
      description: null,
      coverUrl: null,
      pageCount: null,
    });

    vi.spyOn(googleBooks, 'lookupByIsbn').mockResolvedValue(null);
    vi.spyOn(ol, 'getWorkEdition').mockResolvedValue({ isbn: null, pages: null });
    vi.spyOn(ol, 'getWork').mockResolvedValue(null);
    vi.spyOn(ol, 'getEditionByIsbn').mockRejectedValue(new Error('OL network error'));

    // Should not throw — best-effort
    const result = await ebookHydrateDescriptor.handler({ seriesId: id }, 1);
    expect(result.fieldsUpdated).not.toContain('description');
  });
});

// ---------------------------------------------------------------------------
// A. API key wired into lookupByIsbn from ebook-hydrate
// (tested via the URL assertion in the unit test; here we verify the call goes through)
// ---------------------------------------------------------------------------
describe('lookupByIsbn API key wire-up in ebook-hydrate', () => {
  it('passes the configured API key to lookupByIsbn', async () => {
    // Set up DB setting
    const { googleBooksApiKeySetting } = await import('@/server/db/settings/googlebooks');
    await googleBooksApiKeySetting.set('TEST_KEY_123');

    const id = await makeEbook({
      isbn: '9781741769586',
      openlibraryId: 'OL123M',
      description: null,
    });

    let calledWithKey: string | null | undefined;
    const gbSpy = vi.spyOn(googleBooks, 'lookupByIsbn').mockImplementation(async (_isbn, apiKey) => {
      calledWithKey = apiKey;
      return { description: 'Test', pageCount: null, coverUrl: null };
    });

    await ebookHydrateDescriptor.handler({ seriesId: id }, 1);

    expect(gbSpy).toHaveBeenCalled();
    expect(calledWithKey).toBe('TEST_KEY_123');
  });
});

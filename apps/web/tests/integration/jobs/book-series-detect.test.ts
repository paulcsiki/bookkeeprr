import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { bookSeriesDetectDescriptor } from '@/server/jobs/kinds/book-series-detect';
import { insertSeries } from '@/server/db/series';
import * as bs from '@/server/db/book-series';
import * as detect from '@/server/integrations/book-series/detect';
import * as itunesClient from '@/server/integrations/itunes/client';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
  vi.restoreAllMocks();
});

async function makeEbook(title = 'Project Hail Mary'): Promise<number> {
  return insertSeries({
    contentType: 'ebook',
    titleEnglish: title,
    author: 'Andy Weir',
    status: 'finished',
    rootPath: '/media/books/Andy Weir/' + title,
    qualityProfileId: h.qpId,
    totalVolumes: 1,
    granularity: 'volume',
  });
}

async function makeAudiobook(title = 'Project Hail Mary'): Promise<number> {
  return insertSeries({
    contentType: 'audiobook',
    titleEnglish: title,
    author: 'Andy Weir',
    status: 'finished',
    rootPath: '/media/audiobooks/Andy Weir/' + title,
    qualityProfileId: h.qpId,
    totalVolumes: 1,
    granularity: 'volume',
  });
}

describe('book_series_detect job', () => {
  it('creates a new book_series and links the member on first run', async () => {
    const id = await makeEbook('Mistborn: The Final Empire');

    vi.spyOn(detect, 'detectBookSeries').mockResolvedValue({
      name: 'Mistborn',
      source: 'googlebooks',
      externalId: 'v1QBAJ',
      position: 1,
      entries: [
        { position: 1, title: 'The Final Empire', externalRef: 'v1QBAJ', coverUrl: null },
        { position: 2, title: 'The Well of Ascension', externalRef: 'v2QBAJ', coverUrl: null },
      ],
    });

    const result = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(result.linked).toBe(true);
    expect(result.created).toBe(true);
    expect(result.bookSeriesId).toBeTypeOf('number');

    // Verify the book_series row was created.
    const detail = await bs.getBookSeries(result.bookSeriesId!);
    expect(detail).not.toBeNull();
    expect(detail!.bookSeries.name).toBe('Mistborn');
    expect(detail!.bookSeries.source).toBe('googlebooks');

    // Verify the member link.
    expect(detail!.members).toHaveLength(1);
    expect(detail!.members[0]!.member.seriesId).toBe(id);
    expect(detail!.members[0]!.member.linkSource).toBe('auto');
    expect(detail!.members[0]!.member.position).toBe(1);

    // Verify entries were populated.
    expect(detail!.entries).toHaveLength(2);
    expect(detail!.entries[0]!.title).toBe('The Final Empire');
  });

  it('is idempotent: running twice does not create a duplicate book_series or member', async () => {
    const id = await makeEbook('Mistborn: The Final Empire');

    vi.spyOn(detect, 'detectBookSeries').mockResolvedValue({
      name: 'Mistborn',
      source: 'googlebooks',
      externalId: 'v1QBAJ',
      position: 1,
      entries: [],
    });

    const r1 = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(r1.linked).toBe(true);
    expect(r1.created).toBe(true);

    const r2 = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 2);
    expect(r2.linked).toBe(true);
    expect(r2.created).toBe(false); // found existing, not created

    // Only one book_series should exist.
    const all = await bs.listBookSeries({ contentType: 'ebook' });
    expect(all).toHaveLength(1);

    // Only one member.
    const detail = await bs.getBookSeries(r1.bookSeriesId!);
    expect(detail!.members).toHaveLength(1);
  });

  it('does not downgrade a manual link to auto', async () => {
    const id = await makeEbook('Mistborn: The Final Empire');

    vi.spyOn(detect, 'detectBookSeries').mockResolvedValue({
      name: 'Mistborn',
      source: 'googlebooks',
      externalId: 'v1QBAJ',
      position: 1,
      entries: [],
    });

    // First auto-run.
    const r1 = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    const bsId = r1.bookSeriesId!;

    // Manually upgrade the link source to 'manual'.
    await bs.addMember(bsId, id, { position: 2, linkSource: 'manual' });

    // Second auto-run should NOT downgrade to 'auto'.
    await bookSeriesDetectDescriptor.handler({ seriesId: id }, 2);

    const detail = await bs.getBookSeries(bsId);
    expect(detail!.members[0]!.member.linkSource).toBe('manual');
  });

  it('returns linked:false when detectBookSeries returns null', async () => {
    const id = await makeEbook('Unknown Book');

    vi.spyOn(detect, 'detectBookSeries').mockResolvedValue(null);

    const result = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(result.linked).toBe(false);
    expect(result.bookSeriesId).toBeNull();

    // No book_series rows should have been created.
    const all = await bs.listBookSeries({ contentType: 'ebook' });
    expect(all).toHaveLength(0);
  });

  it('returns linked:false and does not throw when detectBookSeries throws', async () => {
    const id = await makeEbook('Error Book');

    vi.spyOn(detect, 'detectBookSeries').mockRejectedValue(new Error('network failure'));

    // The job should not throw — detectBookSeries wraps errors internally, but
    // this test verifies the outer handler also survives unexpected throws.
    // (detectBookSeries itself catches; this exercises the outer try/catch path.)
    const result = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(result.linked).toBe(false);
  });

  it('skips non-ebook/audiobook content types', async () => {
    const id = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Naruto',
      status: 'finished',
      rootPath: '/media/manga/Naruto',
      qualityProfileId: h.qpId,
    });

    const spy = vi.spyOn(detect, 'detectBookSeries');
    const result = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(spy).not.toHaveBeenCalled();
    expect(result.linked).toBe(false);
  });

  it('works for audiobooks: creates book_series with itunes source', async () => {
    const id = await makeAudiobook('Harry Potter and the Sorcerer\'s Stone');

    vi.spyOn(detect, 'detectBookSeries').mockResolvedValue({
      name: 'Harry Potter',
      source: 'itunes',
      externalId: '123456',
      position: null,
      entries: [],
    });

    const result = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(result.linked).toBe(true);
    expect(result.created).toBe(true);

    const detail = await bs.getBookSeries(result.bookSeriesId!);
    expect(detail!.bookSeries.source).toBe('itunes');
    expect(detail!.bookSeries.externalId).toBe('123456');
    expect(detail!.bookSeries.contentType).toBe('audiobook');
  });

  it('audiobook: detects series via iTunes trackName when collectionName differs from book title', async () => {
    // Regression: before the fix, detectAudiobook matched on hit.title (= collectionName)
    // so a real series hit where collectionName ≠ book title was always skipped.
    const id = await makeAudiobook('The Name of the Wind');

    vi.spyOn(itunesClient, 'searchAudiobooks').mockResolvedValue([
      {
        id: '789',
        title: 'The Kingkiller Chronicle', // hit.title = collectionName (the old match target)
        author: 'Patrick Rothfuss',
        releaseYear: 2007,
        coverUrl: null,
        collectionId: 789,
        collectionName: 'The Kingkiller Chronicle',
        trackName: 'The Name of the Wind', // the individual book — must be matched against
        description: null,
      },
    ]);

    const result = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(result.linked).toBe(true);
    expect(result.created).toBe(true);

    const detail = await bs.getBookSeries(result.bookSeriesId!);
    expect(detail).not.toBeNull();
    expect(detail!.bookSeries.name).toBe('The Kingkiller Chronicle');
    expect(detail!.bookSeries.source).toBe('itunes');
    expect(detail!.bookSeries.externalId).toBe('789');
    expect(detail!.bookSeries.contentType).toBe('audiobook');
  });

  it('matches an existing book_series by normalised name when externalId differs', async () => {
    // Create a book_series manually first.
    const existing = await bs.createBookSeries({
      name: 'His Dark Materials',
      contentType: 'ebook',
      source: 'manual',
      externalId: null,
    });

    const id = await makeEbook('His Dark Materials: Northern Lights');

    vi.spyOn(detect, 'detectBookSeries').mockResolvedValue({
      name: 'His Dark Materials', // same normalized name
      source: 'googlebooks',
      externalId: null, // no externalId — should still match by name
      position: 1,
      entries: [],
    });

    const result = await bookSeriesDetectDescriptor.handler({ seriesId: id }, 1);
    expect(result.linked).toBe(true);
    expect(result.created).toBe(false); // found existing by normalized name
    expect(result.bookSeriesId).toBe(existing.id);
  });

  it('returns linked:false when series does not exist', async () => {
    const result = await bookSeriesDetectDescriptor.handler({ seriesId: 99999 }, 1);
    expect(result.linked).toBe(false);
  });
});

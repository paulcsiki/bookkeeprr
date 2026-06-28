import { describe, expect, it } from 'vitest';
import type { SeriesRow, VolumeRow } from '@/server/db/schema';
import {
  seriesToReadarrAuthor,
  volumeToReadarrBook,
  type ReadarrAuthor,
  type ReadarrBook,
} from '@/server/readarr/mappers';

function fakeSeries(over: Partial<SeriesRow> = {}): SeriesRow {
  return {
    id: 1,
    contentType: 'ebook',
    anilistId: null,
    comicvineId: null,
    publisher: null,
    startYear: null,
    author: 'Brandon Sanderson',
    openlibraryId: 'OL12345W',
    isbn: null,
    asin: null,
    narrator: null,
    mangadexId: null,
    titleEnglish: 'The Way of Kings',
    titleRomaji: null,
    titleNative: null,
    status: 'releasing',
    coverUrl: 'http://example/cover.jpg',
    description: null,
    totalVolumes: 4,
    totalChapters: null,
    rootPath: '/media/books/Sanderson/Stormlight',
    monitoring: 'all',
    granularity: 'volume',
    qualityProfileId: 1,
    extraSearchTermsJson: '[]',
    addedAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...over,
  } as SeriesRow;
}

function fakeVolume(over: Partial<VolumeRow> = {}): VolumeRow {
  return {
    id: 10,
    seriesId: 1,
    number: 1,
    title: 'The Way of Kings',
    releaseDate: null,
    metadataJson: '{}',
    ...over,
  } as VolumeRow;
}

describe('seriesToReadarrAuthor', () => {
  it('maps ebook series to Readarr author shape', () => {
    const s = fakeSeries();
    const v1 = fakeVolume({ id: 10, number: 1, title: 'v1' });
    const v2 = fakeVolume({ id: 11, number: 2, title: 'v2' });
    const a: ReadarrAuthor = seriesToReadarrAuthor(s, [v1, v2]);
    expect(a.id).toBe(1);
    expect(a.authorName).toBe('Brandon Sanderson');
    expect(a.foreignAuthorId).toBe('OL12345W');
    expect(a.status).toBe('continuing');
    expect(a.monitored).toBe(true);
    expect(a.metadataProfileId).toBe(1);
    expect(a.qualityProfileId).toBe(1);
    expect(a.rootFolderPath).toBe('/media/books/Sanderson/Stormlight');
    expect(a.images).toEqual([{ coverType: 'poster', url: 'http://example/cover.jpg' }]);
    expect(a.books).toHaveLength(2);
  });

  it('maps finished status to "ended"', () => {
    const a = seriesToReadarrAuthor(fakeSeries({ status: 'finished' }), []);
    expect(a.status).toBe('ended');
  });

  it('maps monitoring=none → monitored=false', () => {
    const a = seriesToReadarrAuthor(fakeSeries({ monitoring: 'none' }), []);
    expect(a.monitored).toBe(false);
  });

  it('uses asin for audiobook foreignAuthorId', () => {
    const a = seriesToReadarrAuthor(
      fakeSeries({ contentType: 'audiobook', openlibraryId: null, asin: 'B0ABC123' }),
      [],
    );
    expect(a.foreignAuthorId).toBe('B0ABC123');
    expect(a.metadataProfileId).toBe(2);
  });

  it('uses anilistId for light_novel foreignAuthorId', () => {
    const a = seriesToReadarrAuthor(
      fakeSeries({ contentType: 'light_novel', openlibraryId: null, anilistId: 105778 }),
      [],
    );
    expect(a.foreignAuthorId).toBe('105778');
    expect(a.metadataProfileId).toBe(3);
  });

  it('falls back to empty string when no foreign id', () => {
    const a = seriesToReadarrAuthor(fakeSeries({ openlibraryId: null }), []);
    expect(a.foreignAuthorId).toBe('');
  });

  it('uses titleEnglish for authorName when author column is null', () => {
    const a = seriesToReadarrAuthor(fakeSeries({ author: null }), []);
    expect(a.authorName).toBe('The Way of Kings');
  });

  it('uses anilistId for manga foreignAuthorId', () => {
    const a = seriesToReadarrAuthor(
      fakeSeries({ contentType: 'manga', openlibraryId: null, anilistId: 105778 }),
      [],
    );
    expect(a.foreignAuthorId).toBe('105778');
    expect(a.metadataProfileId).toBe(4);
  });

  it('uses mangadexId as manga fallback when anilistId is null', () => {
    const a = seriesToReadarrAuthor(
      fakeSeries({
        contentType: 'manga',
        openlibraryId: null,
        anilistId: null,
        mangadexId: 'mdx-abc-123',
      }),
      [],
    );
    expect(a.foreignAuthorId).toBe('mdx-abc-123');
    expect(a.metadataProfileId).toBe(4);
  });

  it('uses comicvineId for comic foreignAuthorId', () => {
    const a = seriesToReadarrAuthor(
      fakeSeries({ contentType: 'comic', openlibraryId: null, comicvineId: 42 }),
      [],
    );
    expect(a.foreignAuthorId).toBe('42');
    expect(a.metadataProfileId).toBe(5);
  });

  it('uses publisher as authorName for comics when publisher is set', () => {
    const a = seriesToReadarrAuthor(
      fakeSeries({
        contentType: 'comic',
        openlibraryId: null,
        comicvineId: 42,
        publisher: 'Marvel Comics',
        author: null,
      }),
      [],
    );
    expect(a.authorName).toBe('Marvel Comics');
  });

  it('falls back to titleEnglish for comic authorName when publisher is null', () => {
    const a = seriesToReadarrAuthor(
      fakeSeries({
        contentType: 'comic',
        openlibraryId: null,
        comicvineId: 42,
        publisher: null,
        author: null,
      }),
      [],
    );
    expect(a.authorName).toBe('The Way of Kings');
  });
});

describe('volumeToReadarrBook', () => {
  it('maps a normal volume', () => {
    const b: ReadarrBook = volumeToReadarrBook(fakeVolume(), fakeSeries());
    expect(b.id).toBe(10);
    expect(b.title).toBe('The Way of Kings');
    expect(b.authorId).toBe(1);
    expect(b.authorTitle).toBe('Brandon Sanderson');
    expect(b.foreignBookId).toBe('OL12345W');
    expect(b.bookNumber).toBe(1);
    expect(b.monitored).toBe(true);
  });

  it('emits bookNumber=1 when volume.number is null', () => {
    const v = fakeVolume({ number: null as unknown as number });
    const b = volumeToReadarrBook(v, fakeSeries());
    expect(b.bookNumber).toBe(1);
  });

  it('uses series.titleEnglish when volume.title is null', () => {
    const v = fakeVolume({ title: null });
    const b = volumeToReadarrBook(v, fakeSeries());
    expect(b.title).toBe('The Way of Kings');
  });

  it('uses comic publisher for authorTitle when set', () => {
    const series = fakeSeries({
      contentType: 'comic',
      openlibraryId: null,
      comicvineId: 42,
      publisher: 'DC Comics',
      author: null,
    });
    const v = fakeVolume({ seriesId: series.id });
    const b = volumeToReadarrBook(v, series);
    expect(b.authorTitle).toBe('DC Comics');
  });
});

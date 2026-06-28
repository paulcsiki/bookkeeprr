import { describe, expect, it } from 'vitest';
import { mergeBooks } from '@/server/db/book-series-view';
import type { BookSeriesDetail, BookSeriesMemberWithSeries } from '@/server/db/book-series';

// Minimal stub builders

function makeDetail(
  overrides: Partial<BookSeriesDetail> = {},
): BookSeriesDetail {
  return {
    bookSeries: {
      id: 1, name: 'Test', contentType: 'ebook', source: 'manual',
      description: null, coverUrl: null, totalBooks: null,
      externalId: null, externalIdsJson: null,
      createdAt: new Date(), updatedAt: new Date(),
    },
    members: [],
    entries: [],
    ...overrides,
  };
}

function makeMember(
  seriesId: number,
  opts: {
    position?: number | null;
    titleEnglish?: string;
    isbn?: string | null;
    asin?: string | null;
    coverUrl?: string | null;
    hasFiles?: boolean;
  } = {},
): BookSeriesMemberWithSeries {
  return {
    hasFiles: opts.hasFiles ?? true,
    member: {
      id: seriesId,
      bookSeriesId: 1,
      seriesId,
      position: opts.position ?? null,
      linkSource: 'manual' as const,
    },
    // Only fields used by mergeBooks are set; rest are satisficed via cast.
    series: {
      id: seriesId,
      titleEnglish: opts.titleEnglish ?? `Title ${seriesId}`,
      titleRomaji: null,
      titleNative: null,
      contentType: 'ebook' as const,
      status: 'finished' as const,
      rootPath: `/tmp/${seriesId}`,
      qualityProfileId: 1,
      isbn: opts.isbn ?? null,
      asin: opts.asin ?? null,
      coverUrl: opts.coverUrl ?? null,
      description: null,
      totalVolumes: null,
      totalChapters: null,
      pageCount: null,
      runtimeMinutes: null,
      granularity: 'volume' as const,
      monitoring: 'all' as const,
      comicvineId: null,
      anilistId: null,
      malId: null,
      malIdUnique: null,
      mangadexId: null,
      author: null,
      narrator: null,
      groupId: null,
      publisher: null,
      startYear: null,
      openlibraryId: null,
      novelUpdatesSlug: null,
      novelUpdatesId: null,
      googleBooksVolumeId: null,
      googleBooksQuery: null,
      extraSearchTermsJson: '[]',
      createdAt: new Date(),
      updatedAt: new Date(),
      addedAt: new Date(),
    } as unknown as BookSeriesMemberWithSeries['series'],
  };
}

function makeEntry(
  opts: {
    position?: number | null;
    title: string;
    externalRef?: string | null;
    coverUrl?: string | null;
  },
) {
  return {
    id: Math.random(),
    bookSeriesId: 1,
    position: opts.position ?? null,
    title: opts.title,
    externalRef: opts.externalRef ?? null,
    coverUrl: opts.coverUrl ?? null,
    createdAt: new Date(),
  };
}

describe('mergeBooks', () => {
  it('Case 1: entry matched by externalRef → owned: true, uses member coverUrl', () => {
    const detail = makeDetail({
      members: [
        makeMember(10, { titleEnglish: 'Northern Lights', isbn: '111', coverUrl: 'http://cover/10' }),
      ],
      entries: [
        makeEntry({ position: 1, title: 'Northern Lights', externalRef: '111', coverUrl: 'http://entry-cover' }),
        makeEntry({ position: 2, title: 'The Subtle Knife', externalRef: '222' }),
      ],
    });

    const books = mergeBooks(detail);
    expect(books).toHaveLength(2);
    // Matched entry
    expect(books[0]).toMatchObject({ title: 'Northern Lights', owned: true, seriesId: 10, coverUrl: 'http://cover/10' });
    // Unmatched entry
    expect(books[1]).toMatchObject({ title: 'The Subtle Knife', owned: false, seriesId: null });
  });

  it('Case 2: entry matched by title+position when no externalRef', () => {
    const detail = makeDetail({
      members: [
        makeMember(20, { titleEnglish: 'The Amber Spyglass', position: 3 }),
      ],
      entries: [
        makeEntry({ position: 3, title: 'The Amber Spyglass', externalRef: null }),
      ],
    });

    const books = mergeBooks(detail);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ title: 'The Amber Spyglass', owned: true, seriesId: 20, position: 3 });
  });

  it('Case 3: unmatched entry → owned: false', () => {
    const detail = makeDetail({
      members: [],
      entries: [
        makeEntry({ position: 1, title: 'Missing Book', externalRef: 'abc' }),
      ],
    });

    const books = mergeBooks(detail);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ owned: false, seriesId: null, title: 'Missing Book' });
  });

  it('Case 4: orphan member (no matching entry) → appended as owned', () => {
    const detail = makeDetail({
      members: [
        makeMember(99, { titleEnglish: 'Manual Link', isbn: 'x99', position: null }),
      ],
      entries: [
        makeEntry({ position: 1, title: 'Something Else', externalRef: 'zzz' }),
      ],
    });

    const books = mergeBooks(detail);
    // entries[0] unmatched (owned:false), member[0] is orphan (owned:true)
    expect(books).toHaveLength(2);
    const orphan = books.find((b) => b.seriesId === 99);
    expect(orphan).toBeDefined();
    expect(orphan?.owned).toBe(true);
    expect(orphan?.title).toBe('Manual Link');
  });

  it('Case 4b: matched member with no files → owned: false, but keeps cover + seriesId', () => {
    // A linked series row with zero library files is monitored, not owned. The
    // book still shows its cover and links to the series, but is not counted as
    // owned (so "N of M owned" reflects readable files, not mere membership).
    const detail = makeDetail({
      members: [
        makeMember(28, {
          titleEnglish: 'Darker',
          isbn: 'd28',
          coverUrl: 'http://cover/28',
          hasFiles: false,
        }),
      ],
      entries: [makeEntry({ position: 5, title: 'Darker', externalRef: 'd28' })],
    });

    const books = mergeBooks(detail);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({
      title: 'Darker',
      owned: false,
      seriesId: 28,
      coverUrl: 'http://cover/28',
    });
  });

  it('Case 4c: orphan member with no files → appended as owned: false', () => {
    const detail = makeDetail({
      members: [makeMember(77, { titleEnglish: 'Empty Orphan', isbn: 'o77', hasFiles: false })],
      entries: [],
    });

    const books = mergeBooks(detail);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ seriesId: 77, owned: false, title: 'Empty Orphan' });
  });

  it('Case 5: entry matched by title-only fallback when position + ref differ', () => {
    // The Old Kingdom regression: a catalogue entry (year-ordered position, OL
    // work key as ref) and the owned member (source position, isbn/asin ref)
    // describe the same book but share neither position nor ref. Without the
    // title-only fallback the book would appear twice — once owned (orphan),
    // once not (entry). It must dedupe to a single owned row.
    const detail = makeDetail({
      members: [makeMember(42, { titleEnglish: 'Abhorsen', isbn: '978isbn', position: 3 })],
      entries: [makeEntry({ position: 5, title: 'Abhorsen', externalRef: '/works/OL2628772W' })],
    });

    const books = mergeBooks(detail);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ title: 'Abhorsen', owned: true, seriesId: 42 });
  });

  it('sorts by position nulls-last', () => {
    const detail = makeDetail({
      members: [
        makeMember(1, { titleEnglish: 'Book A', isbn: 'aaa', position: 1 }),
        makeMember(2, { titleEnglish: 'Orphan', isbn: 'zzz', position: null }),
      ],
      entries: [
        makeEntry({ position: 3, title: 'Book C', externalRef: 'ccc' }),
        makeEntry({ position: 1, title: 'Book A', externalRef: 'aaa' }),
        makeEntry({ position: 2, title: 'Book B', externalRef: 'bbb' }),
      ],
    });

    const books = mergeBooks(detail);
    const positions = books.map((b) => b.position);
    // 1, 2, 3, then null (orphan)
    expect(positions).toEqual([1, 2, 3, null]);
  });
});

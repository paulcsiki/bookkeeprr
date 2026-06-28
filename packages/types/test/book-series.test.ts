import { describe, expect, it } from 'vitest';
import { BookSeriesDetailResponse, CreateBookSeriesBody } from '../src/book-series';

describe('book-series shared schemas', () => {
  it('accepts a valid create body and rejects an unknown content type', () => {
    expect(CreateBookSeriesBody.parse({ name: 'X', contentType: 'ebook' }).name).toBe('X');
    expect(CreateBookSeriesBody.safeParse({ name: 'X', contentType: 'manga' }).success).toBe(false);
  });
  it('parses a detail response merging owned + missing books', () => {
    const parsed = BookSeriesDetailResponse.parse({
      id: 1, name: 'HDM', contentType: 'ebook', coverUrl: null, totalBooks: 3,
      memberCount: 2, source: 'googlebooks', description: null,
      books: [{ position: 1, title: 'Northern Lights', externalRef: null, coverUrl: null, owned: true, seriesId: 7 }],
    });
    expect(parsed.books[0]!.owned).toBe(true);
  });
});

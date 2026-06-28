import { SearchResult, SearchResponse, AddSeriesRequest } from '@/api/schemas';

describe('search schemas', () => {
  it('parses a SearchResult', () => {
    const r = SearchResult.parse({
      sourceId: 'anilist:1234',
      contentType: 'manga',
      title: 'Vinland Saga',
      author: 'Makoto Yukimura',
      year: 2005,
      coverUrl: null,
      summary: 'A historical saga',
      inLibrary: false,
    });
    expect(r.contentType).toBe('manga');
    expect(r.inLibrary).toBe(false);
  });

  it('parses a SearchResponse', () => {
    const r = SearchResponse.parse({
      query: 'vinland',
      contentType: 'manga',
      tookMs: 412,
      results: [],
    });
    expect(r.tookMs).toBe(412);
  });

  it('parses an AddSeriesRequest', () => {
    const r = AddSeriesRequest.parse({
      sourceId: 'anilist:1234',
      contentType: 'manga',
      qualityProfileId: 1,
    });
    expect(r.sourceId).toBe('anilist:1234');
  });

  it('rejects invalid content type', () => {
    expect(() =>
      SearchResult.parse({
        sourceId: 'x',
        contentType: 'graphic-novel',
        title: 't',
        author: null,
        year: null,
        coverUrl: null,
        summary: null,
        inLibrary: false,
      }),
    ).toThrow();
  });
});

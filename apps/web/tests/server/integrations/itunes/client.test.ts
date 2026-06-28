import { afterEach, describe, expect, it } from 'vitest';
import {
  searchAudiobooks,
  __setITunesFetcherForTests,
  __resetITunesForTests,
} from '@/server/integrations/itunes';

afterEach(() => __resetITunesForTests());

function mock(body: unknown): void {
  __setITunesFetcherForTests(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }));
}

describe('itunes searchAudiobooks', () => {
  it('maps results and upscales the 100×100 artwork to 600×600', async () => {
    mock({
      resultCount: 1,
      results: [
        {
          collectionId: 123,
          collectionName: 'Greenlights',
          artistName: 'Matthew McConaughey',
          artworkUrl100: 'https://is1.mzstatic.com/image/thumb/abc/100x100bb.jpg',
          releaseDate: '2020-10-20T07:00:00Z',
        },
      ],
    });
    const hits = await searchAudiobooks('greenlights');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      id: '123',
      title: 'Greenlights',
      author: 'Matthew McConaughey',
      releaseYear: 2020,
      coverUrl: 'https://is1.mzstatic.com/image/thumb/abc/600x600bb.jpg',
    });
  });

  it('skips results missing an id or title', async () => {
    mock({ results: [{ artistName: 'nobody' }, { collectionId: 9, collectionName: 'Ok' }] });
    const hits = await searchAudiobooks('x');
    expect(hits.map((h) => h.title)).toEqual(['Ok']);
  });

  it('throws on a non-ok response', async () => {
    __setITunesFetcherForTests(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(searchAudiobooks('x')).rejects.toThrow();
  });
});

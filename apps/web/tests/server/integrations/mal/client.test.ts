import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { malClientIdSetting } from '@/server/db/settings/mal';
import {
  searchMangaMal,
  getMangaMal,
  getMangaRankingMal,
  MalError,
  __setMalFetcherForTests,
  __resetMalForTests,
} from '@/server/integrations/mal/client';
import {
  mapMalStatus,
  parseMalYear,
  collectMalTitles,
  type MalStatus,
  type MalMangaNodeT,
} from '@/server/integrations/mal/schemas';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  __resetMalForTests();
});

afterEach(() => {
  __resetMalForTests();
  h.cleanup();
});

const SEARCH_NODE = {
  id: 11,
  title: 'Naruto',
  alternative_titles: {
    synonyms: ['NARUTO'],
    en: 'Naruto',
    ja: 'NARUTO -ナルト-',
  },
  main_picture: {
    medium: 'https://cdn.myanimelist.net/images/manga/medium.jpg',
    large: 'https://cdn.myanimelist.net/images/manga/large.jpg',
  },
  synopsis: 'A ninja story.',
  num_volumes: 72,
  num_chapters: 700,
  status: 'finished',
  media_type: 'manga',
  start_date: '1999-09-21',
};

function searchBody(...nodes: unknown[]): string {
  return JSON.stringify({ data: nodes.map((node) => ({ node })), paging: {} });
}

describe('searchMangaMal', () => {
  it('parses the {data:[{node}]} envelope and maps fields', async () => {
    await malClientIdSetting.set('test-client-id');
    __setMalFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => searchBody(SEARCH_NODE),
    }));

    const hits = await searchMangaMal('naruto');
    expect(hits).toHaveLength(1);
    const h = hits[0]!;
    expect(h.source).toBe('mal');
    expect(h.malId).toBe(11);
    expect(h.title).toBe('Naruto');
    expect(h.coverUrl).toBe('https://cdn.myanimelist.net/images/manga/large.jpg');
    expect(h.status).toBe('finished');
    expect(h.totalVolumes).toBe(72);
    expect(h.totalChapters).toBe(700);
    expect(h.year).toBe(1999);
    expect(h.mediaType).toBe('manga');
  });

  it('falls back to medium cover when large is absent', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        searchBody({ ...SEARCH_NODE, main_picture: { medium: 'http://x/m.jpg' } }),
    }));

    const hits = await searchMangaMal('q');
    expect(hits[0]!.coverUrl).toBe('http://x/m.jpg');
  });

  it('collects all titles (main + en + ja + synonyms), de-duplicated', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => searchBody(SEARCH_NODE),
    }));

    const hits = await searchMangaMal('q');
    const t = hits[0]!.titles;
    expect(t.main).toBe('Naruto');
    expect(t.en).toBe('Naruto');
    expect(t.ja).toBe('NARUTO -ナルト-');
    expect(t.synonyms).toEqual(['NARUTO']);
    // 'Naruto' and 'NARUTO' collapse (case-insensitive); 'Naruto' en is dup of main.
    expect(t.all).toEqual(['Naruto', 'NARUTO -ナルト-']);
  });

  it('normalizes 0/absent volume & chapter counts to null', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        searchBody({ ...SEARCH_NODE, num_volumes: 0, num_chapters: undefined }),
    }));

    const hits = await searchMangaMal('q');
    expect(hits[0]!.totalVolumes).toBeNull();
    expect(hits[0]!.totalChapters).toBeNull();
  });

  it('sends the X-MAL-CLIENT-ID header and limit/fields query params', async () => {
    await malClientIdSetting.set('my-secret-id');
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    __setMalFetcherForTests(async (url, headers) => {
      capturedUrl = url;
      capturedHeaders = headers;
      return { ok: true, status: 200, text: async () => searchBody() };
    });

    await searchMangaMal('one piece');
    expect(capturedHeaders['X-MAL-CLIENT-ID']).toBe('my-secret-id');
    expect(capturedUrl).toContain('https://api.myanimelist.net/v2/manga?');
    expect(capturedUrl).toContain('q=one+piece');
    expect(capturedUrl).toContain('limit=20');
    expect(capturedUrl).toContain('fields=');
    expect(decodeURIComponent(capturedUrl)).toContain('num_volumes');
  });

  it('returns [] on empty result set', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => searchBody(),
    }));
    expect(await searchMangaMal('zzz')).toEqual([]);
  });

  it('throws MalError when the client id is empty', async () => {
    let called = false;
    __setMalFetcherForTests(async () => {
      called = true;
      return { ok: true, status: 200, text: async () => searchBody() };
    });
    await expect(searchMangaMal('q')).rejects.toThrow(/client ID is not configured/);
    expect(called).toBe(false);
  });

  it('throws MalError on a 5xx', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({ ok: false, status: 503, text: async () => '' }));
    await expect(searchMangaMal('q')).rejects.toThrow(/HTTP 503/);
  });

  it('throws MalError on malformed JSON', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({ ok: true, status: 200, text: async () => 'nope' }));
    await expect(searchMangaMal('q')).rejects.toThrow(MalError);
  });
});

function rankingBody(...nodes: unknown[]): string {
  return JSON.stringify({
    data: nodes.map((node, i) => ({ node, ranking: { rank: i + 1 } })),
    paging: {},
  });
}

describe('getMangaRankingMal', () => {
  it('parses the ranking envelope ({data:[{node,ranking}]}) and maps hits', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => rankingBody(SEARCH_NODE, { ...SEARCH_NODE, id: 21, title: 'One Piece' }),
    }));

    const hits = await getMangaRankingMal();
    expect(hits).toHaveLength(2);
    expect(hits[0]!.source).toBe('mal');
    expect(hits[0]!.malId).toBe(11);
    expect(hits[0]!.title).toBe('Naruto');
    expect(hits[1]!.malId).toBe(21);
    expect(hits[1]!.title).toBe('One Piece');
  });

  it('requests the ranking endpoint with ranking_type, limit, fields and the client-id header', async () => {
    await malClientIdSetting.set('my-secret-id');
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    __setMalFetcherForTests(async (url, headers) => {
      capturedUrl = url;
      capturedHeaders = headers;
      return { ok: true, status: 200, text: async () => rankingBody() };
    });

    await getMangaRankingMal('bypopularity', 24);
    expect(capturedHeaders['X-MAL-CLIENT-ID']).toBe('my-secret-id');
    expect(capturedUrl).toContain('https://api.myanimelist.net/v2/manga/ranking?');
    expect(capturedUrl).toContain('ranking_type=bypopularity');
    expect(capturedUrl).toContain('limit=24');
    expect(capturedUrl).toContain('fields=');
    expect(decodeURIComponent(capturedUrl)).toContain('num_volumes');
  });

  it('defaults to bypopularity ranking_type, limit 18, offset 0', async () => {
    await malClientIdSetting.set('cid');
    let capturedUrl = '';
    __setMalFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => rankingBody() };
    });
    await getMangaRankingMal();
    expect(capturedUrl).toContain('ranking_type=bypopularity');
    expect(capturedUrl).toContain('limit=18');
    expect(capturedUrl).toContain('offset=0');
  });

  it('passes the offset for pagination', async () => {
    await malClientIdSetting.set('cid');
    let capturedUrl = '';
    __setMalFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => rankingBody() };
    });
    await getMangaRankingMal('bypopularity', 18, 36);
    expect(capturedUrl).toContain('limit=18');
    expect(capturedUrl).toContain('offset=36');
  });

  it('returns [] on 404', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({ ok: false, status: 404, text: async () => '' }));
    expect(await getMangaRankingMal()).toEqual([]);
  });

  it('throws MalError when the client id is empty', async () => {
    let called = false;
    __setMalFetcherForTests(async () => {
      called = true;
      return { ok: true, status: 200, text: async () => rankingBody() };
    });
    await expect(getMangaRankingMal()).rejects.toThrow(/client ID is not configured/);
    expect(called).toBe(false);
  });
});

describe('getMangaMal', () => {
  it('returns mapped detail including synopsis', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(SEARCH_NODE),
    }));

    const detail = await getMangaMal(11);
    expect(detail).not.toBeNull();
    expect(detail!.malId).toBe(11);
    expect(detail!.synopsis).toBe('A ninja story.');
    expect(detail!.status).toBe('finished');
    expect(detail!.year).toBe(1999);
  });

  it('requests the by-id endpoint with the fields param', async () => {
    await malClientIdSetting.set('cid');
    let capturedUrl = '';
    __setMalFetcherForTests(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, text: async () => JSON.stringify(SEARCH_NODE) };
    });
    await getMangaMal(42);
    expect(capturedUrl).toContain('https://api.myanimelist.net/v2/manga/42?');
    expect(capturedUrl).toContain('fields=');
  });

  it('returns null on 404', async () => {
    await malClientIdSetting.set('cid');
    __setMalFetcherForTests(async () => ({ ok: false, status: 404, text: async () => '' }));
    expect(await getMangaMal(999)).toBeNull();
  });

  it('throws MalError when the client id is empty', async () => {
    await expect(getMangaMal(1)).rejects.toThrow(/client ID is not configured/);
  });
});

describe('mapMalStatus', () => {
  const cases: Array<[string | null | undefined, MalStatus]> = [
    ['finished', 'finished'],
    ['currently_publishing', 'releasing'],
    ['not_yet_published', 'releasing'],
    ['on_hiatus', 'hiatus'],
    ['discontinued', 'cancelled'],
    ['something_unexpected', 'releasing'],
    [null, 'releasing'],
    [undefined, 'releasing'],
  ];
  it.each(cases)('maps %s → %s', (raw, expected) => {
    expect(mapMalStatus(raw)).toBe(expected);
  });
});

describe('parseMalYear', () => {
  it.each([
    ['1999-09-21', 1999],
    ['2007-04', 2007],
    ['2010', 2010],
    [null, null],
    [undefined, null],
    ['', null],
  ])('parses %s → %s', (input, expected) => {
    expect(parseMalYear(input as string | null | undefined)).toBe(expected);
  });
});

describe('collectMalTitles', () => {
  it('handles a missing alternative_titles block', () => {
    const t = collectMalTitles({ id: 1, title: 'Solo Title' } as MalMangaNodeT);
    expect(t.main).toBe('Solo Title');
    expect(t.en).toBeNull();
    expect(t.ja).toBeNull();
    expect(t.synonyms).toEqual([]);
    expect(t.all).toEqual(['Solo Title']);
  });

  it('dedupes case-insensitively and drops empties across all title fields', () => {
    const t = collectMalTitles({
      id: 1,
      title: 'Naruto',
      alternative_titles: { synonyms: ['NARUTO', ''], en: 'naruto', ja: 'NARUTO -ナルト-' },
    } as MalMangaNodeT);
    // 'Naruto'/'NARUTO'/'naruto' collapse to one; empty dropped; ja kept.
    const lowered = t.all.map((s) => s.toLowerCase());
    expect(lowered.filter((s) => s === 'naruto')).toHaveLength(1);
    expect(t.all).toContain('NARUTO -ナルト-');
    expect(t.all).not.toContain('');
  });
});

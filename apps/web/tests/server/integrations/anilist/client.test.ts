import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  searchManga,
  getManga,
  searchNovel,
  trendingManga,
  popularManga,
  recentManga,
  trendingNovels,
  recentNovels,
  __resetForTests,
} from '@/server/integrations/anilist/client';
import { extractAuthorFromStaff } from '@/server/integrations/anilist/schemas';

const fixturesDir = join(process.cwd(), 'tests/fixtures/anilist');
function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  __resetForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AniList client', () => {
  it('searchManga maps the response to SearchHit[]', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-chainsaw-man.json'),
    } as Response);

    const hits = await searchManga('Chainsaw Man');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.anilistId).toBe(105778);
    expect(hits[0]?.titleEnglish).toBe('Chainsaw Man');
    expect(hits[0]?.status).toBe('releasing');
    expect(hits[0]?.coverUrl).toMatch(/anilistcdn/);
  });

  it('searchManga returns empty array on empty response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);
    const hits = await searchManga('nope');
    expect(hits).toEqual([]);
  });

  it('searchManga throws on non-200 HTTP', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    await expect(searchManga('boom')).rejects.toThrow();
  });

  it('getManga maps detail with volumes + chapters', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('manga-105778.json'),
    } as Response);
    const detail = await getManga(105778);
    expect(detail.anilistId).toBe(105778);
    expect(detail.totalVolumes).toBe(16);
    expect(detail.totalChapters).toBe(175);
    expect(detail.description).toMatch(/Denji/);
  });

  it('trendingManga maps the response to SearchHit[]', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-chainsaw-man.json'),
    } as Response);

    const hits = await trendingManga();
    expect(hits).toHaveLength(1);
    expect(hits[0]?.anilistId).toBe(105778);
    expect(hits[0]?.titleEnglish).toBe('Chainsaw Man');
  });

  it('trendingManga issues a TRENDING_DESC MANGA sort with no search variable', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);
    await trendingManga();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toContain('TRENDING_DESC');
    expect(body.query).toContain('type: MANGA');
    expect(body.variables.search).toBeUndefined();
  });

  it('trendingManga passes a 1-based page variable into the Page query', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);
    await trendingManga(3);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toContain('Page(page: $page');
    expect(body.variables.page).toBe(3);
  });

  it('trendingManga defaults to page 1 when no page is given', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);
    await trendingManga();
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.variables.page).toBe(1);
  });

  it('recentManga passes the page variable', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);
    await recentManga(2);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.variables.page).toBe(2);
  });

  it('popularManga issues a POPULARITY_DESC MANGA sort with a page variable', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-chainsaw-man.json'),
    } as Response);
    const hits = await popularManga(2);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.anilistId).toBe(105778);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toContain('POPULARITY_DESC');
    expect(body.query).toContain('type: MANGA');
    expect(body.query).not.toContain('LIGHT_NOVEL');
    expect(body.variables.page).toBe(2);
    expect(body.variables.search).toBeUndefined();
  });

  it('searchManga sends a GraphQL query body to the AniList endpoint', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);
    await searchManga('test query');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graphql.anilist.co');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toContain('Page');
    expect(body.variables.search).toBe('test query');
  });
});

describe('trendingNovels + recentNovels', () => {
  it('trendingNovels issues a NOVEL TRENDING_DESC sort and maps with author', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-novel-rezero.json'),
    } as Response);

    const hits = await trendingNovels();
    expect(hits).toHaveLength(2);
    expect(hits[0]?.author).toBe('Tappei Nagatsuki');

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toContain('TRENDING_DESC');
    // AniList's MediaFormat enum value is NOVEL — LIGHT_NOVEL is a 400 (regression guard).
    expect(body.query).toContain('format: NOVEL');
    expect(body.query).not.toContain('LIGHT_NOVEL');
    expect(body.variables.search).toBeUndefined();
  });

  it('recentNovels issues a NOVEL START_DATE_DESC sort', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);

    await recentNovels();
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toContain('START_DATE_DESC');
    expect(body.query).toContain('format: NOVEL');
    expect(body.query).not.toContain('LIGHT_NOVEL');
    expect(body.variables.search).toBeUndefined();
  });

  it('trendingNovels/recentNovels pass a page variable', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-empty.json'),
    } as Response);

    await trendingNovels(4);
    let body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.query).toContain('Page(page: $page');
    expect(body.variables.page).toBe(4);

    await recentNovels(5);
    body = JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body));
    expect(body.variables.page).toBe(5);
  });
});

describe('searchNovel + getNovel + author extraction', () => {
  it('parses a NOVEL response and populates author from Story role', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => loadFixture('search-novel-rezero.json'),
    } as Response);

    const hits = await searchNovel('Re:Zero');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({
      anilistId: 21355,
      titleEnglish: 'Re:Zero -Starting Life in Another World-',
      titleRomaji: 'Re:Zero kara Hajimeru Isekai Seikatsu',
      author: 'Tappei Nagatsuki',
      format: 'LIGHT_NOVEL',
      startYear: 2014,
    });
    expect(hits[1]!.author).toBeNull();

    // The query argument must use AniList's NOVEL enum, not LIGHT_NOVEL (400).
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toContain('format: NOVEL');
    expect(body.query).not.toContain('LIGHT_NOVEL');
  });

  it('extractAuthorFromStaff returns null for missing staff', () => {
    expect(extractAuthorFromStaff(null)).toBeNull();
    expect(extractAuthorFromStaff(undefined)).toBeNull();
    expect(extractAuthorFromStaff({ edges: [] })).toBeNull();
  });

  it('extractAuthorFromStaff matches /Story/i (case-insensitive)', () => {
    const result = extractAuthorFromStaff({
      edges: [{ role: 'STORY', node: { name: { full: 'Author Name' } } }],
    });
    expect(result).toBe('Author Name');
  });

  it('extractAuthorFromStaff first Story role wins', () => {
    const result = extractAuthorFromStaff({
      edges: [
        { role: 'Illustration', node: { name: { full: 'Illustrator' } } },
        { role: 'Story', node: { name: { full: 'First Story' } } },
        { role: 'Original Story', node: { name: { full: 'Second Story' } } },
      ],
    });
    expect(result).toBe('First Story');
  });

  it('extractAuthorFromStaff falls back to native if full is null', () => {
    const result = extractAuthorFromStaff({
      edges: [{ role: 'Story', node: { name: { full: null, native: '長月達平' } } }],
    });
    expect(result).toBe('長月達平');
  });
});

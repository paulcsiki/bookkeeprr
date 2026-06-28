import {
  AniListSearchResponse,
  AniListMangaResponse,
  AniListNovelSearchResponse,
  AniListNovelResponse,
  mapSearchEntry,
  mapMangaDetail,
  mapNovelSearchEntry,
  mapNovelDetail,
  type SearchHit,
  type MangaDetail,
} from './schemas';

const ENDPOINT = 'https://graphql.anilist.co';

// Rate limit: 90 req/min. Token bucket: refill 1 token every 700ms (rounded up
// from 60_000 / 90 = 666ms) for a safety margin.
const REFILL_INTERVAL_MS = 700;
const BUCKET_SIZE = 90;

let bucket = BUCKET_SIZE;
let lastRefillAt = Date.now();

function refill(): void {
  const now = Date.now();
  const elapsed = now - lastRefillAt;
  if (elapsed >= REFILL_INTERVAL_MS) {
    const tokens = Math.floor(elapsed / REFILL_INTERVAL_MS);
    bucket = Math.min(BUCKET_SIZE, bucket + tokens);
    lastRefillAt = now;
  }
}

async function acquire(): Promise<void> {
  for (;;) {
    refill();
    if (bucket > 0) {
      bucket--;
      return;
    }
    const wait = REFILL_INTERVAL_MS - (Date.now() - lastRefillAt);
    await new Promise((r) => setTimeout(r, Math.max(wait, 50)));
  }
}

export function __resetForTests(): void {
  bucket = BUCKET_SIZE;
  lastRefillAt = Date.now();
}

async function graphqlPost<T>(body: {
  query: string;
  variables: Record<string, unknown>;
}): Promise<T> {
  await acquire();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`AniList HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

const SEARCH_QUERY = `
query ($search: String!) {
  Page(perPage: 12) {
    media(search: $search, type: MANGA) {
      id
      title { english romaji native }
      coverImage { extraLarge large medium }
      status
      format
      startDate { year }
    }
  }
}`;

const MANGA_QUERY = `
query ($id: Int!) {
  Media(id: $id, type: MANGA) {
    id
    title { english romaji native }
    coverImage { extraLarge large medium }
    status
    format
    startDate { year }
    description(asHtml: false)
    volumes
    chapters
  }
}`;

// Fixed page size for the paginated browse rails ("See all" infinite scroll).
const BROWSE_PER_PAGE = 18;

// Genuinely-recent manga for the Discover "New this week" rail. A text search
// like "new release 2024" matches nothing — AniList needs a sorted browse.
// Paginated via $page (1-based) for the "See all" infinite-scroll view.
const RECENT_QUERY = `
query ($page: Int) {
  Page(page: $page, perPage: ${BROWSE_PER_PAGE}) {
    media(type: MANGA, status: RELEASING, sort: [START_DATE_DESC]) {
      id
      title { english romaji native }
      coverImage { extraLarge large medium }
      status
      format
      startDate { year }
    }
  }
}`;

export async function recentManga(page = 1): Promise<SearchHit[]> {
  const raw = await graphqlPost<unknown>({ query: RECENT_QUERY, variables: { page } });
  const parsed = AniListSearchResponse.parse(raw);
  return parsed.data.Page.media.map(mapSearchEntry);
}

// AniList's real trending sort for the Discover "Trending now" rail. No status
// filter — TRENDING_DESC already reflects what's hot right now. Paginated via
// $page (1-based).
const TRENDING_QUERY = `
query ($page: Int) {
  Page(page: $page, perPage: ${BROWSE_PER_PAGE}) {
    media(type: MANGA, sort: [TRENDING_DESC]) {
      id
      title { english romaji native }
      coverImage { extraLarge large medium }
      status
      format
      startDate { year }
    }
  }
}`;

export async function trendingManga(page = 1): Promise<SearchHit[]> {
  const raw = await graphqlPost<unknown>({ query: TRENDING_QUERY, variables: { page } });
  const parsed = AniListSearchResponse.parse(raw);
  return parsed.data.Page.media.map(mapSearchEntry);
}

// AniList's POPULARITY_DESC sort, manga-only — the all-time most popular titles.
// Backs the Discover "Popular" rail (replaces the old mixed-type bestseller
// fan-out). Paginated via $page (1-based).
const POPULAR_QUERY = `
query ($page: Int) {
  Page(page: $page, perPage: ${BROWSE_PER_PAGE}) {
    media(type: MANGA, sort: [POPULARITY_DESC]) {
      id
      title { english romaji native }
      coverImage { extraLarge large medium }
      status
      format
      startDate { year }
    }
  }
}`;

export async function popularManga(page = 1): Promise<SearchHit[]> {
  const raw = await graphqlPost<unknown>({ query: POPULAR_QUERY, variables: { page } });
  const parsed = AniListSearchResponse.parse(raw);
  return parsed.data.Page.media.map(mapSearchEntry);
}

export async function searchManga(query: string): Promise<SearchHit[]> {
  const raw = await graphqlPost<unknown>({
    query: SEARCH_QUERY,
    variables: { search: query },
  });
  const parsed = AniListSearchResponse.parse(raw);
  return parsed.data.Page.media.map(mapSearchEntry);
}

export async function getManga(anilistId: number): Promise<MangaDetail> {
  const raw = await graphqlPost<unknown>({
    query: MANGA_QUERY,
    variables: { id: anilistId },
  });
  const parsed = AniListMangaResponse.parse(raw);
  return mapMangaDetail(parsed.data.Media);
}

const NOVEL_SEARCH_QUERY = `
query ($search: String!) {
  Page(perPage: 12) {
    media(search: $search, type: MANGA, format: NOVEL) {
      id
      title { english romaji native }
      coverImage { extraLarge large medium }
      status
      format
      startDate { year }
      volumes
      chapters
      staff(perPage: 5, sort: RELEVANCE) {
        edges {
          role
          node { name { full native } }
        }
      }
    }
  }
}`;

const NOVEL_QUERY = `
query ($id: Int!) {
  Media(id: $id, type: MANGA) {
    id
    title { english romaji native }
    coverImage { extraLarge large medium }
    status
    format
    startDate { year }
    description(asHtml: false)
    volumes
    chapters
    staff(perPage: 5, sort: RELEVANCE) {
      edges {
        role
        node { name { full native } }
      }
    }
  }
}`;

export async function searchNovel(query: string): Promise<SearchHit[]> {
  const raw = await graphqlPost<unknown>({
    query: NOVEL_SEARCH_QUERY,
    variables: { search: query },
  });
  const parsed = AniListNovelSearchResponse.parse(raw);
  return parsed.data.Page.media.map(mapNovelSearchEntry);
}

export async function getNovel(anilistId: number): Promise<MangaDetail> {
  const raw = await graphqlPost<unknown>({
    query: NOVEL_QUERY,
    variables: { id: anilistId },
  });
  const parsed = AniListNovelResponse.parse(raw);
  return mapNovelDetail(parsed.data.Media);
}

// AniList's real trending sort for the Discover "Trending now" novel rail.
// Mirrors TRENDING_QUERY but constrained to NOVEL with the novel staff
// selection so the author can be derived. (AniList's MediaFormat enum value is
// NOVEL — LIGHT_NOVEL is rejected with HTTP 400.)
const NOVEL_TRENDING_QUERY = `
query ($page: Int) {
  Page(page: $page, perPage: ${BROWSE_PER_PAGE}) {
    media(type: MANGA, format: NOVEL, sort: [TRENDING_DESC]) {
      id
      title { english romaji native }
      coverImage { extraLarge large medium }
      status
      format
      startDate { year }
      volumes
      chapters
      staff(perPage: 5, sort: RELEVANCE) {
        edges {
          role
          node { name { full native } }
        }
      }
    }
  }
}`;

export async function trendingNovels(page = 1): Promise<SearchHit[]> {
  const raw = await graphqlPost<unknown>({ query: NOVEL_TRENDING_QUERY, variables: { page } });
  const parsed = AniListNovelSearchResponse.parse(raw);
  return parsed.data.Page.media.map(mapNovelSearchEntry);
}

// Genuinely-recent light novels for the Discover "New this week" novel rail.
// Mirrors RECENT_QUERY but constrained to NOVEL (AniList's MediaFormat enum
// value; LIGHT_NOVEL → HTTP 400).
const NOVEL_RECENT_QUERY = `
query ($page: Int) {
  Page(page: $page, perPage: ${BROWSE_PER_PAGE}) {
    media(type: MANGA, format: NOVEL, status: RELEASING, sort: [START_DATE_DESC]) {
      id
      title { english romaji native }
      coverImage { extraLarge large medium }
      status
      format
      startDate { year }
      volumes
      chapters
      staff(perPage: 5, sort: RELEVANCE) {
        edges {
          role
          node { name { full native } }
        }
      }
    }
  }
}`;

export async function recentNovels(page = 1): Promise<SearchHit[]> {
  const raw = await graphqlPost<unknown>({ query: NOVEL_RECENT_QUERY, variables: { page } });
  const parsed = AniListNovelSearchResponse.parse(raw);
  return parsed.data.Page.media.map(mapNovelSearchEntry);
}

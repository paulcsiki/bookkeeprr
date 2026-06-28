import { VolumesResponse, VolumeResponse } from './schemas';
import type { Edition } from './derive';

const BASE = 'https://www.googleapis.com/books/v1';
const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export class GoogleBooksError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GoogleBooksError';
  }
}

type FetcherResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};
type Fetcher = (url: string, opts?: { signal?: AbortSignal }) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url, opts) => {
  const r = await fetch(url, { headers: { 'user-agent': 'bookkeeprr/0.1' }, signal: opts?.signal });
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

const cache = new Map<string, { value: unknown; expiresAt: number }>();
let lastFetchAt = 0;

export function __setGoogleBooksFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetGoogleBooksForTests(): void {
  activeFetcher = defaultFetcher;
  cache.clear();
  lastFetchAt = 0;
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastFetchAt;
  if (elapsed < RATE_LIMIT_MS) {
    const jitter = Math.random() * JITTER_MS;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed + jitter));
  }
  lastFetchAt = Date.now();
}

function pickIsbn(
  identifiers: Array<{ type: string; identifier: string }> | undefined,
): string | null {
  if (!identifiers) return null;
  const isbn13 = identifiers.find((i) => i.type === 'ISBN_13');
  if (isbn13) return isbn13.identifier;
  const isbn10 = identifiers.find((i) => i.type === 'ISBN_10');
  if (isbn10) return isbn10.identifier;
  return null;
}

function httpsify(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//, 'https://');
}

export type GoogleBooksLookup = {
  description: string | null;
  pageCount: number | null;
  coverUrl: string | null;
};

export async function lookupByIsbn(isbn: string, apiKey?: string | null): Promise<GoogleBooksLookup | null> {
  const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const url = `${BASE}/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1${key}`;

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as GoogleBooksLookup | null;
  }

  await rateLimit();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new GoogleBooksError(`fetch failed for ${BASE}/volumes`, err);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new GoogleBooksError(`HTTP ${resp.status}`);

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new GoogleBooksError('response shape invalid', err);
  }
  const validated = VolumesResponse.safeParse(parsed);
  if (!validated.success) {
    throw new GoogleBooksError('response shape invalid', validated.error);
  }

  let result: GoogleBooksLookup | null;
  const item = validated.data.items?.[0];
  if (!item) {
    result = null;
  } else {
    result = {
      description: item.volumeInfo.description ?? null,
      pageCount: item.volumeInfo.pageCount ?? null,
      coverUrl:
        httpsify(item.volumeInfo.imageLinks?.thumbnail) ??
        httpsify(item.volumeInfo.imageLinks?.smallThumbnail),
    };
  }

  cache.set(url, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

export type GoogleBooksSearchHit = {
  gbid: string;
  title: string;
  author: string | null;
  year: number | null;
  isbn: string | null;
  coverUrl: string | null;
};

/** Timeout in ms for ebook-search fetches — fast-fail so a hung provider
 *  doesn't stall the whole discover fan-out. */
const SEARCH_TIMEOUT_MS = 5_000;

/**
 * Title-search Google Books for ebook discovery. Returns up to 20 hits mapped
 * to a common shape. Uses the API key when provided (keyless = low quota and
 * likely to 429 from the cluster). Throws `GoogleBooksError` on network or API
 * errors — callers should treat this source as best-effort.
 */
export async function searchVolumes(q: string, apiKey?: string | null): Promise<GoogleBooksSearchHit[]> {
  const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const url = `${BASE}/volumes?q=${encodeURIComponent(q)}&printType=books&maxResults=20${key}`;

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as GoogleBooksSearchHit[];

  await rateLimit();

  let resp: FetcherResponse;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    resp = await activeFetcher(url, { signal: controller.signal });
  } catch (err) {
    throw new GoogleBooksError(`fetch failed for ${BASE}/volumes`, err);
  } finally {
    clearTimeout(timeout);
  }

  if (resp.status === 429) throw new GoogleBooksError('HTTP 429 rate limited');
  if (resp.status === 404) return [];
  if (!resp.ok) throw new GoogleBooksError(`HTTP ${resp.status}`);

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new GoogleBooksError('response shape invalid', err);
  }
  const validated = VolumesResponse.safeParse(parsed);
  if (!validated.success) throw new GoogleBooksError('response shape invalid', validated.error);

  const items = validated.data.items ?? [];
  const hits: GoogleBooksSearchHit[] = items.map((item) => ({
    gbid: item.id,
    title: item.volumeInfo.title ?? '',
    author: item.volumeInfo.authors?.[0] ?? null,
    year: item.volumeInfo.publishedDate
      ? (parseInt(item.volumeInfo.publishedDate.slice(0, 4), 10) || null)
      : null,
    isbn: pickIsbn(item.volumeInfo.industryIdentifiers),
    coverUrl:
      httpsify(item.volumeInfo.imageLinks?.thumbnail) ??
      httpsify(item.volumeInfo.imageLinks?.smallThumbnail),
  }));

  cache.set(url, { value: hits, expiresAt: Date.now() + TTL_MS });
  return hits;
}

/**
 * Upgrade a Google Books image link to the largest practical size: prefer the
 * larger imageLinks keys, else strip the thumbnail's `zoom`/`edge=curl` params
 * so the content endpoint returns a full-size cover.
 */
export function bestCoverUrl(imageLinks: Record<string, string | undefined> | undefined): string | null {
  if (!imageLinks) return null;
  const ordered =
    imageLinks.extraLarge ??
    imageLinks.large ??
    imageLinks.medium ??
    imageLinks.small ??
    imageLinks.thumbnail ??
    imageLinks.smallThumbnail;
  const upgraded = (ordered ?? '').replace(/&edge=curl/g, '').replace(/zoom=\d+/g, 'zoom=3');
  return httpsify(upgraded || undefined);
}

/**
 * Targeted single-volume lookup, used to fill cover/metadata gaps the broad
 * series search misses. Queries the exact volume (`intitle:"<title>" intitle:"Vol. N"`)
 * and returns normalized editions (one page, maxResults 20). Filtering/selection
 * is the caller's job (reuse deriveSeriesFromEditions' guards).
 */
export async function searchVolumeEdition(
  title: string,
  volume: number,
  apiKey?: string | null,
): Promise<Edition[]> {
  const q = encodeURIComponent(
    `intitle:${JSON.stringify(title)} intitle:${JSON.stringify('Vol. ' + volume)}`,
  );
  const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const url = `${BASE}/volumes?q=${q}&langRestrict=en&printType=books&maxResults=20${key}`;

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as Edition[];

  await rateLimit();
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new GoogleBooksError(`fetch failed for ${BASE}/volumes`, err);
  }
  if (!resp.ok) throw new GoogleBooksError(`HTTP ${resp.status}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await resp.text());
  } catch (err) {
    throw new GoogleBooksError('response shape invalid', err);
  }
  const validated = VolumesResponse.safeParse(parsed);
  if (!validated.success) throw new GoogleBooksError('response shape invalid', validated.error);

  const items = validated.data.items ?? [];
  const editions: Edition[] = items.map((item) => ({
    id: item.id,
    title: item.volumeInfo.title ?? '',
    publisher: item.volumeInfo.publisher ?? null,
    description: item.volumeInfo.description ?? null,
    pageCount: item.volumeInfo.pageCount ?? null,
    language: item.volumeInfo.language ?? null,
    coverUrl: bestCoverUrl(item.volumeInfo.imageLinks),
    viewability: item.accessInfo?.viewability ?? null,
    isbn: pickIsbn(item.volumeInfo.industryIdentifiers),
    publishedDate: item.volumeInfo.publishedDate ?? null,
  }));

  cache.set(url, { value: editions, expiresAt: Date.now() + TTL_MS });
  return editions;
}

/**
 * Search Google Books for all volumes of a series. Returns normalized editions
 * (unfiltered — precision filtering happens in deriveSeriesFromEditions).
 * Paginates up to 3 pages of 40 results each (startIndex 0, 40, 80), stopping
 * early when a page returns no items.
 */
export async function searchSeriesVolumes(
  title: string,
  publisher?: string | null,
  apiKey?: string | null,
): Promise<Edition[]> {
  const terms = [`intitle:${JSON.stringify(title)}`];
  if (publisher) terms.push(`inpublisher:${JSON.stringify(publisher)}`);
  const q = encodeURIComponent(terms.join(' '));
  const key = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const baseQuery = `${BASE}/volumes?q=${q}&langRestrict=en&printType=books&maxResults=40${key}`;

  // Cache keyed on the base query (before startIndex).
  const cached = cache.get(baseQuery);
  if (cached && cached.expiresAt > Date.now()) return cached.value as Edition[];

  const seenIds = new Set<string>();
  const allEditions: Edition[] = [];

  for (let startIndex = 0; startIndex < 120; startIndex += 40) {
    const url = `${baseQuery}&startIndex=${startIndex}`;

    await rateLimit();
    let resp: FetcherResponse;
    try {
      resp = await activeFetcher(url);
    } catch (err) {
      throw new GoogleBooksError(`fetch failed for ${BASE}/volumes`, err);
    }
    if (!resp.ok) throw new GoogleBooksError(`HTTP ${resp.status}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await resp.text());
    } catch (err) {
      throw new GoogleBooksError('response shape invalid', err);
    }
    const validated = VolumesResponse.safeParse(parsed);
    if (!validated.success) throw new GoogleBooksError('response shape invalid', validated.error);

    const items = validated.data.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      allEditions.push({
        id: item.id,
        title: item.volumeInfo.title ?? '',
        publisher: item.volumeInfo.publisher ?? null,
        description: item.volumeInfo.description ?? null,
        pageCount: item.volumeInfo.pageCount ?? null,
        language: item.volumeInfo.language ?? null,
        coverUrl: bestCoverUrl(item.volumeInfo.imageLinks),
        viewability: item.accessInfo?.viewability ?? null,
        isbn: pickIsbn(item.volumeInfo.industryIdentifiers),
        publishedDate: item.volumeInfo.publishedDate ?? null,
      });
    }
  }

  cache.set(baseQuery, { value: allEditions, expiresAt: Date.now() + TTL_MS });
  return allEditions;
}

export type GoogleBooksVolumeLookup = {
  description: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  publishedYear: number | null;
};

/**
 * Fetch a single Google Books volume by its volumeId. Used when a series
 * carries a `gb:`-prefixed openlibraryId — the suffix is the Google Books id.
 */
export async function getVolume(
  volumeId: string,
  apiKey?: string | null,
): Promise<GoogleBooksVolumeLookup | null> {
  const key = apiKey ? `?key=${encodeURIComponent(apiKey)}` : '';
  const url = `${BASE}/volumes/${encodeURIComponent(volumeId)}${key}`;

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as GoogleBooksVolumeLookup | null;
  }

  await rateLimit();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new GoogleBooksError(`fetch failed for ${BASE}/volumes/${volumeId}`, err);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new GoogleBooksError(`HTTP ${resp.status}`);

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new GoogleBooksError('response shape invalid', err);
  }
  const validated = VolumeResponse.safeParse(parsed);
  if (!validated.success) {
    throw new GoogleBooksError('response shape invalid', validated.error);
  }

  const item = validated.data;
  const result: GoogleBooksVolumeLookup = {
    description: item.volumeInfo.description ?? null,
    pageCount: item.volumeInfo.pageCount ?? null,
    coverUrl: bestCoverUrl(item.volumeInfo.imageLinks),
    publishedYear: item.volumeInfo.publishedDate
      ? (parseInt(item.volumeInfo.publishedDate.slice(0, 4), 10) || null)
      : null,
  };

  cache.set(url, { value: result, expiresAt: Date.now() + TTL_MS });
  return result;
}

import {
  SearchResponse,
  WorkRecord,
  AuthorRecord,
  TrendingResponse,
  EditionsResponse,
  EditionByIsbnRecord,
  OLSeriesRecord,
  type WorkRecordT,
} from './schemas';

export type WorkResult = WorkRecordT & { alternateTitles: string[] };

const BASE = 'https://openlibrary.org';
const COVER_BASE = 'https://covers.openlibrary.org/b/id';
const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export class OpenLibraryError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OpenLibraryError';
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

export function __setOpenLibraryFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetOpenLibraryForTests(): void {
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

function extractIsbn13(isbns: string[]): string | null {
  for (const isbn of isbns) {
    if (/^\d{13}$/.test(isbn)) return isbn;
  }
  return isbns[0] ?? null;
}

function extractOlid(workKey: string): string {
  const m = workKey.match(/^\/works\/(.+)$/);
  return m && m[1] ? m[1] : workKey;
}

export function buildCoverUrl(coverId: number, size: 'M' | 'L' = 'L'): string {
  return `${COVER_BASE}/${coverId}-${size}.jpg`;
}

export type OpenLibrarySearchHit = {
  olid: string;
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  isbn: string | null;
  coverUrl: string | null;
};

/** Fast-fail timeout for search requests — prevents a hung OL connection from
 *  stalling the whole discover fan-out for ~10 s. Applied per-fetch call. */
const SEARCH_TIMEOUT_MS = 5_000;

async function fetchOnce(url: string, timeoutMs?: number): Promise<FetcherResponse> {
  await rateLimit();
  const controller = new AbortController();
  const timer = timeoutMs != null ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await activeFetcher(url, { signal: controller.signal });
  } catch (err) {
    throw new OpenLibraryError(`fetch failed for ${url}`, err);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

/**
 * GET + parse an OpenLibrary JSON document.
 *
 * `retries` (default 0) re-attempts on a TRANSIENT failure only — a network
 * error/abort, or a 5xx/429 from OpenLibrary's host (archive.org is frequently
 * overloaded and 503s datacenter IPs). Latency-sensitive callers (the discover
 * search fan-out) keep the default 0 so a slow provider can't stall them; the
 * low-traffic metadata/collection calls opt into a couple of retries so they
 * ride through archive.org's flaky windows. A 404 returns null; a 4xx (other
 * than 429) is not retried.
 */
async function fetchJson(url: string, timeoutMs?: number, retries = 0): Promise<unknown> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let resp: FetcherResponse | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Linear backoff (250ms, 500ms, …) — short; the rate limiter spaces calls too.
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
    try {
      const r = await fetchOnce(url, timeoutMs);
      // Retry transient upstream failures (overload / rate-limit); fall through
      // on success and on non-transient statuses (handled below).
      if ((r.status >= 500 || r.status === 429) && attempt < retries) {
        lastErr = new OpenLibraryError(`HTTP ${r.status} for ${url}`);
        continue;
      }
      resp = r;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) throw err;
    }
  }
  if (resp === null) throw lastErr ?? new OpenLibraryError(`fetch failed for ${url}`);

  if (resp.status === 404) return null;
  if (!resp.ok) throw new OpenLibraryError(`HTTP ${resp.status} for ${url}`);

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new OpenLibraryError('response shape invalid', err);
  }
  cache.set(url, { value: parsed, expiresAt: Date.now() + TTL_MS });
  return parsed;
}

export async function searchBooks(q: string): Promise<OpenLibrarySearchHit[]> {
  const params = new URLSearchParams({
    q,
    fields: 'key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,subject',
    limit: '20',
  });
  const url = `${BASE}/search.json?${params.toString()}`;
  const raw = await fetchJson(url, SEARCH_TIMEOUT_MS);
  if (raw === null) return [];

  const parsed = SearchResponse.safeParse(raw);
  if (!parsed.success) throw new OpenLibraryError('response shape invalid', parsed.error);

  return parsed.data.docs.map((d) => ({
    olid: extractOlid(d.key),
    title: d.title,
    author: d.author_name?.[0] ?? null,
    firstPublishYear: d.first_publish_year ?? null,
    isbn: d.isbn ? extractIsbn13(d.isbn) : null,
    coverUrl: d.cover_i !== undefined ? buildCoverUrl(d.cover_i) : null,
  }));
}

/**
 * Trending works from Open Library's /trending/{period} endpoint.
 *
 * The endpoint does not expose a reliable offset/page cursor for the works
 * array, so to support the "See all" paginated view we fetch a single larger
 * page (`offset + limit` items) and slice locally by `offset`. Past the data
 * Open Library returns for the period, the slice is empty — the caller's
 * hasMore computation (fewer than `limit` returned) then reports no more pages.
 */
export async function trendingBooks(
  period: 'daily' | 'weekly' = 'daily',
  limit = 18,
  offset = 0,
): Promise<OpenLibrarySearchHit[]> {
  const url = `${BASE}/trending/${period}.json?limit=${offset + limit}`;
  const raw = await fetchJson(url);
  if (raw === null) return [];

  const parsed = TrendingResponse.safeParse(raw);
  if (!parsed.success) throw new OpenLibraryError('response shape invalid', parsed.error);

  return parsed.data.works.slice(offset, offset + limit).map((w) => ({
    olid: extractOlid(w.key),
    title: w.title,
    author: w.author_name?.[0] ?? null,
    firstPublishYear: w.first_publish_year ?? null,
    isbn: null,
    coverUrl: w.cover_i !== undefined ? buildCoverUrl(w.cover_i) : null,
  }));
}

export async function getWork(olid: string, retries = 0): Promise<WorkResult | null> {
  const url = `${BASE}/works/${olid}.json`;
  // `retries` lets the low-traffic metadata/collection callers ride through
  // archive.org's frequent 503s; the discover path keeps the default 0.
  const raw = await fetchJson(url, undefined, retries);
  if (raw === null) return null;

  const parsed = WorkRecord.safeParse(raw);
  if (!parsed.success) throw new OpenLibraryError('response shape invalid', parsed.error);
  return { ...parsed.data, alternateTitles: parsed.data.alternate_titles ?? [] };
}

export type WorkEdition = { isbn: string | null; pages: number | null };

/**
 * Resolve an edition's ISBN + page count for a work by inspecting its editions.
 * Works carry no ISBN/page count of their own — editions do — so series stored
 * by OLID (e.g. ebooks added from Discover) need this hop. The page count comes
 * straight from OpenLibrary (`number_of_pages`), which is more reliable than
 * Google Books for niche/KDP ISBNs that Google doesn't paginate.
 *
 * ISBN: first ISBN-13 across editions, else first ISBN-10, else null. Pages:
 * `number_of_pages` of the chosen ISBN edition when present, else the first
 * `number_of_pages` seen across any edition. Uses the injectable fetcher + the
 * shared cache/rate limiter like the other endpoints.
 */
export async function getWorkEdition(olid: string): Promise<WorkEdition> {
  const url = `${BASE}/works/${olid}/editions.json`;
  const raw = await fetchJson(url);
  if (raw === null) return { isbn: null, pages: null };

  const parsed = EditionsResponse.safeParse(raw);
  if (!parsed.success) throw new OpenLibraryError('response shape invalid', parsed.error);

  // Scan ALL editions (don't early-return): the first ISBN-bearing edition often
  // lacks number_of_pages while a later one has it (e.g. a KDP English edition
  // with no page count alongside paginated translations).
  let isbn13: string | null = null;
  let isbn13Pages: number | null = null;
  let isbn10: string | null = null;
  let isbn10Pages: number | null = null;
  let anyPages: number | null = null;
  for (const entry of parsed.data.entries) {
    const pages = entry.number_of_pages ?? null;
    if (anyPages === null && pages !== null) anyPages = pages;
    if (isbn13 === null && entry.isbn_13?.[0]) {
      isbn13 = entry.isbn_13[0];
      isbn13Pages = pages;
    } else if (isbn10 === null && entry.isbn_10?.[0]) {
      isbn10 = entry.isbn_10[0];
      isbn10Pages = pages;
    }
  }
  const isbn = isbn13 ?? isbn10;
  const pages = (isbn13 ? isbn13Pages : isbn10Pages) ?? anyPages ?? null;
  return { isbn, pages };
}

export async function getAuthorName(authorKey: string): Promise<string | null> {
  const url = `${BASE}${authorKey}.json`;
  const raw = await fetchJson(url);
  if (raw === null) return null;

  const parsed = AuthorRecord.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data.name;
}

const COVER_ISBN_BASE = 'https://covers.openlibrary.org/b/isbn';

/**
 * Resolve an Open Library cover URL for an ISBN, or null when OL has no cover.
 * Uses `?default=false` so OL returns 404 (not a blank placeholder) when absent.
 * Returns the plain -L.jpg URL (no query) for storage/proxying.
 */
export async function coverUrlByIsbn(isbn: string): Promise<string | null> {
  const normalized = isbn.replace(/[^0-9Xx]/g, '');
  const probeUrl = `${COVER_ISBN_BASE}/${normalized}-L.jpg?default=false`;
  try {
    await rateLimit();
    const resp = await activeFetcher(probeUrl);
    if (!resp.ok) return null;
    return `${COVER_ISBN_BASE}/${normalized}-L.jpg`;
  } catch {
    return null;
  }
}

export type OLEditionByIsbn = {
  publishDate: string | null;
  workKey: string | null;
};

/**
 * Fetch an OpenLibrary edition by ISBN via `/isbn/<isbn>.json`.
 * Returns the edition's publish_date and the work key (if present).
 * Returns null on 404. Throws OpenLibraryError on other non-2xx responses.
 */
export async function getEditionByIsbn(isbn: string): Promise<OLEditionByIsbn | null> {
  const url = `${BASE}/isbn/${encodeURIComponent(isbn)}.json`;
  // Collection/metadata path (not the latency-sensitive discover fan-out): retry
  // through archive.org's frequent 503s.
  const raw = await fetchJson(url, SEARCH_TIMEOUT_MS, 2);
  if (raw === null) return null;

  const parsed = EditionByIsbnRecord.safeParse(raw);
  if (!parsed.success) throw new OpenLibraryError('response shape invalid', parsed.error);

  return {
    publishDate: parsed.data.publish_date ?? null,
    workKey: parsed.data.works?.[0]?.key ?? null,
  };
}

export type OLSeriesInfo = {
  name: string;
};

/**
 * Fetch an OpenLibrary series by key path (e.g. `/series/OL326781L`).
 * Returns `{ name }` when the series has a name or title, or null.
 * Best-effort: swallows network errors and returns null.
 */
export async function getOLSeries(seriesKey: string): Promise<OLSeriesInfo | null> {
  // seriesKey is like "/series/OL326781L" — strip the leading slash and .json suffix
  const path = seriesKey.replace(/^\//, '').replace(/\.json$/, '');
  const url = `${BASE}/${path}.json`;
  try {
    // Collection path — retry through archive.org's frequent 503s.
    const raw = await fetchJson(url, SEARCH_TIMEOUT_MS, 2);
    if (raw === null) return null;

    const parsed = OLSeriesRecord.safeParse(raw);
    if (!parsed.success) return null;

    const name = parsed.data.name ?? parsed.data.title ?? null;
    if (!name) return null;
    return { name };
  } catch {
    return null;
  }
}

export type OLSeriesWork = {
  workKey: string;
  title: string;
  coverUrl: string | null;
  firstPublishYear: number | null;
};

/**
 * Enumerate the works that belong to an OpenLibrary series.
 *
 * The `/series/<key>.json` document is sparse and does NOT list its members, so
 * we query the search index's `series_key` facet instead — that reliably returns
 * every catalogued work in the series (e.g. all six Old Kingdom books), even
 * though prose sagas share no common title stem the way manga volumes do.
 *
 * Results are sorted by first-publish year — a stable, sensible reading order
 * for series where each book has a distinct title. Best-effort: returns [] on
 * any network/shape failure (callers treat an empty catalogue as "unknown").
 */
export async function getOLSeriesWorks(seriesKey: string): Promise<OLSeriesWork[]> {
  // seriesKey is like "/series/OL326781L"; the facet wants the bare OLID.
  const olid = seriesKey.replace(/\.json$/, '').replace(/^\/?series\//, '').replace(/^\//, '');
  if (!olid) return [];
  const params = new URLSearchParams({
    q: `series_key:${olid}`,
    fields: 'key,title,cover_i,first_publish_year',
    limit: '50',
  });
  const url = `${BASE}/search.json?${params.toString()}`;
  try {
    const raw = await fetchJson(url, SEARCH_TIMEOUT_MS, 2);
    if (raw === null) return [];
    const parsed = SearchResponse.safeParse(raw);
    if (!parsed.success) return [];
    return parsed.data.docs
      .map((d) => ({
        workKey: d.key,
        title: d.title,
        coverUrl: d.cover_i !== undefined ? buildCoverUrl(d.cover_i) : null,
        firstPublishYear: d.first_publish_year ?? null,
      }))
      .sort((a, b) => (a.firstPublishYear ?? Infinity) - (b.firstPublishYear ?? Infinity));
  } catch {
    return [];
  }
}

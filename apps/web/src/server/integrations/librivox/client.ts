import { LibriVoxFeedResponse, mapLibriVoxBook, type LibriVoxHit } from './schemas';

const BASE = 'https://librivox.org/api/feed/audiobooks';
const TTL_MS = 30 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export class LibriVoxError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LibriVoxError';
  }
}

type FetcherResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};
type Fetcher = (url: string) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': 'bookkeeprr/0.1' } });
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

const cache = new Map<string, { value: unknown; expiresAt: number }>();
let lastFetchAt = 0;

export function __setLibriVoxFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetLibriVoxForTests(): void {
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

async function fetchJson(url: string): Promise<unknown> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await rateLimit();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new LibriVoxError(`fetch failed for ${url}`, err);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new LibriVoxError(`HTTP ${resp.status} for ${url}`);

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new LibriVoxError('response shape invalid', err);
  }
  cache.set(url, { value: parsed, expiresAt: Date.now() + TTL_MS });
  return parsed;
}

/**
 * Recent public-domain audiobooks from the LibriVox feed. No API key needed.
 * The feed has no cover field, but a cover is derived from each book's
 * archive.org identifier (parsed from url_zip_file); `coverUrl` is null only
 * when no identifier can be extracted (the UI then falls back to a tinted
 * cover). Returns [] on 404 or a missing `books` array.
 */
export async function getRecentAudiobooks(limit = 18, offset = 0): Promise<LibriVoxHit[]> {
  const params = new URLSearchParams({ format: 'json', limit: String(limit), offset: String(offset) });
  const url = `${BASE}/?${params.toString()}`;
  const raw = await fetchJson(url);
  if (raw === null) return [];

  const parsed = LibriVoxFeedResponse.safeParse(raw);
  if (!parsed.success) throw new LibriVoxError('response shape invalid', parsed.error);
  return parsed.data.books.map(mapLibriVoxBook);
}

/**
 * Fetches a single LibriVox audiobook by its feed id. The `?id=<id>` feed
 * returns the same `{ books: [...] }` shape as the recent feed — a one-element
 * array (or an empty/absent array for an unknown id). Returns null on 404 or
 * when no book is present, so a missing/unknown id degrades gracefully rather
 * than throwing.
 */
export async function getAudiobookById(librivoxId: string): Promise<LibriVoxHit | null> {
  const params = new URLSearchParams({ id: librivoxId, format: 'json' });
  const url = `${BASE}/?${params.toString()}`;
  const raw = await fetchJson(url);
  if (raw === null) return null;

  const parsed = LibriVoxFeedResponse.safeParse(raw);
  if (!parsed.success) throw new LibriVoxError('response shape invalid', parsed.error);
  const book = parsed.data.books[0];
  return book ? mapLibriVoxBook(book) : null;
}

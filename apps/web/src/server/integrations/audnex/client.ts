import { AudnexBook, AudnexSearchResponse, type AudnexBookT } from './schemas';

const BASE = 'https://api.audnex.us';
const REGION = 'us';
const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export class AudnexError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AudnexError';
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

export function __setAudnexFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetAudnexForTests(): void {
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

function parseYear(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{4})/);
  return m && m[1] ? parseInt(m[1], 10) : null;
}

export type AudnexSearchHit = {
  asin: string;
  title: string;
  author: string | null;
  narrator: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  runtimeMinutes: number | null;
};

function bookToHit(book: AudnexBookT): AudnexSearchHit {
  return {
    asin: book.asin,
    title: book.title,
    author: book.authors?.[0]?.name ?? null,
    narrator: book.narrators?.[0]?.name ?? null,
    releaseYear: parseYear(book.releaseDate),
    coverUrl: book.image ?? null,
    runtimeMinutes: book.runtimeLengthMin ?? null,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  await rateLimit();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new AudnexError(`fetch failed for ${url}`, err);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new AudnexError(`HTTP ${resp.status} for ${url}`);

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new AudnexError('response shape invalid', err);
  }
  cache.set(url, { value: parsed, expiresAt: Date.now() + TTL_MS });
  return parsed;
}

export async function searchAudiobooks(q: string): Promise<AudnexSearchHit[]> {
  const params = new URLSearchParams({ title: q, region: REGION });
  const url = `${BASE}/books?${params.toString()}`;
  const raw = await fetchJson(url);
  if (raw === null) return [];

  const parsed = AudnexSearchResponse.safeParse(raw);
  if (!parsed.success) throw new AudnexError('response shape invalid', parsed.error);
  return parsed.data.map(bookToHit);
}

export async function getAudiobook(asin: string): Promise<AudnexBookT | null> {
  const params = new URLSearchParams({ region: REGION });
  const url = `${BASE}/books/${asin}?${params.toString()}`;
  const raw = await fetchJson(url);
  if (raw === null) return null;

  const parsed = AudnexBook.safeParse(raw);
  if (!parsed.success) throw new AudnexError('response shape invalid', parsed.error);
  return parsed.data;
}

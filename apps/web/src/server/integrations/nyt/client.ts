import { nytApiKeySetting } from '@/server/db/settings/nyt';
import { NytListResponse, mapNytBook, type NytAudioHit } from './schemas';

const BASE = 'https://api.nytimes.com/svc/books/v3';
const AUDIO_LISTS = ['audio-fiction', 'audio-nonfiction'] as const;

// Token bucket — the NYT free tier is rate-limited (a few requests/sec plus a
// daily cap), so stay polite: refill one token per second, burst up to 5.
const REFILL_INTERVAL_MS = 1000;
const BUCKET_SIZE = 5;

let bucket = BUCKET_SIZE;
let lastRefillAt = Date.now();

export class NytError extends Error {
  constructor(
    message: string,
    public status?: number,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NytError';
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

export function __setNytFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetNytForTests(): void {
  activeFetcher = defaultFetcher;
  bucket = BUCKET_SIZE;
  lastRefillAt = Date.now();
}

function refill(): void {
  const now = Date.now();
  const elapsed = now - lastRefillAt;
  if (elapsed >= REFILL_INTERVAL_MS) {
    const tokens = Math.floor(elapsed / REFILL_INTERVAL_MS);
    bucket = Math.min(BUCKET_SIZE, bucket + tokens);
    // Advance by whole intervals consumed so the sub-interval remainder carries
    // forward (setting to `now` would silently drop it and starve the bucket).
    lastRefillAt += tokens * REFILL_INTERVAL_MS;
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

async function requireApiKey(): Promise<string> {
  const key = await nytApiKeySetting.get();
  if (!key) {
    throw new NytError('New York Times API key is not configured');
  }
  return key;
}

/**
 * Fetches and maps a single NYT bestseller list. Throws NytError for any non-OK
 * status, transport failure, or malformed body.
 */
async function fetchList(list: string, apiKey: string): Promise<NytAudioHit[]> {
  await acquire();
  const params = new URLSearchParams({ 'api-key': apiKey });
  const url = `${BASE}/lists/current/${list}.json?${params.toString()}`;

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new NytError(`fetch failed for ${url}`, undefined, err);
  }
  if (!resp.ok) throw new NytError(`HTTP ${resp.status} for ${list}`, resp.status);

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new NytError('response shape invalid', undefined, err);
  }
  const env = NytListResponse.safeParse(parsed);
  if (!env.success) throw new NytError(`response shape invalid: ${env.error.message}`);
  return env.data.results.books.map(mapNytBook);
}

/**
 * Fetches BOTH audio bestseller lists (audio-fiction + audio-nonfiction),
 * merges them, and dedupes by title (case-insensitive, first occurrence wins).
 * Resilient: if one list fails, the other's results are still returned. Throws
 * NytError only when the API key is missing or every list fails.
 */
export async function getAudioBestsellers(): Promise<NytAudioHit[]> {
  const apiKey = await requireApiKey();

  const settled = await Promise.allSettled(
    AUDIO_LISTS.map((list) => fetchList(list, apiKey)),
  );

  const hits: NytAudioHit[] = [];
  const errors: unknown[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      hits.push(...result.value);
    } else {
      errors.push(result.reason);
    }
  }

  // Only surface an error if every list failed; otherwise return what we have.
  if (hits.length === 0 && errors.length === AUDIO_LISTS.length) {
    const first = errors[0];
    if (first instanceof NytError) throw first;
    throw new NytError('all NYT bestseller lists failed', undefined, first);
  }

  const seen = new Set<string>();
  const deduped: NytAudioHit[] = [];
  for (const hit of hits) {
    const key = hit.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(hit);
  }
  return deduped;
}

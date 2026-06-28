import { FilelistSearchResponse, type FilelistItem } from './schemas';
import type { IndexerResult } from '@/server/integrations/indexers/types';

const BASE = 'https://filelist.io';
const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export type FilelistCreds = { username: string; passkey: string };
export type FilelistQuery = { q: string; category: number };

export class FilelistError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FilelistError';
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

const cache = new Map<string, { items: IndexerResult[]; expiresAt: number }>();
let lastFetchAt = 0;

export function __setFilelistFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetFilelistForTests(): void {
  activeFetcher = defaultFetcher;
  cache.clear();
  lastFetchAt = 0;
}

function buildUrl(creds: FilelistCreds, q: FilelistQuery): string {
  const params = new URLSearchParams();
  params.set('username', creds.username);
  params.set('passkey', creds.passkey);
  params.set('action', 'search-torrents');
  params.set('type', 'name');
  params.set('query', q.q);
  params.set('category', String(q.category));
  return `${BASE}/api.php?${params.toString()}`;
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

function itemToResult(item: FilelistItem): IndexerResult {
  return {
    guid: String(item.id),
    title: item.name,
    link: item.download_link,
    sizeBytes: item.size,
    seeders: item.seeders,
    leechers: item.leechers,
    pubDate: new Date(item.upload_date.replace(' ', 'T') + 'Z'),
    infoHash: null,
    category: String(item.category),
  };
}

export async function searchFilelist(
  creds: FilelistCreds,
  query: FilelistQuery,
): Promise<IndexerResult[]> {
  const url = buildUrl(creds, query);
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) return cached.items;

  await rateLimit();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new FilelistError(`fetch failed for ${BASE}/api.php`, err);
  }

  if (!resp.ok) {
    if (resp.status === 403) throw new FilelistError('invalid credentials');
    if (resp.status === 429) throw new FilelistError('rate limited');
    throw new FilelistError(`HTTP ${resp.status}`);
  }

  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new FilelistError('response shape invalid', err);
  }

  const validated = FilelistSearchResponse.safeParse(parsed);
  if (!validated.success) {
    throw new FilelistError('response shape invalid', validated.error);
  }

  const items = validated.data.map(itemToResult);
  cache.set(url, { items, expiresAt: now + TTL_MS });
  return items;
}

import { XMLParser } from 'fast-xml-parser';
import { NyaaRssRoot, parseNyaaSize, extractGuid, type NyaaRssItem } from './schemas';

const DEFAULT_BASE = 'https://nyaa.si';
const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export type NyaaQuery = {
  q: string;
  category?: '3_1' | '3_3';
  sort?: 'seeders' | 'date';
  order?: 'desc' | 'asc';
};

export class NyaaError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NyaaError';
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

const cache = new Map<string, { items: NyaaRssItem[]; expiresAt: number }>();
let lastFetchAt = 0;

export function __setNyaaFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetNyaaForTests(): void {
  activeFetcher = defaultFetcher;
  cache.clear();
  lastFetchAt = 0;
}

function buildUrl(q: NyaaQuery, base: string): string {
  const params = new URLSearchParams();
  params.set('page', 'rss');
  params.set('q', q.q);
  params.set('c', q.category ?? '3_1');
  params.set('s', q.sort ?? 'seeders');
  params.set('o', q.order ?? 'desc');
  return `${base.replace(/\/$/, '')}/?${params.toString()}`;
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

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

export async function searchNyaa(q: NyaaQuery, baseUrl?: string): Promise<NyaaRssItem[]> {
  const url = buildUrl(q, baseUrl ?? DEFAULT_BASE);
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) return cached.items;

  await rateLimit();
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new NyaaError(`fetch failed for ${url}`, err);
  }
  if (!resp.ok) {
    throw new NyaaError(`HTTP ${resp.status} for ${url}`);
  }
  const xml = await resp.text();

  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (err) {
    throw new NyaaError(`XML parse failed`, err);
  }

  const validated = NyaaRssRoot.safeParse(parsed);
  if (!validated.success) {
    throw new NyaaError(`RSS shape invalid: ${validated.error.message}`);
  }

  const rawItems = validated.data.rss.channel.item;
  const itemArray = rawItems === undefined ? [] : Array.isArray(rawItems) ? rawItems : [rawItems];

  const items: NyaaRssItem[] = itemArray.map((it) => ({
    guid: extractGuid(typeof it.guid === 'string' ? it.guid : ''),
    title: it.title,
    link: it.link,
    pubDate: new Date(it.pubDate),
    seeders: it.seeders,
    leechers: it.leechers,
    downloads: it.downloads,
    sizeBytes: parseNyaaSize(it.size),
    infoHash: it.infoHash,
    categoryId: it.categoryId,
    trusted: /^yes$/i.test(it.trusted),
    remake: /^yes$/i.test(it.remake),
  }));

  cache.set(url, { items, expiresAt: now + TTL_MS });
  return items;
}

import { XMLParser } from 'fast-xml-parser';
import type { IndexerResult } from '@/server/integrations/indexers/types';
import { TorznabSearchRoot, TorznabCapsRoot, type TorznabItemT } from './schemas';

const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export class TorznabError extends Error {
  constructor(
    message: string,
    public readonly code: 'http' | 'auth' | 'parse' = 'http',
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TorznabError';
  }
}

type FetcherResponse = { ok: boolean; status: number; text(): Promise<string> };
type Fetcher = (url: string) => Promise<FetcherResponse>;
const defaultFetcher: Fetcher = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': 'bookkeeprr/0.1' } });
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;
const cache = new Map<string, { value: unknown; expiresAt: number }>();
let lastFetchAt = 0;

export function __setTorznabFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetTorznabForTests(): void {
  activeFetcher = defaultFetcher;
  cache.clear();
  lastFetchAt = 0;
}

async function rateLimit(): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed + Math.random() * JITTER_MS));
  }
  lastFetchAt = Date.now();
}

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });

const AUTH_CODES = new Set(['100', '101', '102']);

async function getXml(url: string): Promise<unknown> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  await rateLimit();
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new TorznabError(`fetch failed`, 'http', err);
  }
  if (resp.status === 401 || resp.status === 403) throw new TorznabError(`auth failed (${resp.status})`, 'auth');
  if (!resp.ok) throw new TorznabError(`HTTP ${resp.status}`, 'http');
  const text = await resp.text();
  let parsed: unknown;
  try {
    parsed = parser.parse(text);
  } catch (err) {
    throw new TorznabError('XML parse failed', 'parse', err);
  }
  // Detect Prowlarr/Jackett <error code="..." description="..."/> envelopes
  // returned with HTTP 200. fast-xml-parser yields { error: { '@_code': '...', '@_description': '...' } }.
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'error' in parsed &&
    parsed.error !== null &&
    typeof parsed.error === 'object'
  ) {
    const err = parsed.error as Record<string, unknown>;
    const code = String(err['@_code'] ?? '');
    const description = String(err['@_description'] ?? '');
    if (AUTH_CODES.has(code)) {
      throw new TorznabError(`torznab auth error ${code}: ${description}`, 'auth');
    }
    throw new TorznabError(`torznab error ${code}: ${description}`, 'http');
  }
  cache.set(url, { value: parsed, expiresAt: Date.now() + TTL_MS });
  return parsed;
}

function buildUrl(base: string, params: URLSearchParams): string {
  const u = new URL(base);
  u.search = '';
  for (const [k, v] of params) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

function attrMap(item: TorznabItemT): Map<string, string> {
  const m = new Map<string, string>();
  const raw = item.attr;
  const arr = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  for (const a of arr) if (a['@_value'] !== undefined) m.set(a['@_name'], a['@_value']);
  return m;
}

function num(v: string | undefined): number {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type TorznabSearchInput = { url: string; apiKey: string; q: string; cat: string };

export async function searchTorznab(input: TorznabSearchInput): Promise<IndexerResult[]> {
  const params = new URLSearchParams({ t: 'search', apikey: input.apiKey, q: input.q, limit: '100' });
  if (input.cat) params.set('cat', input.cat);
  const url = buildUrl(input.url, params);
  const validated = TorznabSearchRoot.safeParse(await getXml(url));
  if (!validated.success) throw new TorznabError(`search shape invalid: ${validated.error.message}`, 'parse');

  const channel = validated.data.rss.channel;
  const raw = typeof channel === 'string' ? undefined : channel.item;
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  return items.map((it): IndexerResult => {
    const a = attrMap(it);
    const guid = typeof it.guid === 'string' ? it.guid : (it.guid?.['#text'] ?? it.title);
    const magnet = a.get('magneturl');
    const enclosureUrl = it.enclosure?.['@_url'];
    const link = magnet ?? enclosureUrl ?? it.link ?? '';
    const sizeBytes = a.has('size') ? num(a.get('size')) : num(it.enclosure?.['@_length']);
    const seeders = num(a.get('seeders'));
    const peers = a.has('peers') ? num(a.get('peers')) : undefined;
    const leechers = peers !== undefined ? Math.max(0, peers - seeders) : num(a.get('leechers'));
    return {
      guid,
      title: it.title,
      link,
      sizeBytes,
      seeders,
      leechers,
      pubDate: it.pubDate ? new Date(it.pubDate) : new Date(0),
      infoHash: a.get('infohash') ?? null,
      category: a.get('category') ?? '',
    };
  });
}

export type TorznabCaps = { categories: { id: string; name: string; subcats: { id: string; name: string }[] }[] };

export async function fetchTorznabCaps(input: { url: string; apiKey: string }): Promise<TorznabCaps> {
  const params = new URLSearchParams({ t: 'caps', apikey: input.apiKey });
  const url = buildUrl(input.url, params);
  const validated = TorznabCapsRoot.safeParse(await getXml(url));
  if (!validated.success) throw new TorznabError(`caps shape invalid: ${validated.error.message}`, 'parse');
  const rawCats = validated.data.caps.categories?.category;
  const cats = rawCats === undefined ? [] : Array.isArray(rawCats) ? rawCats : [rawCats];
  return {
    categories: cats.map((c) => {
      const rawSub = c.subcat;
      const subs = rawSub === undefined ? [] : Array.isArray(rawSub) ? rawSub : [rawSub];
      return {
        id: String(c['@_id']),
        name: c['@_name'],
        subcats: subs.map((s) => ({ id: String(s['@_id']), name: s['@_name'] })),
      };
    }),
  };
}

import { ProxyAgent } from 'undici';
import { MamSearchResponse, type MamItem } from './schemas';
import type { IndexerResult } from '@/server/integrations/indexers/types';

const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;
const PERPAGE = 50;

export type MamCreds = { mamId: string; proxyUrl: string; searchIn: string[] };
export type MamQuery = { q: string; mainCat: number };

export class MamError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MamError';
  }
}

type FetcherResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
};
export type MamFetchInit = {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  proxyUrl: string;
};
type Fetcher = (url: string, init: MamFetchInit) => Promise<FetcherResponse>;

// One ProxyAgent per proxy URL (keeps the connection pool warm; avoids leaking
// an agent per request).
const proxyAgents = new Map<string, ProxyAgent>();
function agentFor(proxyUrl: string): ProxyAgent | undefined {
  if (!proxyUrl) return undefined;
  let a = proxyAgents.get(proxyUrl);
  if (!a) {
    a = new ProxyAgent(proxyUrl);
    proxyAgents.set(proxyUrl, a);
  }
  return a;
}

const defaultFetcher: Fetcher = async (url, init) => {
  const r = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    // `dispatcher` is an undici (Node) extension to fetch — route egress through gluetun.
    dispatcher: agentFor(init.proxyUrl),
  } as RequestInit & { dispatcher?: unknown });
  return {
    ok: r.ok,
    status: r.status,
    text: () => r.text(),
    bytes: async () => new Uint8Array(await r.arrayBuffer()),
  };
};
let activeFetcher: Fetcher = defaultFetcher;

const cache = new Map<string, { items: IndexerResult[]; expiresAt: number }>();
let lastFetchAt = 0;

export function __setMamFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetMamForTests(): void {
  activeFetcher = defaultFetcher;
  cache.clear();
  lastFetchAt = 0;
}

function stripSlash(s: string): string {
  return s.replace(/\/$/, '');
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

function itemToResult(item: MamItem, baseUrl: string): IndexerResult {
  const title = item.title ?? item.name ?? String(item.id);
  return {
    guid: String(item.id),
    title,
    link: `${stripSlash(baseUrl)}/tor/download.php?tid=${item.id}`,
    sizeBytes: item.size,
    seeders: item.seeders ?? 0,
    leechers: item.leechers ?? 0,
    pubDate: item.added ? new Date(item.added.replace(' ', 'T') + 'Z') : new Date(0),
    infoHash: null,
    category: String(item.main_cat ?? ''),
    freeleech: Boolean(item.free) || Boolean(item.fl_vip),
    vip: Boolean(item.vip) || Boolean(item.fl_vip),
  };
}

export async function downloadMamTorrent(
  creds: { mamId: string; proxyUrl: string },
  tid: string,
  baseUrl: string,
): Promise<Uint8Array> {
  const url = `${stripSlash(baseUrl)}/tor/download.php?tid=${encodeURIComponent(tid)}`;
  await rateLimit();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, {
      method: 'GET',
      headers: { 'user-agent': 'bookkeeprr/0.1', cookie: `mam_id=${creds.mamId}` },
      proxyUrl: creds.proxyUrl,
    });
  } catch (err) {
    throw new MamError(`download failed for ${url}`, err);
  }

  if (!resp.ok) {
    if (resp.status === 403) throw new MamError('MAM session invalid or expired');
    throw new MamError(`download HTTP ${resp.status}`);
  }

  const bytes = await resp.bytes();
  // A bencoded .torrent always starts with 'd' (0x64). Anything else is an
  // error/login page — a session/IP/proxy problem, not a torrent.
  if (bytes.length === 0 || bytes[0] !== 0x64) {
    throw new MamError('MAM did not return a .torrent (session/IP/proxy problem)');
  }
  return bytes;
}

export async function searchMam(
  creds: MamCreds,
  query: MamQuery,
  baseUrl: string,
): Promise<IndexerResult[]> {
  const url = `${stripSlash(baseUrl)}/tor/js/loadSearchJSONbasic.php`;
  const payload = JSON.stringify({
    tor: {
      text: query.q,
      srchIn: creds.searchIn.length > 0 ? creds.searchIn : ['title'],
      main_cat: [query.mainCat],
      searchType: 'all',
      sortType: 'seedersDesc',
      startNumber: '0',
    },
    perpage: PERPAGE,
    dlLink: '',
  });

  const cacheKey = `${url}|${creds.mamId}|${payload}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.items;

  await rateLimit();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'bookkeeprr/0.1',
        cookie: `mam_id=${creds.mamId}`,
      },
      body: payload,
      proxyUrl: creds.proxyUrl,
    });
  } catch (err) {
    throw new MamError(`fetch failed for ${url}`, err);
  }

  if (!resp.ok) {
    if (resp.status === 403) throw new MamError('MAM session invalid or expired');
    if (resp.status === 429) throw new MamError('rate limited');
    throw new MamError(`HTTP ${resp.status}`);
  }

  const body = await resp.text();
  // A login page (HTML) instead of JSON means the session/IP is rejected.
  if (body.trimStart().startsWith('<')) {
    throw new MamError('MAM session invalid (received HTML, not JSON)');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new MamError('response shape invalid', err);
  }
  if (parsed && typeof parsed === 'object' && 'error' in parsed && !('data' in parsed)) {
    throw new MamError(`MAM error: ${String((parsed as { error: unknown }).error)}`);
  }

  const validated = MamSearchResponse.safeParse(parsed);
  if (!validated.success) throw new MamError('response shape invalid', validated.error);

  const items = validated.data.data.map((it) => itemToResult(it, baseUrl));
  cache.set(cacheKey, { items, expiresAt: now + TTL_MS });
  return items;
}

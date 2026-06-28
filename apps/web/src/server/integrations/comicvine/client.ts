import type { z } from 'zod';
import {
  ComicVineEnvelope,
  VolumeResultsArray,
  IssueResultsArray,
  mapVolume,
  type ComicSearchHit,
  type ComicIssue,
} from './schemas';

const BASE = 'https://comicvine.gamespot.com/api';
const USER_AGENT = 'bookkeeprr/0.1';
const PAGE_SIZE = 100;
const SEARCH_LIMIT = 20;
const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;
const SENTINEL_BASE = 100000;

export class ComicVineError extends Error {
  constructor(
    message: string,
    public status?: number,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ComicVineError';
  }
}

type FetcherResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
};
type Fetcher = (url: string) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { ok: r.ok, status: r.status, headers, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

const cache = new Map<string, { value: unknown; expiresAt: number }>();
let lastFetchAt = 0;

export function __setComicVineFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetComicVineForTests(): void {
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

async function callComicVine<T>(url: string, parse: (results: unknown) => T): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  await rateLimit();
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new ComicVineError('fetch failed', undefined, err);
  }
  if (!resp.ok) {
    throw new ComicVineError(`HTTP ${resp.status}`, resp.status);
  }
  const text = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ComicVineError('non-JSON response', undefined, err);
  }
  const env = ComicVineEnvelope.safeParse(parsed);
  if (!env.success) {
    throw new ComicVineError(`envelope invalid: ${env.error.message}`);
  }
  if (env.data.status_code !== 1) {
    throw new ComicVineError(env.data.error, env.data.status_code);
  }
  const value = parse(env.data.results);
  cache.set(url, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

function buildUrl(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  search.set('format', 'json');
  return `${BASE}${path}?${search.toString()}`;
}

export async function searchVolumes(apiKey: string, query: string): Promise<ComicSearchHit[]> {
  const url = buildUrl('/volumes/', {
    api_key: apiKey,
    filter: `name:${query}`,
    field_list: 'id,name,publisher,start_year,count_of_issues,image,description',
    limit: String(SEARCH_LIMIT),
  });
  return callComicVine(url, (raw) => {
    const v = VolumeResultsArray.safeParse(raw);
    if (!v.success) throw new ComicVineError(`results shape invalid: ${v.error.message}`);
    return v.data.map(mapVolume);
  });
}

export async function recentVolumes(
  apiKey: string,
  limit = 18,
  offset = 0,
): Promise<ComicSearchHit[]> {
  const url = buildUrl('/volumes/', {
    api_key: apiKey,
    sort: 'date_added:desc',
    field_list: 'id,name,publisher,start_year,count_of_issues,image,description',
    limit: String(limit),
    offset: String(offset),
  });
  return callComicVine(url, (raw) => {
    const v = VolumeResultsArray.safeParse(raw);
    if (!v.success) throw new ComicVineError(`results shape invalid: ${v.error.message}`);
    return v.data.map(mapVolume);
  });
}

export async function getVolume(apiKey: string, comicvineId: number): Promise<ComicSearchHit> {
  const url = buildUrl(`/volume/4050-${comicvineId}/`, {
    api_key: apiKey,
    field_list: 'id,name,publisher,start_year,count_of_issues,image,description',
  });
  return callComicVine(url, (raw) => {
    const v = VolumeResultsArray.element.safeParse(raw);
    if (!v.success) throw new ComicVineError(`volume shape invalid: ${v.error.message}`);
    return mapVolume(v.data);
  });
}

export async function testApiKey(apiKey: string): Promise<void> {
  // Hit /types/ — small, side-effect-free, good for verifying key + connectivity.
  const url = buildUrl('/types/', { api_key: apiKey, limit: '1' });
  // Don't cache this; user may retry after fixing the key.
  cache.delete(url);
  await callComicVine(url, () => undefined);
}

async function listIssuesPage(
  apiKey: string,
  comicvineId: number,
  offset: number,
  limit: number,
): Promise<{ raw: z.infer<typeof IssueResultsArray>; total: number }> {
  const url = buildUrl('/issues/', {
    api_key: apiKey,
    filter: `volume:${comicvineId}`,
    field_list: 'id,issue_number,name,cover_date,image',
    sort: 'issue_number:asc',
    offset: String(offset),
    limit: String(limit),
  });
  // Bypass the cache wrapper here because we want the total count too.
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as { raw: z.infer<typeof IssueResultsArray>; total: number };
  }

  await rateLimit();
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new ComicVineError('fetch failed', undefined, err);
  }
  if (!resp.ok) throw new ComicVineError(`HTTP ${resp.status}`, resp.status);
  const text = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ComicVineError('non-JSON response', undefined, err);
  }
  const env = ComicVineEnvelope.safeParse(parsed);
  if (!env.success) throw new ComicVineError(`envelope invalid: ${env.error.message}`);
  if (env.data.status_code !== 1) throw new ComicVineError(env.data.error, env.data.status_code);

  const r = IssueResultsArray.safeParse(env.data.results);
  if (!r.success) throw new ComicVineError(`issue shape invalid: ${r.error.message}`);

  const value = { raw: r.data, total: env.data.number_of_total_results ?? r.data.length };
  cache.set(url, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

export async function listIssues(apiKey: string, comicvineId: number): Promise<ComicIssue[]> {
  // Fetch all pages
  const all: z.infer<typeof IssueResultsArray>[number][] = [];
  let offset = 0;
  while (true) {
    const page = await listIssuesPage(apiKey, comicvineId, offset, PAGE_SIZE);
    all.push(...page.raw);
    offset += page.raw.length;
    if (offset >= page.total || page.raw.length === 0) break;
  }
  // Apply numerics-first sort + sentinel assignment
  const classified = all.map((iss) => {
    const f = parseFloat(iss.issue_number);
    return { iss, numeric: Number.isFinite(f) ? f : null };
  });
  classified.sort((a, b) => {
    if (a.numeric !== null && b.numeric !== null) return a.numeric - b.numeric;
    if (a.numeric !== null) return -1;
    if (b.numeric !== null) return 1;
    return 0;
  });
  let nonNumericIndex = 0;
  return classified.map(({ iss, numeric }) => ({
    comicvineIssueId: iss.id,
    issueNumber: iss.issue_number,
    issueNumberSort: numeric !== null ? numeric : SENTINEL_BASE + nonNumericIndex++,
    name: iss.name ?? null,
    coverDate: iss.cover_date ?? null,
    coverUrl:
      iss.image?.original_url ?? iss.image?.medium_url ?? iss.image?.small_url ?? null,
  }));
}

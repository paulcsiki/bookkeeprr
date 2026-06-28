import { malClientIdSetting } from '@/server/db/settings/mal';
import {
  MalSearchResponse,
  MalMangaDetailResponse,
  mapMalManga,
  mapMalMangaDetail,
  type MalMangaHit,
  type MalMangaDetail,
} from './schemas';

const BASE = 'https://api.myanimelist.net/v2';
const FIELDS =
  'id,title,alternative_titles,main_picture,synopsis,num_volumes,num_chapters,status,media_type,start_date';

// Token bucket — MAL is sensitive to bursts, so stay polite: refill one token
// per second, burst up to 5.
const REFILL_INTERVAL_MS = 1000;
const BUCKET_SIZE = 5;

let bucket = BUCKET_SIZE;
let lastRefillAt = Date.now();

export class MalError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MalError';
  }
}

type FetcherResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};
type Fetcher = (url: string, headers: Record<string, string>) => Promise<FetcherResponse>;

const defaultFetcher: Fetcher = async (url, headers) => {
  const r = await fetch(url, { headers });
  return { ok: r.ok, status: r.status, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

export function __setMalFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetMalForTests(): void {
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

async function requireClientId(): Promise<string> {
  const clientId = await malClientIdSetting.get();
  if (!clientId) {
    throw new MalError('MyAnimeList client ID is not configured');
  }
  return clientId;
}

/**
 * Fetches and JSON-parses a MAL endpoint. Returns null on 404; throws MalError
 * for any other non-OK status, transport failure, or malformed body.
 */
async function fetchJson(url: string, clientId: string): Promise<unknown> {
  await acquire();

  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url, { 'X-MAL-CLIENT-ID': clientId });
  } catch (err) {
    throw new MalError(`fetch failed for ${url}`, err);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) throw new MalError(`HTTP ${resp.status} for ${url}`);

  const body = await resp.text();
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new MalError('response shape invalid', err);
  }
}

export async function searchMangaMal(q: string): Promise<MalMangaHit[]> {
  const clientId = await requireClientId();
  const params = new URLSearchParams({ q, limit: '20', fields: FIELDS });
  const url = `${BASE}/manga?${params.toString()}`;

  const raw = await fetchJson(url, clientId);
  if (raw === null) return [];

  const parsed = MalSearchResponse.safeParse(raw);
  if (!parsed.success) throw new MalError('response shape invalid', parsed.error);

  return parsed.data.data.map((entry) => mapMalManga(entry.node));
}

/**
 * Fetches a MAL manga ranking row (default: by overall popularity) and maps each
 * node to a MalMangaHit. The ranking envelope is `{ data: [{ node, ranking }], paging }`;
 * `MalSearchResponse` is non-strict so the extra `ranking` key parses fine and we
 * reuse it. Behaves like searchMangaMal: requires a client id, returns [] on 404.
 */
export async function getMangaRankingMal(
  rankingType = 'bypopularity',
  limit = 18,
  offset = 0,
): Promise<MalMangaHit[]> {
  const clientId = await requireClientId();
  const params = new URLSearchParams({
    ranking_type: rankingType,
    limit: String(limit),
    offset: String(offset),
    fields: FIELDS,
  });
  const url = `${BASE}/manga/ranking?${params.toString()}`;

  const raw = await fetchJson(url, clientId);
  if (raw === null) return [];

  const parsed = MalSearchResponse.safeParse(raw);
  if (!parsed.success) throw new MalError('response shape invalid', parsed.error);

  return parsed.data.data.map((entry) => mapMalManga(entry.node));
}

export async function getMangaMal(malId: number): Promise<MalMangaDetail | null> {
  const clientId = await requireClientId();
  const params = new URLSearchParams({ fields: FIELDS });
  const url = `${BASE}/manga/${malId}?${params.toString()}`;

  const raw = await fetchJson(url, clientId);
  if (raw === null) return null;

  const parsed = MalMangaDetailResponse.safeParse(raw);
  if (!parsed.success) throw new MalError('response shape invalid', parsed.error);

  return mapMalMangaDetail(parsed.data);
}

import type { QbtConnection } from '@/server/db/settings/qbt';
import {
  QbtTorrentsListSchema,
  QbtFilesListSchema,
  type QbtTorrent,
  type QbtFile,
} from './schemas';

export class QbittorrentError extends Error {
  constructor(
    message: string,
    public status?: number,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'QbittorrentError';
  }
}

type FetcherResponse = {
  ok: boolean;
  status: number;
  headers: Record<string, string | undefined>;
  text(): Promise<string>;
};
type FetcherInit = { method?: string; headers?: Record<string, string>; body?: BodyInit };
type Fetcher = (url: string, init?: FetcherInit) => Promise<FetcherResponse>;

// qBittorrent lives on the user's network and is usually local + fast. Cap each
// request so an unreachable / hung qBit (wrong host, firewall, dead container)
// can't block the caller forever — e.g. GET /api/downloads merges live torrent
// stats and must never hang the Activity view waiting on qBit.
const QBT_REQUEST_TIMEOUT_MS = 15_000;

const defaultFetcher: Fetcher = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QBT_REQUEST_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new QbittorrentError(`qBittorrent request timed out after ${QBT_REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { ok: r.ok, status: r.status, headers, text: () => r.text() };
};
let activeFetcher: Fetcher = defaultFetcher;

let sessionCookie: string | null = null;

export function __setQbtFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetQbtForTests(): void {
  activeFetcher = defaultFetcher;
  sessionCookie = null;
}

function baseUrl(c: QbtConnection): string {
  const proto = c.useHttps ? 'https' : 'http';
  return `${proto}://${c.host}:${c.port}`;
}

async function login(c: QbtConnection): Promise<void> {
  const body = new URLSearchParams({ username: c.username, password: c.password });
  const res = await activeFetcher(`${baseUrl(c)}/api/v2/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new QbittorrentError(`auth/login HTTP ${res.status}`, res.status);
  // Success is version-dependent: qBittorrent 4.x replies 200 with body
  // "Ok." (bad creds → 200 "Fails."), while 5.x replies 204 with an empty
  // body. Treat a 204, or a 200 whose body is "Ok.", as success.
  const text = (await res.text()).trim();
  if (res.status !== 204 && text !== 'Ok.') throw new QbittorrentError(`auth failed: ${text}`);
  const cookie = res.headers['set-cookie'];
  if (!cookie) throw new QbittorrentError('auth/login returned no Set-Cookie');
  // 4.x names the cookie `SID`; 5.x uses a port-suffixed `QBT_SID_<port>`.
  const match = cookie.match(/(?:QBT_)?SID(?:_\d+)?=[^;]+/);
  if (!match) throw new QbittorrentError(`auth/login returned malformed cookie: ${cookie}`);
  sessionCookie = match[0];
}

async function authedCall(
  c: QbtConnection,
  url: string,
  init?: FetcherInit,
): Promise<FetcherResponse> {
  if (!sessionCookie) await login(c);
  const headers = { ...(init?.headers ?? {}), cookie: sessionCookie ?? '' };
  let res = await activeFetcher(url, { ...init, headers });
  if (res.status === 401 || res.status === 403) {
    sessionCookie = null;
    await login(c);
    const refreshed = { ...(init?.headers ?? {}), cookie: sessionCookie ?? '' };
    res = await activeFetcher(url, { ...init, headers: refreshed });
    if (res.status === 401 || res.status === 403) {
      throw new QbittorrentError(`auth refresh failed (still ${res.status})`, res.status);
    }
  }
  return res;
}

export async function testConnection(c: QbtConnection): Promise<void> {
  sessionCookie = null;
  await login(c);
  const res = await authedCall(c, `${baseUrl(c)}/api/v2/torrents/info?category=bookkeeprr-manga`);
  if (!res.ok) throw new QbittorrentError(`torrents/info HTTP ${res.status}`, res.status);
}

export type AddTorrentInput = {
  /** Magnet URI or http(s) URL. Used when `torrentFile` is not provided. */
  url?: string;
  /** Raw .torrent bytes — preferred when we already have them (the client then
   *  doesn't have to re-fetch a private tracker's download URL). */
  torrentFile?: Uint8Array;
  category: string;
  tags: string[];
  savePath: string;
};

export async function addTorrent(c: QbtConnection, input: AddTorrentInput): Promise<void> {
  const form = new FormData();
  if (input.torrentFile) {
    // Upload the .torrent file directly (multipart `torrents` field).
    form.set(
      'torrents',
      new Blob([input.torrentFile as BlobPart], { type: 'application/x-bittorrent' }),
      'download.torrent',
    );
  } else if (input.url) {
    form.set('urls', input.url);
  } else {
    throw new QbittorrentError('addTorrent: neither url nor torrentFile provided');
  }
  form.set('category', input.category);
  if (input.tags.length > 0) form.set('tags', input.tags.join(','));
  form.set('savepath', input.savePath);
  const res = await authedCall(c, `${baseUrl(c)}/api/v2/torrents/add`, {
    method: 'POST',
    body: form,
  });
  // 409 = the torrent is already in qBittorrent. That's success for our purposes
  // (re-grab / orphan re-link): the caller confirms it by info-hash afterwards.
  if (res.status === 409) return;
  if (!res.ok) throw new QbittorrentError(`torrents/add HTTP ${res.status}`, res.status);
  assertAddAccepted((await res.text()).trim());
}

/**
 * Validates a `torrents/add` response across qBittorrent versions.
 *
 *  - qBittorrent ≤ 4.x replies with the plain text `Ok.` (or `Fails.`).
 *  - qBittorrent 5.x replies with JSON, e.g.
 *    `{"added_torrent_ids":[...],"success_count":N,"pending_count":N,"failure_count":N}`.
 *    A torrent is accepted when it lands in `success_count`, `pending_count`
 *    (e.g. a magnet still fetching metadata), or `added_torrent_ids` — only an
 *    all-zero / failure-only result is a real failure. Treating `pending_count`
 *    as failure is the bug this fixes: the torrent is actually added.
 */
export function assertAddAccepted(text: string): void {
  if (text === '' || text === 'Ok.') return;

  let parsed: {
    added_torrent_ids?: unknown;
    success_count?: unknown;
    pending_count?: unknown;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // Not JSON and not the legacy "Ok." — an unexpected/failure body.
    throw new QbittorrentError(`add failed: ${text}`);
  }
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
  const addedIds = Array.isArray(parsed.added_torrent_ids) ? parsed.added_torrent_ids.length : 0;
  const accepted = num(parsed.success_count) + num(parsed.pending_count) + addedIds;
  if (accepted > 0) return;
  throw new QbittorrentError(`add failed: ${text}`);
}

export async function listTorrentsInCategory(
  c: QbtConnection,
  category: string,
): Promise<QbtTorrent[]> {
  const res = await authedCall(
    c,
    `${baseUrl(c)}/api/v2/torrents/info?category=${encodeURIComponent(category)}`,
  );
  if (!res.ok) throw new QbittorrentError(`torrents/info HTTP ${res.status}`, res.status);
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new QbittorrentError('torrents/info: invalid JSON', undefined, e);
  }
  const v = QbtTorrentsListSchema.safeParse(parsed);
  if (!v.success) throw new QbittorrentError(`torrents/info: shape invalid: ${v.error.message}`);
  return v.data;
}

export async function listTorrentsByHashes(
  c: QbtConnection,
  hashes: string[],
): Promise<QbtTorrent[]> {
  if (hashes.length === 0) return [];
  const res = await authedCall(
    c,
    `${baseUrl(c)}/api/v2/torrents/info?hashes=${encodeURIComponent(hashes.join('|'))}`,
  );
  if (!res.ok) throw new QbittorrentError(`torrents/info HTTP ${res.status}`, res.status);
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new QbittorrentError('torrents/info: invalid JSON', undefined, e);
  }
  const v = QbtTorrentsListSchema.safeParse(parsed);
  if (!v.success) throw new QbittorrentError(`torrents/info: shape invalid: ${v.error.message}`);
  return v.data;
}

export async function getTorrentFiles(c: QbtConnection, hash: string): Promise<QbtFile[]> {
  const res = await authedCall(
    c,
    `${baseUrl(c)}/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`,
  );
  if (!res.ok) throw new QbittorrentError(`torrents/files HTTP ${res.status}`, res.status);
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new QbittorrentError('torrents/files: invalid JSON', undefined, e);
  }
  const v = QbtFilesListSchema.safeParse(parsed);
  if (!v.success) throw new QbittorrentError(`torrents/files: shape invalid: ${v.error.message}`);
  return v.data;
}

export async function pauseTorrent(c: QbtConnection, hash: string): Promise<void> {
  const body = new URLSearchParams({ hashes: hash });
  const res = await authedCall(c, `${baseUrl(c)}/api/v2/torrents/pause`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new QbittorrentError(`torrents/pause HTTP ${res.status}`, res.status);
}

export async function resumeTorrent(c: QbtConnection, hash: string): Promise<void> {
  const body = new URLSearchParams({ hashes: hash });
  const res = await authedCall(c, `${baseUrl(c)}/api/v2/torrents/resume`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new QbittorrentError(`torrents/resume HTTP ${res.status}`, res.status);
}

export async function deleteTorrent(
  c: QbtConnection,
  hash: string,
  opts?: { deleteFiles?: boolean },
): Promise<void> {
  const deleteFiles = opts?.deleteFiles ?? false;
  const body = new URLSearchParams({
    hashes: hash,
    deleteFiles: deleteFiles ? 'true' : 'false',
  });
  const res = await authedCall(c, `${baseUrl(c)}/api/v2/torrents/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new QbittorrentError(`torrents/delete HTTP ${res.status}`, res.status);
}

/**
 * Pause all torrents whose category starts with the given prefix.
 * qBittorrent's /torrents/info endpoint only supports exact-category filtering,
 * so we list each known category and collect the hashes, then send a single
 * pipe-separated pause request.
 */
export async function pauseTorrentsByCategory(
  c: QbtConnection,
  categoryPrefix: string,
): Promise<void> {
  const { CONTENT_TYPES } = await import('@bookkeeprr/types/pure');
  const categories = CONTENT_TYPES.map((ct) => `${categoryPrefix}-${ct}`).filter((cat) =>
    cat.startsWith(categoryPrefix),
  );
  const hashes: string[] = [];
  for (const cat of categories) {
    try {
      const torrents = await listTorrentsInCategory(c, cat);
      for (const t of torrents) hashes.push(t.hash);
    } catch {
      // Best-effort: skip categories that fail
    }
  }
  if (hashes.length === 0) return;
  const body = new URLSearchParams({ hashes: hashes.join('|') });
  const res = await authedCall(c, `${baseUrl(c)}/api/v2/torrents/pause`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new QbittorrentError(`torrents/pause HTTP ${res.status}`, res.status);
}

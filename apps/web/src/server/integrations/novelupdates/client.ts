import { parseSearchHits, parseSeriesPage, parseRssItems } from './parser';
import type { NuSearchHit, NuSeriesDetail, NuChapterEntry } from './schemas';
import {
  flaresolverrSetting,
  isFlaresolverrConfigured,
} from '@/server/db/settings/flaresolverr';
import { solveGet, FlaresolverrError } from '@/server/integrations/flaresolverr/client';

const BASE_URL = 'https://www.novelupdates.com';
const USER_AGENT = 'bookkeeprr/0.1.0 (+https://github.com/paulcsiki/bookkeeprr)';

type ErrorCode = 'http' | 'parse' | 'rate-limited' | 'blocked' | 'not-found';

export class NovelUpdatesError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  constructor(code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'NovelUpdatesError';
    this.code = code;
    this.status = status;
  }
}

// Rate-limit: 1 request per 3 seconds (community-run site; be polite).
const REFILL_INTERVAL_MS = 3000;
const BUCKET_SIZE = 1;
let bucket = BUCKET_SIZE;
let lastRefillAt = Date.now();

function refill(): void {
  const now = Date.now();
  const elapsed = now - lastRefillAt;
  if (elapsed >= REFILL_INTERVAL_MS) {
    const tokens = Math.floor(elapsed / REFILL_INTERVAL_MS);
    bucket = Math.min(BUCKET_SIZE, bucket + tokens);
    lastRefillAt = now;
  }
}

async function takeToken(): Promise<void> {
  refill();
  if (bucket <= 0) {
    const wait = REFILL_INTERVAL_MS - (Date.now() - lastRefillAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    refill();
  }
  bucket = Math.max(0, bucket - 1);
}

// Cloudflare interstitial markers — if a solved page still contains these, the
// challenge was not actually passed and we should surface a "blocked" error.
// NOTE: do NOT match `challenge-platform` — Cloudflare injects its
// `/cdn-cgi/challenge-platform/` script into EVERY page it fronts, including
// successfully-solved content pages, so it false-positives. The reliable
// "still on the interstitial" signals are the title and the verification body.
function looksLikeCfChallenge(html: string): boolean {
  return (
    html.includes('Just a moment') ||
    html.includes('cf-browser-verification') ||
    html.includes('_cf_chl_opt')
  );
}

// Fetch via FlareSolverr, then map its result onto NovelUpdatesError semantics.
async function fetchViaFlaresolverr(baseUrl: string, url: string): Promise<string> {
  let html: string;
  try {
    ({ html } = await solveGet(baseUrl, url));
  } catch (err) {
    if (err instanceof FlaresolverrError) {
      throw new NovelUpdatesError('blocked', err.message);
    }
    throw new NovelUpdatesError('http', (err as Error).message);
  }
  // FlareSolverr returns the page body even for non-200s, so inspect the HTML
  // for the markers NovelUpdates emits.
  if (looksLikeCfChallenge(html)) {
    throw new NovelUpdatesError('blocked', `Cloudflare challenge not solved for ${url}`, 403);
  }
  if (html.includes('Error 403') || html.includes('403 Forbidden')) {
    throw new NovelUpdatesError('blocked', `403 for ${url}`, 403);
  }
  if (html.includes('Page not found') || html.includes('Error 404')) {
    throw new NovelUpdatesError('not-found', `404 for ${url}`, 404);
  }
  return html;
}

// Direct server-side fetch (original behavior; used when FlareSolverr is unset).
async function fetchDirect(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch (err) {
    throw new NovelUpdatesError('http', (err as Error).message);
  }
  if (res.status === 404) {
    throw new NovelUpdatesError('not-found', `404 for ${url}`, 404);
  }
  if (res.status === 429) {
    throw new NovelUpdatesError('rate-limited', `429 for ${url}`, 429);
  }
  if (res.status === 403) {
    throw new NovelUpdatesError('blocked', `403 for ${url}`, 403);
  }
  if (!res.ok) {
    throw new NovelUpdatesError('http', `HTTP ${res.status} for ${url}`, res.status);
  }
  return res.text();
}

async function nuFetch(url: string): Promise<string> {
  await takeToken();
  // Route through FlareSolverr when configured (bypasses Cloudflare's JS
  // challenge); otherwise fall back to the plain direct fetch.
  const cfg = await flaresolverrSetting.get();
  if (isFlaresolverrConfigured(cfg)) {
    return fetchViaFlaresolverr(cfg.url, url);
  }
  return fetchDirect(url);
}

export async function searchNovelUpdates(query: string): Promise<NuSearchHit[]> {
  if (query.trim().length === 0) return [];
  const url = `${BASE_URL}/series-finder/?sf=1&sh=${encodeURIComponent(query)}`;
  const html = await nuFetch(url);
  return parseSearchHits(html);
}

export async function getSeriesBySlug(slug: string): Promise<NuSeriesDetail> {
  const url = `${BASE_URL}/series/${encodeURIComponent(slug)}/`;
  const html = await nuFetch(url);
  return parseSeriesPage(html, slug);
}

export async function fetchChapterFeed(numericId: number): Promise<NuChapterEntry[]> {
  const url = `${BASE_URL}/extnu/${numericId}/`;
  const xml = await nuFetch(url);
  return parseRssItems(xml);
}

// Test-only: reset rate-limit bucket between tests for deterministic timing.
export function __resetBucketForTests(): void {
  bucket = BUCKET_SIZE;
  lastRefillAt = Date.now();
}

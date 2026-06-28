import { z } from 'zod';

/**
 * iTunes / Apple audiobook search — a free, keyless catalog of commercial
 * audiobooks (the Audnex/Audible API misses many titles and has no cover for
 * some). Used as a second audiobook source in Discover so titles like
 * "Greenlights" are findable and carry real cover art.
 *
 * Endpoint: https://itunes.apple.com/search?media=audiobook (public, no key).
 */

const BASE = 'https://itunes.apple.com';
const COUNTRY = 'us';
const TTL_MS = 5 * 60_000;
const RATE_LIMIT_MS = 1000;
const JITTER_MS = 200;

export class ITunesError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ITunesError';
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

export function __setITunesFetcherForTests(f: Fetcher): void {
  activeFetcher = f;
}
export function __resetITunesForTests(): void {
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

/** Upscale iTunes' 100×100 artwork URL to a crisp cover (600×600). */
function upscaleArtwork(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png)$/i, '/600x600bb.$2');
}

const ITunesResult = z
  .object({
    collectionId: z.number().optional(),
    trackId: z.number().optional(),
    collectionName: z.string().optional(),
    trackName: z.string().optional(),
    artistName: z.string().optional(),
    artworkUrl100: z.string().optional(),
    releaseDate: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();
const ITunesResponse = z.object({ results: z.array(ITunesResult) }).passthrough();

export type ITunesAudiobookHit = {
  id: string;
  title: string;
  author: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
  /** iTunes collectionId — present when the hit is a collection (audiobook product). */
  collectionId: number | null;
  /** iTunes collectionName — present when the hit is a collection (audiobook product). */
  collectionName: string | null;
  /** iTunes trackName — the individual book title (distinct from the collection name). */
  trackName: string | null;
  /** iTunes long-form synopsis for the audiobook. Null when the entity carries none. */
  description: string | null;
};

async function fetchJson(url: string): Promise<unknown> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  await rateLimit();
  let resp: FetcherResponse;
  try {
    resp = await activeFetcher(url);
  } catch (err) {
    throw new ITunesError(`fetch failed for ${url}`, err);
  }
  if (!resp.ok) throw new ITunesError(`HTTP ${resp.status} for ${url}`);
  const body = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new ITunesError('response shape invalid', err);
  }
  cache.set(url, { value: parsed, expiresAt: Date.now() + TTL_MS });
  return parsed;
}

const RssFeed = z
  .object({
    feed: z
      .object({
        results: z.array(
          z
            .object({
              id: z.string().optional(),
              name: z.string().optional(),
              artistName: z.string().optional(),
              artworkUrl100: z.string().optional(),
              releaseDate: z.string().optional(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Apple's "top audiobooks" marketing RSS — a deep, keyless chart (up to 100
 * commercial titles with cover art). Powers a Discover browse row so the audio
 * "show all" has real depth instead of running out after the ~15 NYT picks.
 */
export async function topAudiobooks(limit = 100): Promise<ITunesAudiobookHit[]> {
  const url = `https://rss.applemarketingtools.com/api/v2/${COUNTRY}/audio-books/top/${limit}/audio-books.json`;
  const raw = await fetchJson(url);
  const parsed = RssFeed.safeParse(raw);
  if (!parsed.success) throw new ITunesError('rss shape invalid', parsed.error);
  const hits: ITunesAudiobookHit[] = [];
  for (const r of parsed.data.feed.results) {
    if (!r.id || !r.name) continue;
    hits.push({
      id: r.id,
      title: r.name,
      author: r.artistName ?? null,
      releaseYear: parseYear(r.releaseDate),
      coverUrl: upscaleArtwork(r.artworkUrl100),
      // RSS feed results carry id/name but not a distinct collectionId/Name field.
      collectionId: null,
      collectionName: null,
      trackName: null,
      // RSS marketing feed has no synopsis field.
      description: null,
    });
  }
  return hits;
}

export async function searchAudiobooks(q: string): Promise<ITunesAudiobookHit[]> {
  const params = new URLSearchParams({
    term: q,
    media: 'audiobook',
    entity: 'audiobook',
    country: COUNTRY,
    limit: '25',
  });
  const url = `${BASE}/search?${params.toString()}`;
  const raw = await fetchJson(url);
  const parsed = ITunesResponse.safeParse(raw);
  if (!parsed.success) throw new ITunesError('response shape invalid', parsed.error);

  const hits: ITunesAudiobookHit[] = [];
  for (const r of parsed.data.results) {
    const id = r.collectionId ?? r.trackId;
    const title = r.collectionName ?? r.trackName;
    if (id == null || !title) continue;
    hits.push({
      id: String(id),
      title,
      author: r.artistName ?? null,
      releaseYear: parseYear(r.releaseDate),
      coverUrl: upscaleArtwork(r.artworkUrl100),
      collectionId: r.collectionId ?? null,
      collectionName: r.collectionName ?? null,
      trackName: r.trackName ?? null,
      description: r.description ?? null,
    });
  }
  return hits;
}

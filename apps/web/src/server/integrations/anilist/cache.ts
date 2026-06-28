import { searchManga, searchNovel } from './client';
import type { SearchHit } from './schemas';

const TTL_MS = 5 * 60_000;

type Entry = { hits: SearchHit[]; expiresAt: number };

const cache = new Map<string, Entry>();

export function __clearCacheForTests(): void {
  cache.clear();
}

async function kindCached(
  kind: 'manga' | 'novel',
  query: string,
  fetcher: (q: string) => Promise<SearchHit[]>,
): Promise<SearchHit[]> {
  const key = `${kind}:${query}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.hits;
  const hits = await fetcher(query);
  cache.set(key, { hits, expiresAt: now + TTL_MS });
  return hits;
}

export async function searchMangaCached(query: string): Promise<SearchHit[]> {
  return kindCached('manga', query, searchManga);
}

export async function searchNovelCached(query: string): Promise<SearchHit[]> {
  return kindCached('novel', query, searchNovel);
}

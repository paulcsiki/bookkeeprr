import { searchMangaCached } from '@/server/integrations/anilist/cache';
import { searchMangaTitles } from '@/server/integrations/mangadex/client';
import type { SearchHit } from '@/server/integrations/anilist/schemas';
import { searchMangaMal } from '@/server/integrations/mal';
import { malClientIdSetting, isMalConfigured } from '@/server/db/settings/mal';
import { crossLinkHits, type MergedMangaHit } from '@/server/discover/cross-link';
import { logger } from '@/server/logger';

/** Case-insensitive shared leading run of two strings (casing from `a`). */
function sharedPrefix(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i]!.toLowerCase() === b[i]!.toLowerCase()) i++;
  return a.slice(0, i);
}

/**
 * Given MangaDex title hits for a `query` that AniList couldn't match, derive a
 * fuller query to re-run against AniList. Strategy: keep only titles that start
 * with the query (true prefix completions, e.g. "narut" → "Naruto …"), take
 * their longest common prefix, and trim a trailing partial word/punctuation so
 * "Naruto - X" / "Naruto: Y" collapse to "Naruto". Returns null when there's no
 * usable completion (so we don't surface unrelated substring matches).
 *
 * Exported for unit testing — the logic is pure.
 */
export function recoverQueryFromTitles(titles: string[], query: string): string | null {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return null;
  const matches = titles.filter((t) => t.toLowerCase().startsWith(q));
  if (matches.length === 0) return null;

  let lcp = matches[0]!;
  for (const t of matches.slice(1)) lcp = sharedPrefix(lcp, t);

  // Drop a trailing partial word + separators ("Naruto: " / "Naruto -" → "Naruto").
  const trimmed = lcp.replace(/[\s\p{P}]+$/u, '').trim();
  if (trimmed.length < query.trim().length) return null;
  return trimmed;
}

/**
 * Manga search with a MangaDex completion fallback. AniList's relevance search
 * inconsistently drops short fragments ("narut" → nothing, "naruto" → Naruto);
 * MangaDex does real substring matching. So on an empty AniList result we ask
 * MangaDex what the user likely meant, then re-query AniList with that fuller
 * title — results (and their `anilistId`) stay AniList-native, so the add flow
 * is unchanged.
 */
export async function searchMangaWithFallback(
  query: string,
  opts: { mangadex?: boolean } = {},
): Promise<SearchHit[]> {
  const { mangadex = true } = opts;
  const hits = await searchMangaCached(query);
  if (hits.length > 0) return hits;

  // The completion fallback leans on MangaDex; skip it entirely when MangaDex is
  // disabled so a toggled-off provider is never reached.
  if (!mangadex) return hits;

  const q = query.trim();
  if (q.length < 3) return hits;

  let titles: string[];
  try {
    titles = await searchMangaTitles(q, 10);
  } catch {
    return hits; // MangaDex unavailable — keep AniList's (empty) answer
  }

  const better = recoverQueryFromTitles(titles, q);
  if (better === null || better.toLowerCase() === q.toLowerCase()) return hits;

  try {
    return await searchMangaCached(better);
  } catch {
    return hits;
  }
}

/**
 * Manga search merged across AniList and MyAnimeList. AniList (with its MangaDex
 * completion fallback) is always the primary source; when MAL is configured we
 * also query it in parallel and cross-link the two result sets via
 * `crossLinkHits` (AniList stays the display primary on a linked hit, MAL
 * contributes its id and any MAL-only hits).
 *
 * MAL never blocks or breaks AniList: if MAL is unconfigured, returns empty, or
 * throws, we fall back to AniList-only results (an error is logged as a warning).
 * When MAL is off/empty the output is exactly the AniList hits projected through
 * `crossLinkHits` with no MAL ids — shape-compatible with the AniList-only path.
 */
/** Per-provider toggles for manga search. All default to enabled. */
export type MangaSearchProviders = { anilist?: boolean; mal?: boolean; mangadex?: boolean };

export async function searchMangaMerged(
  query: string,
  providers: MangaSearchProviders = {},
): Promise<MergedMangaHit[]> {
  const { anilist = true, mal = true, mangadex = true } = providers;

  // AniList is the display primary; when it's toggled off we skip it (and its
  // MangaDex completion fallback) and emit only MAL-only hits, if MAL is on.
  const fetchAnilist = anilist
    ? searchMangaWithFallback(query, { mangadex })
    : Promise.resolve<SearchHit[]>([]);

  const clientId = await malClientIdSetting.get();
  const malEnabled = mal && isMalConfigured(clientId);

  if (!malEnabled) {
    const anilistHits = await fetchAnilist;
    return crossLinkHits(anilistHits, []);
  }

  const [anilistHits, malHits] = await Promise.all([
    fetchAnilist,
    searchMangaMal(query).catch((err: unknown) => {
      logger()
        .child({ component: 'manga-search', source: 'mal' })
        .warn({ err }, 'MyAnimeList search failed; falling back to AniList-only');
      return [];
    }),
  ]);

  return crossLinkHits(anilistHits, malHits);
}

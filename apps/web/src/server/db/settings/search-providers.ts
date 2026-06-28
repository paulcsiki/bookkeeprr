import type { z } from 'zod';
import { SearchProvidersSchema } from '@/server/openapi/schemas/settings';
import { defineSetting } from '../settings';

/**
 * Discovery search providers that can be individually toggled on/off. The keys
 * mirror the upstream sources fanned out by the discover search route:
 *
 * - `anilist`     — AniList (manga + light novels)
 * - `mal`         — MyAnimeList (manga cross-link / MAL-only hits)
 * - `mangadex`    — MangaDex (manga completion fallback + cross-link)
 * - `comicvine`   — ComicVine (comics)
 * - `openlibrary` — OpenLibrary (ebooks)
 * - `audnex`      — Audnex (audiobooks)
 * - `novelupdates`— NovelUpdates (web / Korean novels, needs FlareSolverr)
 *
 * Single-sourced in the OpenAPI schema module (also the strict PUT
 * /api/settings/search-providers body).
 */
export { SearchProvidersSchema };

export type SearchProviders = z.infer<typeof SearchProvidersSchema>;

/** All providers default to enabled — discovery searches everything out of the box. */
export const DEFAULT_SEARCH_PROVIDERS: SearchProviders = {
  anilist: true,
  mal: true,
  mangadex: true,
  comicvine: true,
  openlibrary: true,
  audnex: true,
  novelupdates: true,
};

/**
 * Tolerates a stored value that predates a newly-added provider key: any missing
 * key falls back to its default (enabled), so a provider added in a later release
 * is on by default rather than crashing the parse. Unknown keys are dropped.
 */
const StoredSchema = SearchProvidersSchema.partial()
  .catch({})
  .transform((partial) => ({ ...DEFAULT_SEARCH_PROVIDERS, ...partial }));

export const searchProvidersSetting = defineSetting(
  'search.providers',
  StoredSchema,
  DEFAULT_SEARCH_PROVIDERS,
);

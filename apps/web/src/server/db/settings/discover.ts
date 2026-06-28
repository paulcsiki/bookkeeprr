import { z } from 'zod';
import { defineSetting } from '../settings';

/**
 * Source for the Discover "Trending now" rail. `anilist` uses AniList's real
 * TRENDING_DESC sort (the default); `mal` uses MyAnimeList's popularity
 * ranking (only when MAL is configured — otherwise it falls back to AniList).
 */
export const discoverTrendingSourceSetting = defineSetting(
  'discover.trending_source',
  z.enum(['anilist', 'mal']),
  'anilist',
);

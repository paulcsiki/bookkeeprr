import { z } from 'zod';

/**
 * The masked sentinel a single-secret settings GET returns when a value is
 * stored. An empty string means "no value configured". The mobile forms render
 * the field EMPTY and treat the sentinel only as a "a key is set" indicator —
 * the raw secret never leaves the server.
 */
export const SECRET_MASK = '****';

/**
 * Factory for the tolerant single-secret GET reader. The metadata settings
 * routes (ComicVine, Google Books, MyAnimeList, New York Times) each return
 * their secret object directly — `{ apiKey: string }` or `{ clientId: string }`
 * — with the value masked to `'****'` when set and `''` when unset.
 */
export function keyResponse<F extends string>(field: F) {
  return z.object({ [field]: z.string() } as Record<F, z.ZodString>);
}

export type KeyField = 'apiKey' | 'clientId';

/** The result of a key/connection test endpoint. */
export const KeyTestResult = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});
export type KeyTestResult = z.infer<typeof KeyTestResult>;

// ── qBittorrent ───────────────────────────────────────────────────────────────

/** Shape returned by GET /api/settings/qbt (password masked to '****' when set). */
export const QbtConfig = z.object({
  host: z.string(),
  port: z.number(),
  username: z.string(),
  password: z.string(),
  useHttps: z.boolean(),
});
export type QbtConfig = z.infer<typeof QbtConfig>;

/** Shape returned by POST /api/qbt/test-connection. */
export const QbtTestResult = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});
export type QbtTestResult = z.infer<typeof QbtTestResult>;

// ── FlareSolverr ─────────────────────────────────────────────────────────────

/** Shape returned by GET /api/settings/flaresolverr. */
export const FlaresolverrConfig = z.object({
  url: z.string(),
});
export type FlaresolverrConfig = z.infer<typeof FlaresolverrConfig>;

/**
 * The seven metadata/search providers toggled by `/api/settings/search-providers`.
 * Used by the Search Providers screen in Task 2.
 */
export const SearchProviders = z.object({
  anilist: z.boolean(),
  mal: z.boolean(),
  mangadex: z.boolean(),
  comicvine: z.boolean(),
  openlibrary: z.boolean(),
  audnex: z.boolean(),
  novelupdates: z.boolean(),
});
export type SearchProviders = z.infer<typeof SearchProviders>;

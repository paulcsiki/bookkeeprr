/**
 * Allowlisted upstream cover hosts. Restricting the proxy to known cover CDNs
 * keeps it from becoming an open proxy / SSRF vector — it can only ever fetch
 * public cover art from these hosts.
 *
 * Each host is the CDN that appears in a library cover URL, enumerated from the
 * integration cover-URL builders:
 * - uploads.mangadex.org — MangaDex covers
 * - s4.anilist.co        — AniList coverImage (extraLarge/large/medium)
 * - covers.openlibrary.org — OpenLibrary cover ids / isbn covers
 * - comicvine.gamespot.com — ComicVine image (small_url/medium_url)
 * - m.media-amazon.com   — Audnex/Audible covers (Amazon image host)
 * - archive.org          — LibriVox covers (services/img endpoint)
 * - storage.googleapis.com — NYT book_image
 * - cdn.novelupdates.com — NovelUpdates covers (Cloudflare-gated; see below)
 * - books.google.com         — Google Books cover thumbnails
 * - books.googleusercontent.com — Google Books high-res covers
 */
export const ALLOWED_IMAGE_HOSTS = new Set<string>([
  'uploads.mangadex.org',
  's4.anilist.co',
  'covers.openlibrary.org',
  'comicvine.gamespot.com',
  'm.media-amazon.com',
  'archive.org',
  'storage.googleapis.com',
  'cdn.novelupdates.com',
  'books.google.com',
  'books.googleusercontent.com',
]);

/**
 * Allowlisted hosts that sit behind a Cloudflare "Just a moment" challenge. A
 * plain server fetch returns a 403 interstitial, so these must be fetched with
 * a `cf_clearance` cookie + matching User-Agent obtained via FlareSolverr/Byparr
 * (see `cf-clearance.ts` and the `/api/img` route).
 */
export const CF_GATED_IMAGE_HOSTS = new Set<string>(['cdn.novelupdates.com']);

/** True when `host` is one of the allowlisted cover CDNs. */
export function isAllowlistedImageHost(host: string): boolean {
  return ALLOWED_IMAGE_HOSTS.has(host);
}

/** True when `host` is an allowlisted CDN that requires Cloudflare clearance. */
export function isCfGatedImageHost(host: string): boolean {
  return CF_GATED_IMAGE_HOSTS.has(host);
}

/**
 * Per-host upstream request headers. MangaDex's CDN serves a "read this at
 * mangadex.org" placeholder for some direct browser hotlinks; fetching
 * server-side with a mangadex.org Referer returns the real cover.
 */
export function upstreamImageHeaders(host: string): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': 'bookkeeprr/0.1 (+https://github.com/paulcsiki/bookkeeprr)',
    accept: 'image/avif,image/webp,image/jpeg,image/png,*/*',
  };
  if (host === 'uploads.mangadex.org') headers.referer = 'https://mangadex.org/';
  return headers;
}

/**
 * Rewrite a library cover URL to load through the caching `/api/img` proxy when
 * caching is enabled and the URL host is allowlisted; otherwise return the URL
 * unchanged so it loads direct (never broken).
 *
 * Null/empty values pass through untouched.
 */
export function libraryCoverSrc(
  url: string | null | undefined,
  cacheEnabled: boolean,
): string | null | undefined {
  if (!url || !cacheEnabled) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'https:' || !isAllowlistedImageHost(parsed.host)) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}

/**
 * Like {@link libraryCoverSrc} but ALWAYS routes allowlisted hosts through the
 * `/api/img` proxy, independent of the image-cache setting. Use for cover URLs
 * served to clients that can't add per-host upstream headers themselves — most
 * importantly the mobile app and any external-CDN cover (MangaDex needs a
 * Referer; Google Books/OpenLibrary covers benefit from caching). The proxy
 * still serves a pass-through when caching is off, so this never breaks an image.
 *
 * Returns a root-relative path; callers targeting a non-browser client (mobile)
 * must resolve it against the server origin.
 */
export function proxiedCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== 'https:' || !isAllowlistedImageHost(parsed.host)) return url;
  return `/api/img?u=${encodeURIComponent(url)}`;
}

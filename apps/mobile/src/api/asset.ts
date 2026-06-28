/**
 * Resolve a cover/asset reference returned by the API into a URL the device can
 * load. Absolute `http(s)` URLs (e.g. AniList covers) pass through unchanged;
 * root-relative paths (e.g. the server's `/api/img` cover proxy) are joined onto
 * the server origin. Returns null for empty input so callers can fall back to
 * the gradient placeholder.
 */
export function resolveAssetUri(
  serverUrl: string,
  uri: string | null | undefined,
): string | null {
  if (!uri) return null;
  if (/^https?:\/\//i.test(uri)) return uri;
  if (!serverUrl) return uri;
  const base = serverUrl.replace(/\/$/, '');
  return `${base}${uri.startsWith('/') ? '' : '/'}${uri}`;
}

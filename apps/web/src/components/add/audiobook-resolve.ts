import type { DiscoverResult } from '@/app/api/discover/search/route';
import type { ResolveAudiobookResult } from '@/app/api/discover/resolve-audiobook/route';
import { apiFetch } from '@/lib/api-fetch';

/**
 * Audiobook discover tiles from NYT / LibriVox / iTunes carry no Audible ASIN —
 * they are keyed by isbn (NYT), a LibriVox id, or an iTunes id. bookkeeprr
 * audiobooks are keyed by ASIN, so these tiles must resolve an ASIN at add time.
 * Real audnex tiles already carry a bare ASIN and need no resolution.
 */
export function needsAudiobookResolve(r: DiscoverResult): boolean {
  return (
    r.contentType === 'audiobook' &&
    (r.source === 'nyt' || r.source === 'librivox' || r.source === 'itunes')
  );
}

/**
 * Resolves an Audible ASIN (+ canonical title/author/cover) for a no-ASIN
 * audiobook tile by searching Audible for "title author". Returns null when no
 * Audible match is found. Throws on network/HTTP failure (the caller surfaces a
 * toast).
 */
export async function resolveAudiobook(r: DiscoverResult): Promise<ResolveAudiobookResult> {
  const qs = new URLSearchParams({ title: r.title, author: r.author ?? '' });
  const resp = await apiFetch(`/api/discover/resolve-audiobook?${qs.toString()}`);
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${resp.status}`);
  }
  const body = (await resp.json()) as { result: ResolveAudiobookResult };
  return body.result;
}

/**
 * Returns a copy of the result with its no-ASIN source identity replaced by the
 * resolved Audible identity: `source` → 'audnex', `sourceId` → the ASIN, and
 * `sources.audnex` set. Title/cover are upgraded to the Audible values when
 * present (LibriVox tiles have no cover; Audible usually does). Downstream
 * `buildSeriesBody` / `toSheetHit` then treat it as an ordinary audnex tile.
 */
export function applyResolvedAudiobook(
  r: DiscoverResult,
  resolved: NonNullable<ResolveAudiobookResult>,
): DiscoverResult {
  return {
    ...r,
    source: 'audnex',
    sourceId: resolved.asin,
    title: resolved.title || r.title,
    author: resolved.author ?? r.author ?? null,
    coverUrl: resolved.coverUrl ?? r.coverUrl ?? null,
    sources: { ...r.sources, audnex: resolved.asin },
  };
}

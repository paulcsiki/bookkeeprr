import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { getImageCacheDir } from '@/server/db/settings/library';

/**
 * Candidate extensions a cached cover can have on disk. The cache filename is
 * `sha256(url) + ext`, where the ext is derived from the upstream content-type
 * (or the URL) at write time — see `/api/img`. Since the original ext isn't
 * known at purge time, unlink every candidate.
 */
const CACHE_EXTS = ['.jpg', '.png', '.webp', '.avif', '.gif', '.img'] as const;

/**
 * Best-effort purge of the on-disk cache file(s) for a single cover URL. Unlinks
 * `join(cacheDir, sha256(url) + ext)` for each candidate ext. Missing files
 * (ENOENT) and any other unlink error are swallowed — purging must never fail
 * the caller (e.g. a series delete).
 */
export async function purgeCachedImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  let dir: string;
  try {
    dir = await getImageCacheDir();
  } catch {
    return;
  }
  const hash = createHash('sha256').update(url).digest('hex');
  await Promise.all(
    CACHE_EXTS.map(async (ext) => {
      try {
        await unlink(join(dir, hash + ext));
      } catch {
        // Missing file or any other error — best-effort, ignore.
      }
    }),
  );
}

/** Best-effort purge of the cache files for many cover URLs. */
export async function purgeCachedImages(urls: (string | null | undefined)[]): Promise<void> {
  await Promise.all(urls.map((u) => purgeCachedImage(u)));
}

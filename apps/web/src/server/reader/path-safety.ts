import { realpathSync } from 'node:fs';
import path from 'node:path';
import { getLibraryFile } from '@/server/db/library-files';
import { getMediaRoot } from '@/server/content-type/paths';
import type { LibraryFileRow } from '@/server/db/schema';

export type ResolvedFile =
  | { ok: true; path: string; row: LibraryFileRow }
  | { ok: false; error: 'not_found' | 'forbidden' };

/**
 * Resolve a library file to a safe absolute path on disk.
 *
 * Guards against path traversal / symlink escape: the file's real path must
 * be the media root itself or live underneath it. A missing DB row or a path
 * that does not exist on disk yields 'not_found'; a path that resolves
 * outside the media root yields 'forbidden'.
 */
export async function resolveLibraryFilePath(fileId: number): Promise<ResolvedFile> {
  const row = await getLibraryFile(fileId);
  if (row === null) return { ok: false, error: 'not_found' };

  let realPath: string;
  try {
    realPath = realpathSync(row.path);
  } catch {
    // File does not exist on disk (or is otherwise unreadable).
    return { ok: false, error: 'not_found' };
  }

  let mediaRoot: string;
  try {
    mediaRoot = realpathSync(await getMediaRoot());
  } catch {
    // Media root missing/unresolvable → nothing can be safely under it.
    return { ok: false, error: 'forbidden' };
  }

  const isUnderRoot = realPath === mediaRoot || realPath.startsWith(mediaRoot + path.sep);
  if (!isUnderRoot) return { ok: false, error: 'forbidden' };

  return { ok: true, path: realPath, row };
}

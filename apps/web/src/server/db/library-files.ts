import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from './client';
import { libraryFiles, type LibraryFileRow } from './schema';
import { withWriteLock } from './write-lock';
import type { ImportedJoinRow } from '@/server/readarr/history-mapper';

export type LibraryFileCreate = {
  seriesId: number;
  volumeId?: number | null;
  chapterId?: number | null;
  path: string;
  sizeBytes: number;
  hashSha1?: string | null;
  sourceReleaseId?: number | null;
};

export async function insertLibraryFile(input: LibraryFileCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(libraryFiles)
      .values({
        seriesId: input.seriesId,
        volumeId: input.volumeId ?? null,
        chapterId: input.chapterId ?? null,
        path: input.path,
        sizeBytes: input.sizeBytes,
        hashSha1: input.hashSha1 ?? null,
        sourceReleaseId: input.sourceReleaseId ?? null,
      })
      .returning({ id: libraryFiles.id });
    if (!row) throw new Error('insertLibraryFile: insert returned no row');
    return row.id;
  });
}

export async function getLibraryFile(id: number): Promise<LibraryFileRow | null> {
  const rows = await getDb().select().from(libraryFiles).where(eq(libraryFiles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getLibraryFileByPath(path: string): Promise<LibraryFileRow | null> {
  const rows = await getDb()
    .select()
    .from(libraryFiles)
    .where(eq(libraryFiles.path, path))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLibraryFilesBySeries(seriesId: number): Promise<LibraryFileRow[]> {
  return getDb().select().from(libraryFiles).where(eq(libraryFiles.seriesId, seriesId));
}

export async function listLibraryFilesByReleaseId(releaseId: number): Promise<LibraryFileRow[]> {
  return getDb().select().from(libraryFiles).where(eq(libraryFiles.sourceReleaseId, releaseId));
}

/**
 * Count of library_files that were imported from the given release. Used by the
 * importer to recognise an already-completed import when the torrent has since
 * been cleaned up out of qBit — so a duplicate import job becomes a no-op
 * instead of a spurious "torrent not found" failure.
 */
export async function countLibraryFilesByReleaseId(releaseId: number): Promise<number> {
  const rows = (await getDb()
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(libraryFiles)
    .where(eq(libraryFiles.sourceReleaseId, releaseId))) as { count: number }[];
  return rows[0]?.count ?? 0;
}

export async function deleteLibraryFile(id: number): Promise<void> {
  await withWriteLock(() => getDb().delete(libraryFiles).where(eq(libraryFiles.id, id)));
}

export async function listLibraryFilesByVolume(volumeId: number): Promise<LibraryFileRow[]> {
  return getDb().select().from(libraryFiles).where(eq(libraryFiles.volumeId, volumeId));
}

export async function listLibraryFilesByChapter(chapterId: number): Promise<LibraryFileRow[]> {
  return getDb().select().from(libraryFiles).where(eq(libraryFiles.chapterId, chapterId));
}

export async function listAllLibraryFilePaths(): Promise<string[]> {
  const rows = await getDb().select({ path: libraryFiles.path }).from(libraryFiles);
  return rows.map((r) => r.path);
}

export async function listImportedForHistory(limit: number): Promise<ImportedJoinRow[]> {
  const rows = await getDb()
    .select({
      libraryFileId: libraryFiles.id,
      importedAt: libraryFiles.importedAt,
      seriesId: libraryFiles.seriesId,
      volumeId: libraryFiles.volumeId,
      path: libraryFiles.path,
    })
    .from(libraryFiles)
    .orderBy(desc(libraryFiles.importedAt))
    .limit(limit);
  return rows.map((r) => ({
    libraryFileId: r.libraryFileId,
    importedAt: r.importedAt,
    seriesId: r.seriesId,
    volumeId: r.volumeId,
    path: r.path,
    qbtHash: null,
  }));
}

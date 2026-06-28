import { and, eq } from 'drizzle-orm';
import { getDb } from './client';
import { chapterRead, chapters } from './schema';
import { withWriteLock } from './write-lock';

/**
 * Mark or unmark a chapter as read for a user. Upserts a row when `read` is
 * true, deletes it when false. Idempotent.
 */
export async function setChapterRead(
  userId: number,
  chapterId: number,
  read: boolean,
): Promise<void> {
  await withWriteLock(async () => {
    if (read) {
      await getDb()
        .insert(chapterRead)
        .values({ userId, chapterId, readAt: new Date() })
        .onConflictDoNothing({
          target: [chapterRead.userId, chapterRead.chapterId],
        });
    } else {
      await getDb()
        .delete(chapterRead)
        .where(and(eq(chapterRead.userId, userId), eq(chapterRead.chapterId, chapterId)));
    }
  });
}

/**
 * Return the set of chapter ids the user has marked read within a series.
 * Joins chapter_read → chapters to scope by series.
 */
export async function listReadChapterIds(
  userId: number,
  seriesId: number,
): Promise<Set<number>> {
  const rows = await getDb()
    .select({ chapterId: chapterRead.chapterId })
    .from(chapterRead)
    .innerJoin(chapters, eq(chapterRead.chapterId, chapters.id))
    .where(and(eq(chapterRead.userId, userId), eq(chapters.seriesId, seriesId)));
  return new Set(rows.map((r) => r.chapterId));
}

/**
 * Mark every chapter belonging to a volume as read for the user. Used by the
 * auto-mark path when a volume is finished in the reader. Idempotent.
 */
export async function markVolumeChaptersRead(userId: number, volumeId: number): Promise<void> {
  await withWriteLock(async () => {
    const db = getDb();
    const chapterIds = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(eq(chapters.volumeId, volumeId));
    if (chapterIds.length === 0) return;
    const now = new Date();
    await db
      .insert(chapterRead)
      .values(chapterIds.map((c) => ({ userId, chapterId: c.id, readAt: now })))
      .onConflictDoNothing({
        target: [chapterRead.userId, chapterRead.chapterId],
      });
  });
}

import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './client';
import { chapters, type ChapterRow } from './schema';
import { withWriteLock } from './write-lock';

export type ChapterCreate = {
  seriesId: number;
  volumeId?: number | null;
  numberText: string;
  numberSort: number;
  title?: string | null;
  releaseDate?: Date | null;
  mangadexChapterId?: string | null;
};

export type ChapterUpdate = Partial<{
  volumeId: number | null;
  numberText: string;
  numberSort: number;
  title: string | null;
  releaseDate: Date | null;
  mangadexChapterId: string | null;
}>;

export async function insertChapter(input: ChapterCreate): Promise<number> {
  return withWriteLock(async () => {
    const [row] = await getDb()
      .insert(chapters)
      .values({
        seriesId: input.seriesId,
        volumeId: input.volumeId ?? null,
        numberText: input.numberText,
        numberSort: input.numberSort,
        title: input.title ?? null,
        releaseDate: input.releaseDate ?? null,
        mangadexChapterId: input.mangadexChapterId ?? null,
      })
      .returning({ id: chapters.id });
    if (!row) throw new Error('insertChapter: insert returned no row');
    return row.id;
  });
}

export async function listChaptersBySeries(seriesId: number): Promise<ChapterRow[]> {
  return getDb()
    .select()
    .from(chapters)
    .where(eq(chapters.seriesId, seriesId))
    .orderBy(asc(chapters.numberSort));
}

export async function getChapter(id: number): Promise<ChapterRow | null> {
  const rows = await getDb().select().from(chapters).where(eq(chapters.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateChapter(id: number, patch: ChapterUpdate): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await withWriteLock(() => getDb().update(chapters).set(patch).where(eq(chapters.id, id)));
}

export async function deleteChapter(id: number): Promise<void> {
  await withWriteLock(() => getDb().delete(chapters).where(eq(chapters.id, id)));
}

export type UpsertChapterFields = {
  numberText: string;
  title?: string | null;
  volumeId?: number | null;
  releaseDate?: Date | null;
};

export async function upsertChapterByNumberSort(
  seriesId: number,
  numberSort: number,
  fields: UpsertChapterFields,
): Promise<void> {
  return withWriteLock(async () => {
    const db = getDb();
    const existing = await db
      .select({ id: chapters.id })
      .from(chapters)
      .where(and(eq(chapters.seriesId, seriesId), eq(chapters.numberSort, numberSort)))
      .limit(1);
    if (existing[0]) {
      const patch: Record<string, unknown> = { numberText: fields.numberText };
      if (fields.title !== undefined) patch.title = fields.title;
      if (fields.volumeId !== undefined) patch.volumeId = fields.volumeId;
      if (fields.releaseDate !== undefined) patch.releaseDate = fields.releaseDate;
      await db.update(chapters).set(patch).where(eq(chapters.id, existing[0].id));
    } else {
      await db.insert(chapters).values({
        seriesId,
        numberSort,
        numberText: fields.numberText,
        title: fields.title ?? null,
        volumeId: fields.volumeId ?? null,
        releaseDate: fields.releaseDate ?? null,
      });
    }
  });
}

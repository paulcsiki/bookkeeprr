import { existsSync, statSync } from 'node:fs';
import { rename, mkdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { withWriteLock } from '@/server/db/write-lock';
import { libraryFiles, volumes, chapters } from '@/server/db/schema';
import { getSeries } from '@/server/db/series';
import { groupPath } from '@/server/db/library-groups';
import { getAllNamingTemplates } from '@/server/db/settings/naming';
import { render, type NamingContext } from '@/server/naming/engine';
import { getLibraryDir } from '@/server/content-type/paths';

export type RerouteInput = {
  libraryFileId: number;
  targetSeriesId: number;
  volumeNumber: number | null;
  chapterNumber: string | null;
};

export type RerouteResult = {
  oldPath: string;
  newPath: string;
  libraryFileId: number;
};

function buildContext(
  series: NonNullable<Awaited<ReturnType<typeof getSeries>>>,
  seriesGroupPath: string[],
  target: NamingContext['target'],
  sourceExt: string,
): NamingContext {
  return {
    series: {
      english: series.titleEnglish,
      romaji: series.titleRomaji,
      native: series.titleNative,
      anilistId: series.anilistId,
      year: series.startYear ?? null,
      publisher: series.publisher ?? null,
      author: series.author ?? null,
      groupPath: seriesGroupPath,
    },
    release: { group: null, language: 'en' },
    target,
    source: { ext: sourceExt },
  };
}

export async function rerouteLibraryFile(input: RerouteInput): Promise<RerouteResult> {
  const lfRows = await getDb()
    .select()
    .from(libraryFiles)
    .where(eq(libraryFiles.id, input.libraryFileId));
  const lf = lfRows[0];
  if (!lf) throw new Error('library file not found');

  const targetSeries = await getSeries(input.targetSeriesId);
  if (!targetSeries) throw new Error('target series not found');

  if ((input.volumeNumber === null) === (input.chapterNumber === null)) {
    throw new Error('provide exactly one of volumeNumber or chapterNumber');
  }

  const templates = await getAllNamingTemplates(targetSeries.contentType);
  const rawExt = extname(lf.path);
  const ext = (rawExt ? rawExt.replace(/^\./, '') : 'cbz').toLowerCase();
  const targetCtx: NamingContext['target'] =
    input.volumeNumber !== null
      ? { volume: input.volumeNumber }
      : { chapter: input.chapterNumber ?? undefined };

  const seriesGroupPath =
    targetSeries.groupId != null ? await groupPath(targetSeries.groupId) : [];
  const ctx = buildContext(targetSeries, seriesGroupPath, targetCtx, ext);
  const libraryDir = await getLibraryDir(targetSeries.contentType);
  const folderRendered = render(templates.series_folder, ctx);
  const fileRendered =
    input.volumeNumber !== null ? render(templates.volume, ctx) : render(templates.chapter, ctx);

  const newPath = join(libraryDir, folderRendered, fileRendered);

  if (existsSync(newPath)) {
    if (newPath === lf.path) {
      throw new Error('destination is the same as source');
    }
    const stOld = statSync(lf.path);
    const stNew = statSync(newPath);
    if (stOld.ino !== stNew.ino) {
      throw new Error('destination exists');
    }
  }

  await mkdir(dirname(newPath), { recursive: true });

  let targetVolumeId: number | null = null;
  let targetChapterId: number | null = null;
  if (input.volumeNumber !== null) {
    const want = input.volumeNumber;
    const existing = await getDb()
      .select()
      .from(volumes)
      .where(eq(volumes.seriesId, input.targetSeriesId));
    const exact = existing.find((v) => v.number === want);
    if (exact) {
      targetVolumeId = exact.id;
    } else {
      const inserted = await withWriteLock(async () =>
        getDb()
          .insert(volumes)
          .values({ seriesId: input.targetSeriesId, number: want })
          .returning({ id: volumes.id }),
      );
      targetVolumeId = inserted[0]!.id;
    }
  } else if (input.chapterNumber !== null) {
    const want = input.chapterNumber;
    const wantSort = Number(want);
    const existing = await getDb()
      .select()
      .from(chapters)
      .where(eq(chapters.seriesId, input.targetSeriesId));
    const exact = existing.find((c) => c.numberText === want);
    if (exact) {
      targetChapterId = exact.id;
    } else {
      const inserted = await withWriteLock(async () =>
        getDb()
          .insert(chapters)
          .values({
            seriesId: input.targetSeriesId,
            numberText: want,
            numberSort: Number.isFinite(wantSort) ? wantSort : 0,
          })
          .returning({ id: chapters.id }),
      );
      targetChapterId = inserted[0]!.id;
    }
  }

  await rename(lf.path, newPath);

  await withWriteLock(async () => {
    await getDb()
      .update(libraryFiles)
      .set({
        seriesId: input.targetSeriesId,
        volumeId: targetVolumeId,
        chapterId: targetChapterId,
        path: newPath,
      })
      .where(eq(libraryFiles.id, input.libraryFileId));
  });

  return {
    oldPath: lf.path,
    newPath,
    libraryFileId: input.libraryFileId,
  };
}

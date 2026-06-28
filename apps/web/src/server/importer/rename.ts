import { existsSync, statSync } from 'node:fs';
import { rename, mkdir, rmdir, readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { withWriteLock } from '@/server/db/write-lock';
import { libraryFiles, volumes, chapters } from '@/server/db/schema';
import { getSeries, updateSeries } from '@/server/db/series';
import { groupPath } from '@/server/db/library-groups';
import { listLibraryFilesBySeries } from '@/server/db/library-files';
import { getAllNamingTemplates } from '@/server/db/settings/naming';
import { render, type NamingContext } from '@/server/naming/engine';
import { getLibraryDir } from '@/server/content-type/paths';

export type RenameItem = {
  libraryFileId: number;
  currentPath: string;
  proposedPath: string;
};

export type RenamePlan = {
  seriesId: number;
  folder: { current: string; proposed: string; changed: boolean };
  files: RenameItem[]; // only entries where currentPath !== proposedPath
};

export type ApplyRenameResult = {
  renamed: number;
  errors: { libraryFileId: number; message: string }[];
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

function extOf(path: string): string {
  const raw = extname(path);
  return (raw ? raw.replace(/^\./, '') : 'cbz').toLowerCase();
}

/**
 * Derive the current series folder from existing library files. Each file lives
 * directly under either the series dir or a `volume_subfolder` level beneath it,
 * so strip a single trailing subfolder level when the templates declare one.
 * Falls back to `series.rootPath` when there are no files.
 */
function deriveCurrentSeriesDir(
  filePaths: string[],
  hasVolumeSubfolder: boolean,
  rootPath: string,
): string {
  if (filePaths.length === 0) return rootPath;
  // Each file's series dir: its containing folder, minus one level when a
  // volume_subfolder is configured (the file sits under <seriesDir>/<subfolder>).
  // Strip per-file BEFORE the common-prefix reduction — stripping the prefix
  // afterwards would over-strip when files span multiple subfolders.
  const seriesDirOf = (p: string): string =>
    hasVolumeSubfolder ? dirname(dirname(p)) : dirname(p);
  let common = seriesDirOf(filePaths[0]!);
  for (const p of filePaths.slice(1)) {
    common = commonPrefixDir(common, seriesDirOf(p));
  }
  return common;
}

function commonPrefixDir(a: string, b: string): string {
  if (a === b) return a;
  const as = a.split('/');
  const bs = b.split('/');
  const out: string[] = [];
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    if (as[i] === bs[i]) out.push(as[i]!);
    else break;
  }
  return out.join('/') || '/';
}

async function resolveTargetCtx(
  lf: { volumeId: number | null; chapterId: number | null },
): Promise<{ ctx: NamingContext['target']; kind: 'volume' | 'chapter' | null }> {
  if (lf.volumeId !== null) {
    const rows = await getDb()
      .select({ number: volumes.number })
      .from(volumes)
      .where(eq(volumes.id, lf.volumeId));
    const v = rows[0];
    if (v) return { ctx: { volume: v.number }, kind: 'volume' };
  }
  if (lf.chapterId !== null) {
    const rows = await getDb()
      .select({ numberText: chapters.numberText })
      .from(chapters)
      .where(eq(chapters.id, lf.chapterId));
    const c = rows[0];
    if (c) return { ctx: { chapter: c.numberText }, kind: 'chapter' };
  }
  return { ctx: {}, kind: null };
}

export async function computeRenamePlan(seriesId: number): Promise<RenamePlan> {
  const series = await getSeries(seriesId);
  if (!series) throw new Error(`series ${seriesId} not found`);

  const templates = await getAllNamingTemplates(series.contentType);
  const libraryDir = await getLibraryDir(series.contentType);
  const seriesGroupPath = series.groupId != null ? await groupPath(series.groupId) : [];

  const folderCtx = buildContext(series, seriesGroupPath, {}, '');
  const proposedSeriesDir = join(libraryDir, render(templates.series_folder, folderCtx));

  const volumeSubfolderTemplate = templates.volume_subfolder.trim();
  const hasVolumeSubfolder = volumeSubfolderTemplate.length > 0;

  const files = await listLibraryFilesBySeries(seriesId);
  const currentSeriesDir = deriveCurrentSeriesDir(
    files.map((f) => f.path),
    hasVolumeSubfolder,
    series.rootPath,
  );

  const items: RenameItem[] = [];
  for (const lf of files) {
    const { ctx: targetCtx, kind } = await resolveTargetCtx(lf);
    if (kind === null) continue; // can't resolve a target → leave the file alone

    const ext = extOf(lf.path);
    const ctx = buildContext(series, seriesGroupPath, targetCtx, ext);
    const filename = render(kind === 'volume' ? templates.volume : templates.chapter, ctx);

    const dir = hasVolumeSubfolder
      ? join(proposedSeriesDir, render(volumeSubfolderTemplate, ctx))
      : proposedSeriesDir;
    const proposedPath = join(dir, filename);

    if (proposedPath !== lf.path) {
      items.push({ libraryFileId: lf.id, currentPath: lf.path, proposedPath });
    }
  }

  return {
    seriesId,
    folder: {
      current: currentSeriesDir,
      proposed: proposedSeriesDir,
      changed: currentSeriesDir !== proposedSeriesDir,
    },
    files: items,
  };
}

/**
 * Rewrite `library_files.path` for every file whose path begins with `oldDir`,
 * swapping the prefix to `newDir`. Used after an atomic series-folder rename.
 */
async function rewritePathPrefix(seriesId: number, oldDir: string, newDir: string): Promise<void> {
  const files = await listLibraryFilesBySeries(seriesId);
  await withWriteLock(async () => {
    const db = getDb();
    for (const f of files) {
      if (f.path === oldDir || f.path.startsWith(oldDir + '/')) {
        const next = newDir + f.path.slice(oldDir.length);
        await db.update(libraryFiles).set({ path: next }).where(eq(libraryFiles.id, f.id));
      }
    }
  });
}

async function removeEmptyDirUp(dir: string, stopAt: string): Promise<void> {
  let cur = dir;
  while (cur && cur !== stopAt && cur !== '/' && cur !== dirname(cur)) {
    try {
      const entries = await readdir(cur);
      if (entries.length > 0) break;
      await rmdir(cur);
    } catch {
      break;
    }
    cur = dirname(cur);
  }
}

export async function applyRenamePlan(seriesId: number): Promise<ApplyRenameResult> {
  const plan = await computeRenamePlan(seriesId);
  const series = await getSeries(seriesId);
  if (!series) throw new Error(`series ${seriesId} not found`);

  const errors: ApplyRenameResult['errors'] = [];
  let renamed = 0;

  const oldDir = plan.folder.current;
  const newDir = plan.folder.proposed;

  // Step 1: folder move.
  let folderMoved = false;
  if (plan.folder.changed) {
    if (existsSync(oldDir) && !existsSync(newDir)) {
      // Atomic dir rename carries untracked extras along.
      try {
        await mkdir(dirname(newDir), { recursive: true });
        await rename(oldDir, newDir);
        await rewritePathPrefix(seriesId, oldDir, newDir);
        folderMoved = true;
      } catch {
        // Fall back to per-file moves below.
      }
    }
    // If the proposed dir already exists, or the atomic rename failed, the
    // per-file loop below relocates each tracked file individually.
  }

  // After an atomic folder rename, tracked file paths were rewritten to the new
  // dir. Files whose only change was the directory are now correctly placed and
  // count as renamed; files that also need a filename change still appear in the
  // recomputed plan and are handled by the per-file loop below.
  let items: RenameItem[];
  if (folderMoved) {
    const remaining = (await computeRenamePlan(seriesId)).files;
    const remainingIds = new Set(remaining.map((r) => r.libraryFileId));
    renamed += plan.files.filter((f) => !remainingIds.has(f.libraryFileId)).length;
    items = remaining;
  } else {
    items = plan.files;
  }

  // Step 2: per-file moves.
  for (const item of items) {
    try {
      const src = item.currentPath;
      const dst = item.proposedPath;
      if (src === dst) continue;

      if (!existsSync(src)) {
        errors.push({ libraryFileId: item.libraryFileId, message: 'source file missing' });
        continue;
      }

      if (existsSync(dst)) {
        const stSrc = statSync(src);
        const stDst = statSync(dst);
        if (stSrc.ino === stDst.ino) {
          // Already the same file (e.g. hardlink) → record the path and skip.
          await withWriteLock(async () => {
            await getDb()
              .update(libraryFiles)
              .set({ path: dst })
              .where(eq(libraryFiles.id, item.libraryFileId));
          });
          continue;
        }
        errors.push({ libraryFileId: item.libraryFileId, message: 'destination exists' });
        continue;
      }

      await mkdir(dirname(dst), { recursive: true });
      await rename(src, dst);
      await withWriteLock(async () => {
        await getDb()
          .update(libraryFiles)
          .set({ path: dst })
          .where(eq(libraryFiles.id, item.libraryFileId));
      });
      await removeEmptyDirUp(dirname(src), newDir);
      renamed++;
    } catch (err) {
      errors.push({ libraryFileId: item.libraryFileId, message: (err as Error).message });
    }
  }

  // Step 3: cleanup empty old dirs + update series.rootPath.
  if (plan.folder.changed && oldDir !== newDir) {
    await removeEmptyDirUp(oldDir, dirname(newDir));
  }
  await updateSeries(seriesId, { rootPath: newDir });

  return { renamed, errors };
}

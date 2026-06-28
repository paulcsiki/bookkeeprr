import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, access, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';
import { createGroup } from '@/server/db/library-groups';
import { insertVolume } from '@/server/db/volumes';
import { insertChapter } from '@/server/db/chapters';
import { getDb } from '@/server/db/client';
import { libraryFiles, series as seriesTable } from '@/server/db/schema';
import { computeRenamePlan, applyRenamePlan } from '@/server/importer/rename';

let h: SeedHandle;
let tempRoot: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tempRoot = await mkdtemp(join(tmpdir(), 'rename-'));
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  process.env.BOOKKEEPRR_MEDIA_ROOT = tempRoot;
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

// Default manga: series_folder = '{group_path}/{series_title}',
// volume = '{series_title} - v{volume:00} [{group}].{ext}' → group empty.
const comicsDir = () => join(tempRoot, 'comics');

async function makeSeries(title: string, rootPath: string, groupId?: number): Promise<number> {
  return insertSeries({
    contentType: 'manga',
    titleEnglish: title,
    status: 'releasing',
    rootPath,
    qualityProfileId: h.qpId,
    groupId: groupId ?? null,
  });
}

async function addVolumeFile(
  seriesId: number,
  number: number,
  path: string,
  content = 'x',
): Promise<{ libraryFileId: number; volumeId: number }> {
  const volumeId = await insertVolume({ seriesId, number });
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, Buffer.from(content));
  const [lf] = await getDb()
    .insert(libraryFiles)
    .values({
      seriesId,
      volumeId,
      chapterId: null,
      path,
      sizeBytes: content.length,
      hashSha1: null,
      sourceReleaseId: null,
    })
    .returning({ id: libraryFiles.id });
  return { libraryFileId: lf!.id, volumeId };
}

describe('computeRenamePlan', () => {
  it('returns only changed files; volume target renders correctly', async () => {
    const sid = await makeSeries('My Series', join(comicsDir(), 'My Series'));
    // One correctly named, one wrong.
    await addVolumeFile(sid, 1, join(comicsDir(), 'My Series', 'My Series - v01.cbz'));
    await addVolumeFile(sid, 2, join(comicsDir(), 'My Series', 'wrongname.cbz'));

    const plan = await computeRenamePlan(sid);
    expect(plan.folder.changed).toBe(false);
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]!.proposedPath).toBe(
      join(comicsDir(), 'My Series', 'My Series - v02.cbz'),
    );
  });

  it('renders chapter targets correctly', async () => {
    const sid = await makeSeries('ChapSeries', join(comicsDir(), 'ChapSeries'));
    const chapterId = await insertChapter({ seriesId: sid, numberText: '12', numberSort: 12 });
    const path = join(comicsDir(), 'ChapSeries', 'old.cbz');
    await mkdir(join(comicsDir(), 'ChapSeries'), { recursive: true });
    await writeFile(path, Buffer.from('x'));
    await getDb()
      .insert(libraryFiles)
      .values({ seriesId: sid, volumeId: null, chapterId, path, sizeBytes: 1 });

    const plan = await computeRenamePlan(sid);
    // chapter template: '{series_title} - c{chapter:000} [{group}].{ext}'
    expect(plan.files[0]!.proposedPath).toBe(
      join(comicsDir(), 'ChapSeries', 'ChapSeries - c012.cbz'),
    );
  });

  it('respects volume_subfolder', async () => {
    const { setAllNamingTemplates } = await import('@/server/db/settings/naming');
    await setAllNamingTemplates('manga', { volume_subfolder: 'Volume {volume:00}' });
    const sid = await makeSeries('SubSeries', join(comicsDir(), 'SubSeries'));
    await addVolumeFile(
      sid,
      3,
      join(comicsDir(), 'SubSeries', 'Volume 03', 'wrong.cbz'),
    );

    const plan = await computeRenamePlan(sid);
    expect(plan.folder.changed).toBe(false);
    expect(plan.files[0]!.proposedPath).toBe(
      join(comicsDir(), 'SubSeries', 'Volume 03', 'SubSeries - v03.cbz'),
    );
  });

  it('derives the series dir correctly with volume_subfolder spanning multiple subfolders', async () => {
    const { setAllNamingTemplates } = await import('@/server/db/settings/naming');
    await setAllNamingTemplates('manga', { volume_subfolder: 'Volume {volume:00}' });
    const sid = await makeSeries('MultiSub', join(comicsDir(), 'MultiSub'));
    // Two already-correctly-named files in separate subfolders.
    await addVolumeFile(sid, 1, join(comicsDir(), 'MultiSub', 'Volume 01', 'MultiSub - v01.cbz'));
    await addVolumeFile(sid, 2, join(comicsDir(), 'MultiSub', 'Volume 02', 'MultiSub - v02.cbz'));

    const plan = await computeRenamePlan(sid);
    // The series dir must be MultiSub, NOT the comics root (the over-strip bug).
    expect(plan.folder.current).toBe(join(comicsDir(), 'MultiSub'));
    expect(plan.folder.changed).toBe(false);
    expect(plan.files).toHaveLength(0);
  });

  it('detects folder change when the series folder differs', async () => {
    const sid = await makeSeries('Renamed Title', join(comicsDir(), 'Old Folder'));
    await addVolumeFile(sid, 1, join(comicsDir(), 'Old Folder', 'Renamed Title - v01.cbz'));

    const plan = await computeRenamePlan(sid);
    expect(plan.folder.current).toBe(join(comicsDir(), 'Old Folder'));
    expect(plan.folder.proposed).toBe(join(comicsDir(), 'Renamed Title'));
    expect(plan.folder.changed).toBe(true);
  });

  it('prefixes the proposed series dir with the group path for a grouped series', async () => {
    // Default manga series_folder is '{group_path}/{series_title}'.
    const eng = await createGroup('Engineering', null);
    const arch = await createGroup('Architecture', eng.id);
    const sid = await makeSeries('Grouped', join(comicsDir(), 'Grouped'), arch.id);
    await addVolumeFile(sid, 1, join(comicsDir(), 'Grouped', 'Grouped - v01.cbz'));

    const plan = await computeRenamePlan(sid);
    const wantDir = join(comicsDir(), 'Engineering', 'Architecture', 'Grouped');
    expect(plan.folder.proposed).toBe(wantDir);
    expect(plan.folder.changed).toBe(true);
    expect(plan.files[0]!.proposedPath).toBe(join(wantDir, 'Grouped - v01.cbz'));
  });

  it('ungrouped series proposes a plain title dir — no group prefix, no leading slash', async () => {
    const sid = await makeSeries('Plain', join(comicsDir(), 'Plain'));
    await addVolumeFile(sid, 1, join(comicsDir(), 'Plain', 'Plain - v01.cbz'));

    const plan = await computeRenamePlan(sid);
    expect(plan.folder.proposed).toBe(join(comicsDir(), 'Plain'));
    expect(plan.folder.changed).toBe(false);
  });

  it('is a no-op when there are no files', async () => {
    const sid = await makeSeries('Empty', join(comicsDir(), 'Empty'));
    const plan = await computeRenamePlan(sid);
    expect(plan.files).toHaveLength(0);
    // No files → currentSeriesDir falls back to rootPath, matches proposed.
    expect(plan.folder.changed).toBe(false);
  });

  it('throws when the series is missing', async () => {
    await expect(computeRenamePlan(99999)).rejects.toThrow(/not found/i);
  });
});

describe('applyRenamePlan', () => {
  it('renames a volume file to the volume template', async () => {
    const sid = await makeSeries('My Series', join(comicsDir(), 'My Series'));
    const { libraryFileId } = await addVolumeFile(
      sid,
      2,
      join(comicsDir(), 'My Series', 'wrongname.cbz'),
    );

    const res = await applyRenamePlan(sid);
    expect(res.errors).toHaveLength(0);
    expect(res.renamed).toBe(1);

    const want = join(comicsDir(), 'My Series', 'My Series - v02.cbz');
    await expect(access(want)).resolves.toBeUndefined();
    const row = await getDb()
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.id, libraryFileId));
    expect(row[0]!.path).toBe(want);
  });

  it('moves files into the new folder, carrying an untracked sibling, and updates paths', async () => {
    const oldFolder = join(comicsDir(), 'Old Folder');
    const sid = await makeSeries('New Name', oldFolder);
    const { libraryFileId } = await addVolumeFile(
      sid,
      1,
      join(oldFolder, 'New Name - v01.cbz'),
    );
    // Untracked sibling (e.g. cover.jpg) that the dir rename should carry along.
    await writeFile(join(oldFolder, 'cover.jpg'), Buffer.from('img'));

    const res = await applyRenamePlan(sid);
    expect(res.errors).toHaveLength(0);
    expect(res.renamed).toBe(1);

    const newFolder = join(comicsDir(), 'New Name');
    await expect(access(join(newFolder, 'New Name - v01.cbz'))).resolves.toBeUndefined();
    await expect(access(join(newFolder, 'cover.jpg'))).resolves.toBeUndefined();
    await expect(access(oldFolder)).rejects.toThrow();

    const row = await getDb()
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.id, libraryFileId));
    expect(row[0]!.path).toBe(join(newFolder, 'New Name - v01.cbz'));

    const srow = await getDb().select().from(seriesTable).where(eq(seriesTable.id, sid));
    expect(srow[0]!.rootPath).toBe(newFolder);
  });

  it('moves a grouped series into its nested group-path dir', async () => {
    const eng = await createGroup('Engineering', null);
    const arch = await createGroup('Architecture', eng.id);
    const oldFolder = join(comicsDir(), 'GroupedMove');
    const sid = await makeSeries('GroupedMove', oldFolder, arch.id);
    const { libraryFileId } = await addVolumeFile(
      sid,
      1,
      join(oldFolder, 'GroupedMove - v01.cbz'),
    );

    const res = await applyRenamePlan(sid);
    expect(res.errors).toHaveLength(0);

    const newFolder = join(comicsDir(), 'Engineering', 'Architecture', 'GroupedMove');
    await expect(access(join(newFolder, 'GroupedMove - v01.cbz'))).resolves.toBeUndefined();
    const row = await getDb()
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.id, libraryFileId));
    expect(row[0]!.path).toBe(join(newFolder, 'GroupedMove - v01.cbz'));
    const srow = await getDb().select().from(seriesTable).where(eq(seriesTable.id, sid));
    expect(srow[0]!.rootPath).toBe(newFolder);
  });

  it('skips a same-inode destination (already correct)', async () => {
    const folder = join(comicsDir(), 'Inode');
    const sid = await makeSeries('Inode', folder);
    const wrong = join(folder, 'wrong.cbz');
    const { libraryFileId } = await addVolumeFile(sid, 1, wrong);
    // Create the proposed path as a hardlink to the source (same inode).
    const correct = join(folder, 'Inode - v01.cbz');
    await link(wrong, correct);

    const res = await applyRenamePlan(sid);
    expect(res.errors).toHaveLength(0);
    // Same-inode dest → path updated, not counted as a fresh rename.
    const row = await getDb()
      .select()
      .from(libraryFiles)
      .where(eq(libraryFiles.id, libraryFileId));
    expect(row[0]!.path).toBe(correct);
  });

  it('records an error for a different-inode destination, still applies others', async () => {
    const folder = join(comicsDir(), 'Conflict');
    const sid = await makeSeries('Conflict', folder);
    const { libraryFileId: blockedId } = await addVolumeFile(sid, 1, join(folder, 'a-wrong.cbz'));
    const { libraryFileId: okId } = await addVolumeFile(sid, 2, join(folder, 'b-wrong.cbz'));
    // Pre-create v01's proposed path with different content (different inode).
    await writeFile(join(folder, 'Conflict - v01.cbz'), Buffer.from('occupied'));

    const res = await applyRenamePlan(sid);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.libraryFileId).toBe(blockedId);
    expect(res.errors[0]!.message).toMatch(/destination exists/i);
    expect(res.renamed).toBe(1);

    const okRow = await getDb().select().from(libraryFiles).where(eq(libraryFiles.id, okId));
    expect(okRow[0]!.path).toBe(join(folder, 'Conflict - v02.cbz'));
  });

  it('removes the now-empty old directory after a per-file move', async () => {
    const { setAllNamingTemplates } = await import('@/server/db/settings/naming');
    // Force a per-file path move (subfolder change) without a folder rename.
    await setAllNamingTemplates('manga', { volume_subfolder: 'Vol {volume:00}' });
    const folder = join(comicsDir(), 'Cleanup');
    const sid = await makeSeries('Cleanup', folder);
    // File currently in a stale subfolder.
    await addVolumeFile(sid, 1, join(folder, 'Stale Sub', 'Cleanup - v01.cbz'));

    const res = await applyRenamePlan(sid);
    expect(res.errors).toHaveLength(0);
    await expect(
      access(join(folder, 'Vol 01', 'Cleanup - v01.cbz')),
    ).resolves.toBeUndefined();
    // Old subfolder gone.
    await expect(access(join(folder, 'Stale Sub'))).rejects.toThrow();
  });
});

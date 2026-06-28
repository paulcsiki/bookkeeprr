import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, access, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertSeries } from '@/server/db/series';
import { createGroup } from '@/server/db/library-groups';
import { rerouteLibraryFile } from '@/server/importer/reroute';
import { getDb } from '@/server/db/client';
import { libraryFiles, volumes } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

let h: SeedHandle;
let tempRoot: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tempRoot = await mkdtemp(join(tmpdir(), 'm14-reroute-'));
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  process.env.BOOKKEEPRR_MEDIA_ROOT = tempRoot;
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

describe('rerouteLibraryFile', () => {
  it('moves a file from series A to series B with new volume number', async () => {
    const sidA = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Source',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'Source'),
      qualityProfileId: h.qpId,
    });
    const sidB = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Destination',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'Destination'),
      qualityProfileId: h.qpId,
    });

    const srcPath = join(tempRoot, 'comics', 'Source', 'Source - v01.cbz');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(tempRoot, 'comics', 'Source'), { recursive: true });
    await writeFile(srcPath, Buffer.from('x'.repeat(100)));
    const [vol] = await getDb()
      .insert(volumes)
      .values({ seriesId: sidA, number: 1 })
      .returning({ id: volumes.id });
    const [lf] = await getDb()
      .insert(libraryFiles)
      .values({
        seriesId: sidA,
        volumeId: vol!.id,
        chapterId: null,
        path: srcPath,
        sizeBytes: 100,
        hashSha1: null,
        sourceReleaseId: null,
      })
      .returning({ id: libraryFiles.id });

    const result = await rerouteLibraryFile({
      libraryFileId: lf!.id,
      targetSeriesId: sidB,
      volumeNumber: 5,
      chapterNumber: null,
    });

    expect(result.libraryFileId).toBe(lf!.id);
    expect(result.oldPath).toBe(srcPath);
    expect(result.newPath).toContain('Destination');
    expect(result.newPath).toContain('v05');

    await expect(access(srcPath)).rejects.toThrow();
    const s = await stat(result.newPath);
    expect(s.size).toBe(100);

    const updated = await getDb().select().from(libraryFiles).where(eq(libraryFiles.id, lf!.id));
    expect(updated[0]?.seriesId).toBe(sidB);
    expect(updated[0]?.path).toBe(result.newPath);
  });

  it('routes into the group-path dir when the target series is grouped', async () => {
    const eng = await createGroup('Engineering', null);
    const arch = await createGroup('Architecture', eng.id);
    const sidA = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Source',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'Source'),
      qualityProfileId: h.qpId,
    });
    const sidB = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Destination',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'Destination'),
      qualityProfileId: h.qpId,
      groupId: arch.id,
    });

    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(tempRoot, 'comics', 'Source'), { recursive: true });
    const srcPath = join(tempRoot, 'comics', 'Source', 'Source - v01.cbz');
    await writeFile(srcPath, Buffer.from('x'));
    const [vol] = await getDb()
      .insert(volumes)
      .values({ seriesId: sidA, number: 1 })
      .returning({ id: volumes.id });
    const [lf] = await getDb()
      .insert(libraryFiles)
      .values({
        seriesId: sidA,
        volumeId: vol!.id,
        chapterId: null,
        path: srcPath,
        sizeBytes: 1,
        hashSha1: null,
        sourceReleaseId: null,
      })
      .returning({ id: libraryFiles.id });

    const result = await rerouteLibraryFile({
      libraryFileId: lf!.id,
      targetSeriesId: sidB,
      volumeNumber: 5,
      chapterNumber: null,
    });

    // Default manga series_folder '{group_path}/{series_title}' → nested group dirs.
    expect(result.newPath).toBe(
      join(tempRoot, 'comics', 'Engineering', 'Architecture', 'Destination', 'Destination - v05.cbz'),
    );
    const s = await stat(result.newPath);
    expect(s.size).toBe(1);
  });

  it('throws on destination collision', async () => {
    const sidA = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Source',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'Source'),
      qualityProfileId: h.qpId,
    });
    const sidB = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'Destination',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'Destination'),
      qualityProfileId: h.qpId,
    });

    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(tempRoot, 'comics', 'Source'), { recursive: true });
    const srcPath = join(tempRoot, 'comics', 'Source', 'Source - v01.cbz');
    await writeFile(srcPath, Buffer.from('x'));

    const destDir = join(tempRoot, 'comics', 'Destination');
    await mkdir(destDir, { recursive: true });
    // Default manga volume template: '{series_title} - v{volume:00} [{group}].{ext}'
    // With no group, renders to 'Destination - v05.cbz'.
    const destExisting = join(destDir, 'Destination - v05.cbz');
    await writeFile(destExisting, Buffer.from('existing'));

    const [vol] = await getDb()
      .insert(volumes)
      .values({ seriesId: sidA, number: 1 })
      .returning({ id: volumes.id });
    const [lf] = await getDb()
      .insert(libraryFiles)
      .values({
        seriesId: sidA,
        volumeId: vol!.id,
        chapterId: null,
        path: srcPath,
        sizeBytes: 1,
        hashSha1: null,
        sourceReleaseId: null,
      })
      .returning({ id: libraryFiles.id });

    await expect(
      rerouteLibraryFile({
        libraryFileId: lf!.id,
        targetSeriesId: sidB,
        volumeNumber: 5,
        chapterNumber: null,
      }),
    ).rejects.toThrow(/destination exists/i);
  });

  it('throws "not found" when libraryFileId does not exist', async () => {
    const sidB = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'X',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'X'),
      qualityProfileId: h.qpId,
    });
    await expect(
      rerouteLibraryFile({
        libraryFileId: 99999,
        targetSeriesId: sidB,
        volumeNumber: 1,
        chapterNumber: null,
      }),
    ).rejects.toThrow(/library file not found/i);
  });
});

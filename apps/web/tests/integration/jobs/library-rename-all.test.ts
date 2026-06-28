import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import { enqueueJob, getJob } from '@/server/db/jobs';
import { runOnce } from '@/server/jobs/runner';
import { libraryRenameAllDescriptor } from '@/server/jobs/kinds/library-rename-all';
import * as rename from '@/server/importer/rename';

let h: SeedHandle;
let tempRoot: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tempRoot = await mkdtemp(join(tmpdir(), 'rename-all-'));
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  process.env.BOOKKEEPRR_MEDIA_ROOT = tempRoot;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(tempRoot, { recursive: true, force: true });
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

const comicsDir = () => join(tempRoot, 'comics');

async function makeSeries(title: string): Promise<number> {
  return insertSeries({
    contentType: 'manga',
    titleEnglish: title,
    status: 'releasing',
    rootPath: join(comicsDir(), title),
    qualityProfileId: h.qpId,
  });
}

async function addVolumeFile(seriesId: number, number: number, path: string): Promise<void> {
  const volumeId = await insertVolume({ seriesId, number });
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, Buffer.from('x'));
  await getDb()
    .insert(libraryFiles)
    .values({ seriesId, volumeId, chapterId: null, path, sizeBytes: 1 });
}

type Aggregate = {
  seriesProcessed: number;
  seriesChanged: number;
  filesRenamed: number;
  errors: { seriesId: number; message: string }[];
};

async function runAndResult(): Promise<Aggregate> {
  await enqueueJob('library_rename_all', {});
  const ran = await runOnce(libraryRenameAllDescriptor);
  expect(ran).toBe('ran');
  // The job id is the most recent one; fetch by listing.
  const { listJobsByKind } = await import('@/server/db/jobs');
  const rows = await listJobsByKind('library_rename_all');
  const latest = rows[rows.length - 1]!;
  const job = await getJob(latest.id);
  expect(job!.status).toBe('completed');
  return JSON.parse(job!.resultJson!) as Aggregate;
}

describe('library_rename_all', () => {
  it('renames the misnamed series, leaves the correct one, aggregates counts', async () => {
    // Series A: one misnamed file.
    const a = await makeSeries('Alpha');
    await addVolumeFile(a, 2, join(comicsDir(), 'Alpha', 'wrongname.cbz'));

    // Series B: already correctly named.
    const b = await makeSeries('Beta');
    await addVolumeFile(b, 1, join(comicsDir(), 'Beta', 'Beta - v01.cbz'));

    const result = await runAndResult();

    expect(result.seriesProcessed).toBe(2);
    expect(result.filesRenamed).toBe(1);
    expect(result.seriesChanged).toBe(1);
    expect(result.errors).toHaveLength(0);

    await expect(
      access(join(comicsDir(), 'Alpha', 'Alpha - v02.cbz')),
    ).resolves.toBeUndefined();
    await expect(
      access(join(comicsDir(), 'Beta', 'Beta - v01.cbz')),
    ).resolves.toBeUndefined();
  });

  it('records a per-series error without aborting the rest', async () => {
    const a = await makeSeries('Alpha');
    await addVolumeFile(a, 2, join(comicsDir(), 'Alpha', 'wrongname.cbz'));

    const boom = await makeSeries('Boom');
    await addVolumeFile(boom, 1, join(comicsDir(), 'Boom', 'also-wrong.cbz'));

    // Make applyRenamePlan throw for the Boom series only.
    const real = rename.applyRenamePlan;
    vi.spyOn(rename, 'applyRenamePlan').mockImplementation(async (seriesId: number) => {
      if (seriesId === boom) throw new Error('disk on fire');
      return real(seriesId);
    });

    const result = await runAndResult();

    expect(result.seriesProcessed).toBe(2);
    expect(result.filesRenamed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.seriesId).toBe(boom);
    expect(result.errors[0]!.message).toMatch(/disk on fire/);

    // The healthy series was still renamed.
    await expect(
      access(join(comicsDir(), 'Alpha', 'Alpha - v02.cbz')),
    ).resolves.toBeUndefined();
  });

  it('is a no-op (zero counts) on an empty library', async () => {
    const result = await runAndResult();
    expect(result.seriesProcessed).toBe(0);
    expect(result.filesRenamed).toBe(0);
    expect(result.seriesChanged).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertSeries } from '@/server/db/series';
import { getDb } from '@/server/db/client';
import { libraryFiles, volumes } from '@/server/db/schema';
import { POST } from '@/app/api/library-files/[id]/reroute/route';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { LibraryFileRerouteResponse } from '@/server/openapi/schemas/library';

let h: SeedHandle;
let tempRoot: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tempRoot = await mkdtemp(join(tmpdir(), 'm14-reroute-api-'));
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  process.env.BOOKKEEPRR_MEDIA_ROOT = tempRoot;
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
  if (originalMediaRoot === undefined) delete process.env.BOOKKEEPRR_MEDIA_ROOT;
  else process.env.BOOKKEEPRR_MEDIA_ROOT = originalMediaRoot;
  h.cleanup();
});

describe('POST /api/library-files/[id]/reroute', () => {
  it('reroutes a file to a new series + volume', async () => {
    const sidA = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'A',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'A'),
      qualityProfileId: h.qpId,
    });
    const sidB = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'B',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'B'),
      qualityProfileId: h.qpId,
    });
    await mkdir(join(tempRoot, 'comics', 'A'), { recursive: true });
    const srcPath = join(tempRoot, 'comics', 'A', 'A - v01.cbz');
    await writeFile(srcPath, Buffer.from('x'.repeat(50)));
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
        sizeBytes: 50,
        hashSha1: null,
        sourceReleaseId: null,
      })
      .returning({ id: libraryFiles.id });

    const res = await POST(
      new Request(`http://localhost/api/library-files/${lf!.id}/reroute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seriesId: sidB, volumeNumber: 3 }),
      }),
      { params: Promise.resolve({ id: String(lf!.id) }) },
    );
    expect(res.status).toBe(200);
    await expectShape(LibraryFileRerouteResponse, res, 'POST /api/library-files/{id}/reroute');
    const body = (await res.json()) as { oldPath: string; newPath: string };
    expect(body.oldPath).toBe(srcPath);
    expect(body.newPath).toContain('B');
    expect(body.newPath).toContain('v03');
  });

  it('returns 400 on missing volumeNumber and chapterNumber', async () => {
    const res = await POST(
      new Request('http://localhost/api/library-files/1/reroute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seriesId: 1 }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/library-files/{id}/reroute');
  });

  it('returns 404 on unknown library file id', async () => {
    const sidB = await insertSeries({
      contentType: 'manga',
      titleEnglish: 'B',
      status: 'releasing',
      rootPath: join(tempRoot, 'comics', 'B'),
      qualityProfileId: h.qpId,
    });
    const res = await POST(
      new Request('http://localhost/api/library-files/999/reroute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seriesId: sidB, volumeNumber: 1 }),
      }),
      { params: Promise.resolve({ id: '999' }) },
    );
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'POST /api/library-files/{id}/reroute');
  });
});

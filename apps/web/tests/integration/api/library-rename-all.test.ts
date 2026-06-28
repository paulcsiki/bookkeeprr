import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET, POST } from '@/app/api/library/rename-all/route';
import type { LibraryRenamePreview } from '@/app/api/library/rename-all/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { listJobsByKind } from '@/server/db/jobs';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import { expectShape } from '../../helpers/assert-spec';
import { MessageResponse } from '@/server/openapi/schemas/common';
import { JobEnqueuedResponse } from '@/server/openapi/schemas/jobs';
import { LibraryRenamePreviewResponse } from '@/server/openapi/schemas/library';

let h: SeedHandle;
let tempRoot: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tempRoot = await mkdtemp(join(tmpdir(), 'rename-all-api-'));
  originalMediaRoot = process.env.BOOKKEEPRR_MEDIA_ROOT;
  process.env.BOOKKEEPRR_MEDIA_ROOT = tempRoot;
});
afterEach(async () => {
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

function getReq(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/library/rename-all', { method: 'GET', headers });
}

async function adminCookie(): Promise<string> {
  const u = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22-correct'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

async function userCookie(): Promise<string> {
  const u = await insertUser({
    username: 'bob',
    passwordHash: await hashPassword('hunter22-correct'),
    role: 'user',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: u.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

function req(cookie: string | null): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie !== null) headers.cookie = cookie;
  return new Request('http://localhost/api/library/rename-all', { method: 'POST', headers });
}

describe('POST /api/library/rename-all', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/library/rename-all');
  });

  it('rejects non-admin users with 403', async () => {
    const res = await POST(req(await userCookie()));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'POST /api/library/rename-all');
  });

  it('enqueues a library_rename_all job and returns the jobId', async () => {
    const before = await listJobsByKind('library_rename_all');
    expect(before).toHaveLength(0);

    const res = await POST(req(await adminCookie()));
    expect(res.status).toBe(202);
    await expectShape(JobEnqueuedResponse, res, 'POST /api/library/rename-all');
    const body = (await res.json()) as { jobId: number };
    expect(typeof body.jobId).toBe('number');

    const after = await listJobsByKind('library_rename_all');
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(body.jobId);
    expect(after[0]!.status).toBe('pending');
  });
});

describe('GET /api/library/rename-all (preview)', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'GET /api/library/rename-all');
  });

  it('rejects non-admin users with 403', async () => {
    const res = await GET(getReq(await userCookie()));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'GET /api/library/rename-all');
  });

  it('returns only series with pending changes and aggregate counts', async () => {
    // Series A: one misnamed file → has a change.
    const a = await makeSeries('Alpha');
    await addVolumeFile(a, 2, join(comicsDir(), 'Alpha', 'wrongname.cbz'));

    // Series B: already correctly named → no change. (Default volume template
    // is '{series_title} - v{volume:00} [{group}].{ext}'; an empty group
    // collapses the bracket segment, so the on-disk name carries no '[]'.)
    const b = await makeSeries('Beta');
    await addVolumeFile(b, 1, join(comicsDir(), 'Beta', 'Beta - v01.cbz'));

    const res = await GET(getReq(await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(LibraryRenamePreviewResponse, res, 'GET /api/library/rename-all');
    const body = (await res.json()) as LibraryRenamePreview;

    expect(body.seriesChanged).toBe(1);
    expect(body.series).toHaveLength(1);
    expect(body.series[0]!.seriesId).toBe(a);
    expect(body.series[0]!.title).toBe('Alpha');
    // At least the misnamed file is reported.
    expect(body.series[0]!.files.length).toBeGreaterThanOrEqual(1);
    expect(body.totalChanges).toBeGreaterThanOrEqual(1);
  });

  it('returns zero changes for an already-organized library', async () => {
    const res = await GET(getReq(await adminCookie()));
    expect(res.status).toBe(200);
    await expectShape(LibraryRenamePreviewResponse, res, 'GET /api/library/rename-all');
    const body = (await res.json()) as LibraryRenamePreview;
    expect(body.series).toHaveLength(0);
    expect(body.seriesChanged).toBe(0);
    expect(body.totalChanges).toBe(0);
  });
});

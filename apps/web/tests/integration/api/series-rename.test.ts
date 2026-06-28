import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { GET, POST } from '@/app/api/series/[id]/rename/route';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { getDb } from '@/server/db/client';
import { libraryFiles } from '@/server/db/schema';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
let tempRoot: string;
let originalMediaRoot: string | undefined;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
  tempRoot = await mkdtemp(join(tmpdir(), 'rename-api-'));
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

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

/** A series with one misnamed volume file → a non-empty rename plan. */
async function seedMisnamedSeries(): Promise<{ seriesId: number; libraryFileId: number }> {
  const seriesId = await insertSeries({
    contentType: 'manga',
    titleEnglish: 'My Series',
    status: 'releasing',
    rootPath: join(comicsDir(), 'My Series'),
    qualityProfileId: h.qpId,
  });
  const volumeId = await insertVolume({ seriesId, number: 2 });
  const path = join(comicsDir(), 'My Series', 'wrongname.cbz');
  await mkdir(join(comicsDir(), 'My Series'), { recursive: true });
  await writeFile(path, Buffer.from('x'));
  const [lf] = await getDb()
    .insert(libraryFiles)
    .values({ seriesId, volumeId, chapterId: null, path, sizeBytes: 1 })
    .returning({ id: libraryFiles.id });
  return { seriesId, libraryFileId: lf!.id };
}

function getReq(id: string, cookie?: string): Request {
  return new Request(`http://test/api/series/${id}/rename`, {
    method: 'GET',
    headers: cookie ? { cookie } : {},
  });
}
function postReq(id: string, cookie?: string): Request {
  return new Request(`http://test/api/series/${id}/rename`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/series/[id]/rename', () => {
  it('rejects non-admins', async () => {
    const { seriesId } = await seedMisnamedSeries();
    const res = await GET(getReq(String(seriesId)), params(String(seriesId)));
    expect([401, 403]).toContain(res.status);
  });

  it('returns the rename plan', async () => {
    const cookie = await adminCookie();
    const { seriesId } = await seedMisnamedSeries();
    const res = await GET(getReq(String(seriesId), cookie), params(String(seriesId)));
    expect(res.status).toBe(200);
    const plan = (await res.json()) as {
      seriesId: number;
      folder: { changed: boolean };
      files: { proposedPath: string }[];
    };
    expect(plan.seriesId).toBe(seriesId);
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]!.proposedPath).toBe(
      join(comicsDir(), 'My Series', 'My Series - v02.cbz'),
    );
  });

  it('400s for a bad id', async () => {
    const cookie = await adminCookie();
    const res = await GET(getReq('abc', cookie), params('abc'));
    expect(res.status).toBe(400);
  });

  it('404s for a missing series', async () => {
    const cookie = await adminCookie();
    const res = await GET(getReq('99999', cookie), params('99999'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/series/[id]/rename', () => {
  it('rejects non-admins', async () => {
    const { seriesId } = await seedMisnamedSeries();
    const res = await POST(postReq(String(seriesId)), params(String(seriesId)));
    expect([401, 403]).toContain(res.status);
  });

  it('applies the plan: renames the file on disk and updates the path', async () => {
    const cookie = await adminCookie();
    const { seriesId, libraryFileId } = await seedMisnamedSeries();
    const res = await POST(postReq(String(seriesId), cookie), params(String(seriesId)));
    expect(res.status).toBe(200);
    const summary = (await res.json()) as {
      renamed: number;
      errors: unknown[];
    };
    expect(summary.renamed).toBe(1);
    expect(summary.errors).toHaveLength(0);

    const want = join(comicsDir(), 'My Series', 'My Series - v02.cbz');
    await expect(access(want)).resolves.toBeUndefined();
    const row = await getDb().select().from(libraryFiles).where(eq(libraryFiles.id, libraryFileId));
    expect(row[0]!.path).toBe(want);
  });

  it('400s for a bad id', async () => {
    const cookie = await adminCookie();
    const res = await POST(postReq('-1', cookie), params('-1'));
    expect(res.status).toBe(400);
  });

  it('404s for a missing series', async () => {
    const cookie = await adminCookie();
    const res = await POST(postReq('99999', cookie), params('99999'));
    expect(res.status).toBe(404);
  });
});

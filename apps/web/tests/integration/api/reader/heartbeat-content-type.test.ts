import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { seedDb, type SeedHandle } from '../../helpers/seed';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertLibraryFile } from '@/server/db/library-files';
import { getDailyStatsByType } from '@/server/db/reading-stats';
import { POST as HEARTBEAT_POST } from '@/app/api/reader/stats/heartbeat/route';

let h: SeedHandle;
let userId: number;
let cookie: string;
let mediaRoot: string;
let fileId: number;

beforeEach(async () => {
  // A real media root so resolveReadable's path-safety check passes.
  mediaRoot = mkdtempSync(join(tmpdir(), 'bk-media-'));
  process.env.BOOKKEEPRR_MEDIA_ROOT = mediaRoot;

  h = await seedDb({ skipDefaultSeries: true });
  userId = (
    await insertUser({
      username: 'alice',
      passwordHash: 'x',
      role: 'admin',
      mustChangePassword: false,
    })
  ).id;
  const s = await createSession({ userId, userAgent: null, ipAddress: null });
  cookie = `bookkeeprr_session=${s.token}`;

  // An ebook series + volume + a real .epub file under the media root.
  const seriesId = await insertSeries({
    anilistId: 4242,
    status: 'releasing',
    rootPath: join(mediaRoot, 'Ebook Series'),
    qualityProfileId: h.qpId,
    titleEnglish: 'Ebook Series',
    contentType: 'ebook',
  });
  const volumeId = await insertVolume({ seriesId, number: 1, title: 'v1' });
  const filePath = join(mediaRoot, 'book.epub');
  writeFileSync(filePath, 'PK'); // minimal placeholder; resolveReadable only stats it
  fileId = await insertLibraryFile({ seriesId, volumeId, path: filePath, sizeBytes: 2 });
});

afterEach(() => {
  h.cleanup();
  rmSync(mediaRoot, { recursive: true, force: true });
  delete process.env.BOOKKEEPRR_MEDIA_ROOT;
});

function reqJson(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/reader/stats/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('heartbeat content-type attribution', () => {
  it('attributes time to the readable series content type', async () => {
    const res = await HEARTBEAT_POST(reqJson({ seconds: 30, readableKey: `page:file:${fileId}` }));
    expect(res.status).toBe(200);

    const rows = await getDailyStatsByType(userId, '2000-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contentType).toBe('ebook');
    expect(rows[0]!.secondsRead).toBe(30);
  });

  it('falls back to "other" when no readableKey is sent', async () => {
    const res = await HEARTBEAT_POST(reqJson({ seconds: 20 }));
    expect(res.status).toBe(200);
    const rows = await getDailyStatsByType(userId, '2000-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.contentType).toBe('other');
  });

  it('falls back to "other" for an unresolvable readableKey', async () => {
    const res = await HEARTBEAT_POST(reqJson({ seconds: 15, readableKey: 'page:file:999999' }));
    expect(res.status).toBe(200);
    const rows = await getDailyStatsByType(userId, '2000-01-01');
    expect(rows[0]!.contentType).toBe('other');
  });
});

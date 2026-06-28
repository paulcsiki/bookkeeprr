import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../integration/helpers/seed';
import { insertUser } from '@/server/db/users';
import { hashPassword } from '@/server/auth/password';
import { issueMobileToken } from '@/server/mobile/tokens';
import { insertSeries } from '@/server/db/series';
import { insertVolume } from '@/server/db/volumes';
import { insertLibraryFile } from '@/server/db/library-files';
import { GET } from '@/app/api/library/summary/route';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { LibrarySummaryResponse } from '@/server/openapi/schemas/library';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});

afterEach(() => {
  h.cleanup();
});

function mkReq(opts: { bearer?: string }): Request {
  const headers: Record<string, string> = {};
  if (opts.bearer !== undefined) headers.authorization = `Bearer ${opts.bearer}`;
  return new Request('http://localhost/api/library/summary', { method: 'GET', headers });
}

async function makeUserAndToken() {
  const user = await insertUser({
    username: 'summary-user',
    passwordHash: await hashPassword('hunter22'),
    role: 'user',
    mustChangePassword: false,
  });
  const { token } = await issueMobileToken(user.id);
  return { user, token };
}

describe('GET /api/library/summary', () => {
  it('returns 401 with no bearer header', async () => {
    const res = await GET(mkReq({}));
    expect(res.status).toBe(401);
    await expectShape(ErrorResponse, res, 'GET /api/library/summary');
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('returns all-zeros when no series exist', async () => {
    const { token } = await makeUserAndToken();
    const res = await GET(mkReq({ bearer: token }));
    expect(res.status).toBe(200);
    await expectShape(LibrarySummaryResponse, res, 'GET /api/library/summary');
    const body = (await res.json()) as { total: number; monitored: number; missing: number };
    expect(body.total).toBe(0);
    expect(body.monitored).toBe(0);
    expect(body.missing).toBe(0);
  });

  it('counts total and distinguishes monitored vs unmonitored', async () => {
    const { token } = await makeUserAndToken();
    // 2 monitored, 1 unmonitored (monitoring='none')
    await insertSeries({
      anilistId: 1,
      status: 'releasing',
      rootPath: '/media/s1',
      qualityProfileId: h.qpId,
      titleEnglish: 'Series A',
      monitoring: 'all',
    });
    await insertSeries({
      anilistId: 2,
      status: 'releasing',
      rootPath: '/media/s2',
      qualityProfileId: h.qpId,
      titleEnglish: 'Series B',
      monitoring: 'future',
    });
    await insertSeries({
      anilistId: 3,
      status: 'finished',
      rootPath: '/media/s3',
      qualityProfileId: h.qpId,
      titleEnglish: 'Series C',
      monitoring: 'none',
    });

    const res = await GET(mkReq({ bearer: token }));
    expect(res.status).toBe(200);
    await expectShape(LibrarySummaryResponse, res, 'GET /api/library/summary');
    const body = (await res.json()) as { total: number; monitored: number; missing: number };
    expect(body.total).toBe(3);
    expect(body.monitored).toBe(2);
    // no volumes set → missing = 0 (totalVolumes is null for all three)
    expect(body.missing).toBe(0);
  });

  it('counts missing correctly — series with fewer imports than totalVolumes', async () => {
    const { token } = await makeUserAndToken();

    // Series A: 3 volumes total, only 2 imported → MISSING
    const s1 = await insertSeries({
      anilistId: 10,
      status: 'releasing',
      rootPath: '/media/s1',
      qualityProfileId: h.qpId,
      titleEnglish: 'Series A',
      monitoring: 'all',
      totalVolumes: 3,
    });
    const v1a = await insertVolume({ seriesId: s1, number: 1 });
    const v1b = await insertVolume({ seriesId: s1, number: 2 });
    await insertLibraryFile({ seriesId: s1, volumeId: v1a, path: '/media/s1/v1.cbz', sizeBytes: 100 });
    await insertLibraryFile({ seriesId: s1, volumeId: v1b, path: '/media/s1/v2.cbz', sizeBytes: 100 });

    // Series B: 2 volumes total, 2 imported → NOT MISSING
    const s2 = await insertSeries({
      anilistId: 11,
      status: 'finished',
      rootPath: '/media/s2',
      qualityProfileId: h.qpId,
      titleEnglish: 'Series B',
      monitoring: 'all',
      totalVolumes: 2,
    });
    const v2a = await insertVolume({ seriesId: s2, number: 1 });
    const v2b = await insertVolume({ seriesId: s2, number: 2 });
    await insertLibraryFile({ seriesId: s2, volumeId: v2a, path: '/media/s2/v1.cbz', sizeBytes: 100 });
    await insertLibraryFile({ seriesId: s2, volumeId: v2b, path: '/media/s2/v2.cbz', sizeBytes: 100 });

    // Series C: monitoring=none, 5 volumes, 0 imported → NOT COUNTED as missing (unmonitored)
    const s3 = await insertSeries({
      anilistId: 12,
      status: 'releasing',
      rootPath: '/media/s3',
      qualityProfileId: h.qpId,
      titleEnglish: 'Series C',
      monitoring: 'none',
      totalVolumes: 5,
    });
    void s3;

    const res = await GET(mkReq({ bearer: token }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; monitored: number; missing: number };
    expect(body.total).toBe(3);
    expect(body.monitored).toBe(2);
    expect(body.missing).toBe(1); // only Series A
  });
});

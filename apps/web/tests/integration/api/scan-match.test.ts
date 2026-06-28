import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import * as alClient from '@/server/integrations/anilist/client';
import { insertScanMatch, getScanMatchByPath } from '@/server/db/scan-matches';
import { POST } from '@/app/api/scan/groups/[dirHash]/match/route';
import { dirHash } from '@/lib/dir-hash';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { ScanGroupMatchResponse } from '@/server/openapi/schemas/scan';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb({ anilistId: 999 });
  vi.restoreAllMocks();
});
afterEach(() => h.cleanup());

function req(body: unknown): Request {
  return new Request('http://x/match', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/scan/groups/[dirHash]/match', () => {
  it('overrides aniListMatch + proposedSeriesId for every row in the group', async () => {
    const dir = '/media/comics/Wrong Match';
    await insertScanMatch({
      filePath: dir + '/v01.cbz',
      proposedSeriesId: null,
      parserDebugJson: JSON.stringify({ aniListMatch: { anilistId: 1 } }),
    });
    await insertScanMatch({
      filePath: dir + '/v02.cbz',
      proposedSeriesId: null,
      parserDebugJson: JSON.stringify({ aniListMatch: { anilistId: 1 } }),
    });
    vi.spyOn(alClient, 'getManga').mockResolvedValue({
      anilistId: 999,
      titleRomaji: 'Real Series',
      titleEnglish: null,
      titleNative: null,
      coverUrl: 'https://example/c.jpg',
      status: 'releasing',
      format: 'MANGA',
      startYear: 2020,
      description: null,
      totalVolumes: null,
      totalChapters: null,
    });

    const res = await POST(req({ anilistId: 999 }), {
      params: Promise.resolve({ dirHash: dirHash(dir) }),
    });
    expect(res.status).toBe(200);
    await expectShape(ScanGroupMatchResponse, res, 'POST /api/scan/groups/{dirHash}/match');

    const r1 = await getScanMatchByPath(dir + '/v01.cbz');
    const r2 = await getScanMatchByPath(dir + '/v02.cbz');
    for (const r of [r1, r2]) {
      const debug = JSON.parse(r!.parserDebugJson) as { aniListMatch: { anilistId: number } };
      expect(debug.aniListMatch.anilistId).toBe(999);
      expect(r!.proposedSeriesId).toBe(h.seriesId);
    }
  });

  it('404 when dirHash matches no pending rows', async () => {
    const res = await POST(req({ anilistId: 1 }), {
      params: Promise.resolve({ dirHash: 'deadbeef' }),
    });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'POST /api/scan/groups/{dirHash}/match');
  });

  it('400 when anilistId is missing or non-numeric', async () => {
    const res = await POST(req({}), { params: Promise.resolve({ dirHash: 'aaaa' }) });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'POST /api/scan/groups/{dirHash}/match');
  });
});

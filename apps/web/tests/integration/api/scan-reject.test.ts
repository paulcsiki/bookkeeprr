import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { insertScanMatch, getScanMatchByPath } from '@/server/db/scan-matches';
import { POST } from '@/app/api/scan/groups/[dirHash]/reject/route';
import { dirHash } from '@/lib/dir-hash';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { ScanGroupRejectResponse } from '@/server/openapi/schemas/scan';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('POST /api/scan/groups/[dirHash]/reject', () => {
  it('marks every pending row in the group rejected', async () => {
    const dir = '/media/comics/Junk';
    await insertScanMatch({ filePath: dir + '/v01.cbz' });
    await insertScanMatch({ filePath: dir + '/v02.cbz' });
    const res = await POST(new Request('http://x/reject', { method: 'POST' }), {
      params: Promise.resolve({ dirHash: dirHash(dir) }),
    });
    expect(res.status).toBe(200);
    await expectShape(ScanGroupRejectResponse, res, 'POST /api/scan/groups/{dirHash}/reject');
    const body = (await res.json()) as { rejectedCount: number };
    expect(body.rejectedCount).toBe(2);
    const r1 = await getScanMatchByPath(dir + '/v01.cbz');
    expect(r1?.status).toBe('rejected');
    expect(r1?.reviewedAt).toBeTruthy();
  });

  it('404 when group has no pending rows', async () => {
    const res = await POST(new Request('http://x/reject', { method: 'POST' }), {
      params: Promise.resolve({ dirHash: 'cafecafe' }),
    });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'POST /api/scan/groups/{dirHash}/reject');
  });
});

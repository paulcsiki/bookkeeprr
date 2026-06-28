import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { enqueueJob } from '@/server/db/jobs';
import { GET } from '@/app/api/jobs/[id]/route';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { JobRow } from '@/server/openapi/schemas/jobs';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

describe('GET /api/jobs/[id]', () => {
  it('returns the job row', async () => {
    const jobId = await enqueueJob('library_scan', { rootPath: '/tmp/x' });
    const res = await GET(new Request('http://x/api/jobs/' + jobId), {
      params: Promise.resolve({ id: String(jobId) }),
    });
    expect(res.status).toBe(200);
    await expectShape(JobRow, res, 'GET /api/jobs/{id}');
    const body = (await res.json()) as { id: number; status: string; kind: string };
    expect(body.id).toBe(jobId);
    expect(body.status).toBe('pending');
    expect(body.kind).toBe('library_scan');
  });

  it('404 when job id does not exist', async () => {
    const res = await GET(new Request('http://x/api/jobs/99999'), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(res.status).toBe(404);
    await expectShape(ErrorResponse, res, 'GET /api/jobs/{id}');
  });

  it('400 when id is not a positive integer', async () => {
    const res = await GET(new Request('http://x/api/jobs/abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/jobs/{id}');
  });

  it('400 when id contains non-digit characters (e.g., "1abc")', async () => {
    const res = await GET(new Request('http://x/api/jobs/1abc'), {
      params: Promise.resolve({ id: '1abc' }),
    });
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/jobs/{id}');
  });
});

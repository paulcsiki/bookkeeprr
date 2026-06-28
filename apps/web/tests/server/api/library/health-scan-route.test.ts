import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../../../integration/helpers/seed';
import { POST } from '@/app/api/library/health-scan/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';
import { enqueueJob, listJobsByKind } from '@/server/db/jobs';
import { expectShape } from '../../../helpers/assert-spec';
import { MessageResponse } from '@/server/openapi/schemas/common';
import { JobConflictResponse, JobEnqueuedResponse } from '@/server/openapi/schemas/jobs';

let h: SeedHandle;

beforeEach(async () => {
  h = await seedDb({ skipDefaultSeries: true });
});
afterEach(() => {
  h.cleanup();
});

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
  return new Request('http://localhost/api/library/health-scan', { method: 'POST', headers });
}

describe('POST /api/library/health-scan', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const res = await POST(req(null));
    expect(res.status).toBe(401);
    await expectShape(MessageResponse, res, 'POST /api/library/health-scan');
  });

  it('rejects non-admin users with 403', async () => {
    const res = await POST(req(await userCookie()));
    expect(res.status).toBe(403);
    await expectShape(MessageResponse, res, 'POST /api/library/health-scan');
  });

  it('enqueues a library_health_scan job and returns the jobId', async () => {
    const before = await listJobsByKind('library_health_scan');
    expect(before).toHaveLength(0);

    const res = await POST(req(await adminCookie()));
    expect(res.status).toBe(202);
    await expectShape(JobEnqueuedResponse, res, 'POST /api/library/health-scan');
    const body = (await res.json()) as { jobId: number };
    expect(typeof body.jobId).toBe('number');

    const after = await listJobsByKind('library_health_scan');
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(body.jobId);
    expect(after[0]!.status).toBe('pending');
  });

  it('returns 409 when a scan is already pending/running', async () => {
    const existing = await enqueueJob('library_health_scan', {});

    const res = await POST(req(await adminCookie()));
    expect(res.status).toBe(409);
    await expectShape(JobConflictResponse, res, 'POST /api/library/health-scan');
    const body = (await res.json()) as { existingJobId: number };
    expect(body.existingJobId).toBe(existing);

    // No second job was created.
    const all = await listJobsByKind('library_health_scan');
    expect(all).toHaveLength(1);
  });
});
